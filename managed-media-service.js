'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { createManagedMediaBoundary } = require('./managed-media.js')

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024
const ID_PATTERN = /^media_[a-f0-9]{64}$/
const TYPE_BY_EXTENSION = Object.freeze({
  '.png': { contentType: 'image/png', signature: bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  '.jpg': { contentType: 'image/jpeg', canonicalExtension: '.jpg', signature: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  '.jpeg': { contentType: 'image/jpeg', canonicalExtension: '.jpg', signature: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  '.webp': { contentType: 'image/webp', signature: bytes => bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from('RIFF')) && bytes.subarray(8, 12).equals(Buffer.from('WEBP')) },
  '.svg': { contentType: 'image/svg+xml', signature: isSafeSvg },
})

function isSafeSvg(bytes) {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '').trim()
  return /^<\?xml[\s\S]*?\?>\s*<svg\b/i.test(text) || /^<svg\b/i.test(text)
    ? !/(<script\b|<foreignObject\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:))/i.test(text)
    : false
}

function normalizedExtension(filename) {
  return path.extname(String(filename || '')).toLowerCase()
}

function mediaId(bytes) {
  return `media_${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

function assertId(id) {
  if (!ID_PATTERN.test(String(id))) throw new Error('Managed media ID is invalid')
}

function createManagedMediaService({ homeDir, fsImpl = fs, maxBytes = DEFAULT_MAX_BYTES, publicBaseUrl = 'http://127.0.0.1:5176' } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Managed media size limit is invalid')
  const boundary = createManagedMediaBoundary({ homeDir, fsImpl })
  const root = boundary.initializeRoot()

  function sourceUrl(id) {
    return `${publicBaseUrl.replace(/\/$/, '')}/media/${id}`
  }

  function locate(id) {
    assertId(id)
    let names
    try { names = fsImpl.readdirSync(root) } catch (error) {
      throw new Error(`Managed-media storage is unreadable: ${error.message}`, { cause: error })
    }
    const matches = names.filter(name => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(png|jpg|jpeg|webp|svg)$`).test(name))
    if (matches.length === 0) throw new Error('Managed media not found')
    if (matches.length !== 1) throw new Error('Managed media is corrupt')
    return path.join(root, matches[0])
  }

  function metadata(id, filePath, bytes) {
    const type = TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()]
    if (!type || !type.signature(bytes)) throw new Error('Managed media is corrupt')
    return { id, contentType: type.contentType, byteSize: bytes.length, sourceUrl: sourceUrl(id) }
  }

  function ingest({ filename, mimeType, bytes }) {
    if (!Buffer.isBuffer(bytes)) throw new Error('Managed media content must be binary')
    if (bytes.length === 0 || bytes.length > maxBytes) throw new Error('Managed media size exceeds limit')
    const extension = normalizedExtension(filename)
    const type = TYPE_BY_EXTENSION[extension]
    if (!type || mimeType !== type.contentType) throw new Error('Managed media type is unsupported or mismatched')
    if (!type.signature(bytes)) throw new Error('Managed media content does not match its declared type')

    const id = mediaId(bytes)
    let existingPath
    try { existingPath = locate(id) } catch (error) {
      if (error.message !== 'Managed media not found') throw error
    }
    if (existingPath) return metadata(id, existingPath, fsImpl.readFileSync(existingPath))

    const finalPath = path.join(root, `${id}${type.canonicalExtension || extension}`)
    if (fsImpl.existsSync(finalPath)) return metadata(id, finalPath, fsImpl.readFileSync(finalPath))
    const tempPath = path.join(root, `.${id}.${process.pid}.${crypto.randomUUID()}.tmp`)
    let descriptor
    try {
      descriptor = fsImpl.openSync(tempPath, 'wx', 0o600)
      fsImpl.writeFileSync(descriptor, bytes)
      fsImpl.fsyncSync(descriptor)
      fsImpl.closeSync(descriptor)
      descriptor = undefined
      fsImpl.renameSync(tempPath, finalPath)
    } catch (error) {
      if (descriptor !== undefined) try { fsImpl.closeSync(descriptor) } catch {}
      try { fsImpl.unlinkSync(tempPath) } catch {}
      throw new Error(`Managed-media atomic write failed: ${error.message}`, { cause: error })
    }
    return metadata(id, finalPath, bytes)
  }

  function lookup(id) {
    const filePath = locate(id)
    return metadata(id, filePath, fsImpl.readFileSync(filePath))
  }

  function read(id) {
    const filePath = locate(id)
    const bytes = fsImpl.readFileSync(filePath)
    const { contentType } = metadata(id, filePath, bytes)
    return { bytes, contentType }
  }

  return Object.freeze({ bindHost: boundary.bindHost, root, maxBytes, ingest, lookup, read, sourceUrl })
}

module.exports = { DEFAULT_MAX_BYTES, ID_PATTERN, TYPE_BY_EXTENSION, createManagedMediaService }
