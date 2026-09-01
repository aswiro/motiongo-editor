'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const MANAGED_MEDIA_LOOPBACK_HOST = '127.0.0.1'
const MANAGED_MEDIA_DIRECTORY = path.join('.motiongo', 'managed-media')

function resolveManagedMediaRoot({ homeDir = os.homedir() } = {}) {
  if (typeof homeDir !== 'string' || !path.isAbsolute(homeDir)) {
    throw new Error('Managed-media storage requires an absolute home directory')
  }

  return path.join(homeDir, MANAGED_MEDIA_DIRECTORY)
}

function createManagedMediaBoundary({ homeDir, fsImpl = fs } = {}) {
  const root = resolveManagedMediaRoot({ homeDir })

  return Object.freeze({
    bindHost: MANAGED_MEDIA_LOOPBACK_HOST,
    root,
    initializeRoot() {
      try {
        fsImpl.mkdirSync(root, { recursive: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Managed-media storage root initialization failed: ${message}`, { cause: error })
      }
      return root
    },
  })
}

module.exports = {
  MANAGED_MEDIA_LOOPBACK_HOST,
  createManagedMediaBoundary,
  resolveManagedMediaRoot,
}
