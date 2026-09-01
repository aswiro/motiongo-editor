'use strict'

const http = require('http')
const fs = require('fs')
const { spawn } = require('child_process')
const { join } = require('path')
const { DEFAULT_MAX_BYTES, createManagedMediaService } = require('./managed-media-service.js')

const MANAGED_MEDIA_JSON_METADATA_ALLOWANCE = 16 * 1024
const STDERR_TAIL_LIMIT = 16 * 1024

function base64LengthForBytes(byteLength) {
  return Math.ceil(byteLength / 3) * 4
}

function managedMediaTransportBodyLimit(maxBytes = DEFAULT_MAX_BYTES) {
  return base64LengthForBytes(maxBytes) + MANAGED_MEDIA_JSON_METADATA_ALLOWANCE
}

const BODY_LIMIT = managedMediaTransportBodyLimit(DEFAULT_MAX_BYTES)

function sanitize(name) {
  return String(name || 'output').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'output'
}

function appendBoundedTail(current, chunk, limit = STDERR_TAIL_LIMIT) {
  const next = current + String(chunk)
  return next.length > limit ? next.slice(-limit) : next
}

function readBoundedJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0
    let exceeded = false
    const chunks = []
    req.on('data', chunk => {
      if (exceeded) return
      size += chunk.length
      if (size > limit) {
        exceeded = true
        reject(new Error('Request body too large'))
        req.resume()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => {
      if (exceeded) return
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new Error('Invalid JSON')) }
    })
  })
}

function mediaError(res, statusCode, error) {
  if (res.writableEnded || res.destroyed || res.headersSent) return
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error }))
}

async function handleManagedMediaRequest(req, res, mediaService, bodyLimit) {
  if (/(?:\.\.|%2e)/i.test(req.url)) { mediaError(res, 400, 'Managed media path is invalid'); return }
  const url = new URL(req.url, 'http://127.0.0.1')
  const origin = req.headers.origin
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):517[45]$/.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  try {
    if (req.method === 'POST' && url.pathname === '/api/media') {
      const body = await readBoundedJson(req, bodyLimit)
      if (typeof body.dataBase64 !== 'string' || body.dataBase64.length > base64LengthForBytes(mediaService.maxBytes)) throw new Error('Managed media size exceeds limit')
      const result = mediaService.ingest({ filename: body.filename, mimeType: body.mimeType, bytes: Buffer.from(body.dataBase64, 'base64') })
      res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); return
    }
    const apiMatch = /^\/api\/media\/([^/]+)$/.exec(url.pathname)
    if (req.method === 'GET' && apiMatch) {
      const result = mediaService.lookup(apiMatch[1])
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); return
    }
    const mediaMatch = /^\/media\/([^/]+)$/.exec(url.pathname)
    if (req.method === 'GET' && mediaMatch) {
      const media = mediaService.read(mediaMatch[1])
      res.writeHead(200, { 'Content-Type': media.contentType, 'Content-Length': media.bytes.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=31536000, immutable' })
      res.end(media.bytes); return
    }
    mediaError(res, 404, 'Managed media route not found')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Managed media request failed'
    const status = /not found/.test(message) ? 404 : /too large|size exceeds/.test(message) ? 413 : 400
    mediaError(res, status, message)
  }
}

function createRenderServer(options = {}) {
  const rootDir = options.rootDir || __dirname
  const framesDir = options.framesDir || join(rootDir, 'frames-v2')
  const outputDir = options.outputDir || join(rootDir, 'output')
  const bodyLimit = options.bodyLimit ?? BODY_LIMIT
  const stderrTailLimit = options.stderrTailLimit ?? STDERR_TAIL_LIMIT
  const logChildOutput = options.logChildOutput !== false
  const managedMediaService = options.managedMediaService || createManagedMediaService({ homeDir: options.homeDir })
  const spawnRender = options.spawnRender || (tmpFile => spawn(process.execPath, ['render-v2.js', tmpFile], { cwd: rootDir }))

  let activeRender = false

  function sendJson(res, statusCode, payload) {
    if (res.writableEnded || res.destroyed) return
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  }

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/media') || req.url.startsWith('/media/')) {
      handleManagedMediaRequest(req, res, managedMediaService, bodyLimit).catch(() => mediaError(res, 500, 'Managed media request failed'))
      return
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    if (req.method !== 'POST' || req.url !== '/api/render') {
      res.writeHead(404); res.end(); return
    }

    if (activeRender) {
      sendJson(res, 409, { ok: false, error: 'Render already in progress' })
      return
    }

    activeRender = true
    let settled = false
    let body = ''
    let bodySize = 0
    let tmpFile = null
    let child = null
    let errTail = ''

    function releaseLock() { activeRender = false }
    function cleanupTmp() { if (tmpFile) { try { fs.unlinkSync(tmpFile) } catch {} tmpFile = null } }
    function settle(statusCode, payload, { respond = true } = {}) {
      if (settled) return
      settled = true
      cleanupTmp()
      releaseLock()
      if (respond) sendJson(res, statusCode, payload)
    }

    req.on('data', chunk => {
      if (settled) return
      bodySize += chunk.length
      if (bodySize > bodyLimit) { settle(413, { ok: false, error: 'Request body too large' }); return }
      body += chunk
    })

    req.on('aborted', () => { if (!child) settle(499, { ok: false, error: 'Request aborted' }, { respond: false }) })
    req.on('error', () => { if (!child) settle(400, { ok: false, error: 'Request error' }, { respond: false }) })

    req.on('end', () => {
      if (settled) return
      let comp
      try { comp = JSON.parse(body) } catch { settle(400, { ok: false, error: 'Invalid JSON' }); return }

      const baseName = sanitize(comp?.composition?.name)
      tmpFile = join(framesDir, `${baseName}.json`)
      const finalMp4 = join(outputDir, `${baseName}.mp4`)

      try {
        fs.mkdirSync(framesDir, { recursive: true })
        fs.writeFileSync(tmpFile, body)
        child = spawnRender(tmpFile)
        if (!child || typeof child.once !== 'function') throw new Error('spawnRender did not return a child process')
      } catch (err) {
        settle(500, { ok: false, error: 'Failed to start render', details: err.message })
        return
      }

      child.stdout?.on('data', d => { if (logChildOutput) process.stdout.write(d) })
      child.stderr?.on('data', d => {
        if (logChildOutput) process.stderr.write(d)
        errTail = appendBoundedTail(errTail, d, stderrTailLimit)
      })
      child.once('error', err => settle(500, { ok: false, error: 'Spawn error', details: err.message }))
      child.once('close', code => {
        if (code === 0) settle(200, { ok: true, output: finalMp4 })
        else settle(500, { ok: false, error: 'Render failed', details: errTail.split('\n').filter(Boolean).slice(-5).join('\n') })
      })
    })
  })

  server.isRenderActive = () => activeRender
  return server
}

function startDefaultServer() {
  const server = createRenderServer()
  server.listen(5176, '127.0.0.1', () => console.log('\n  [RENDER-API] internal render API on 127.0.0.1:5176\n'))
  return server
}

if (require.main === module) startDefaultServer()

module.exports = { BODY_LIMIT, STDERR_TAIL_LIMIT, sanitize, appendBoundedTail, createRenderServer, startDefaultServer }
