import { ref } from 'vue'
import { TYPE, isProtocolMessage, requestMessage } from './protocol.js'
import { createPendingRequests } from './pendingRequests.js'

export function createRendererBridge() {
  const status = ref('connecting')
  const pending = createPendingRequests()

  let iframeWindow = null
  let rendererOrigin = null
  let onReady = null

  function handleMessage(event) {
    if (event.source !== iframeWindow) return
    if (!rendererOrigin || event.origin !== rendererOrigin) return

    const msg = event.data
    if (!isProtocolMessage(msg)) return
    if (msg.type !== TYPE.RESPONSE || typeof msg.requestId !== 'string') return

    if (msg.ok) pending.resolve(msg.requestId, msg.result)
    else pending.reject(msg.requestId, msg.error?.message || 'Renderer error')
  }

  function send(type, payload) {
    if (!iframeWindow || !rendererOrigin) {
      return Promise.reject(new Error('Renderer bridge is not attached'))
    }

    const { requestId, promise } = pending.create(type)
    iframeWindow.postMessage(requestMessage(type, requestId, payload), rendererOrigin)
    return promise
  }

  async function handshake() {
    try {
      await send(TYPE.HELLO, null)
      status.value = 'ready'
      onReady?.()
    } catch {
      // A reload triggers a fresh attach/handshake cycle.
    }
  }

  function attach(win, origin, opts = {}) {
    detach()
    iframeWindow = win
    rendererOrigin = origin
    onReady = opts.onReady ?? null
    status.value = 'connecting'
    window.addEventListener('message', handleMessage)
    handshake()
  }

  function detach() {
    window.removeEventListener('message', handleMessage)
    pending.rejectAll('Renderer bridge disconnected')
    iframeWindow = null
    rendererOrigin = null
    status.value = 'connecting'
  }

  return {
    status,
    attach,
    detach,
    loadComposition: comp => send(TYPE.LOAD_COMPOSITION, comp),
    renderFrame: frame => send(TYPE.RENDER_FRAME, { frame }),
    getMetadata: () => send(TYPE.GET_METADATA, null),
  }
}
