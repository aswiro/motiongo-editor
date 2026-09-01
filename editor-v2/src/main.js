import { createApp } from 'vue'
import App from './App.vue'
import { undo, redo, canUndo, canRedo, deleteLayer } from './state/composition.js'
import { selectedId } from './state/selection.js'
import {
  currentFrame,
  setFrame,
  togglePlay,
  pause,
  playheadPointerSeekActive,
} from './state/timeline.js'
import { globalPlayheadArrowDelta } from './state/timelineKeyboard.js'
import { totalFrames, fps } from './state/composition.js'

const app = createApp(App)
app.mount('#app')

function isArrowShortcutControl(target) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, button, [contenteditable]:not([contenteditable="false"])'))
}

window.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

  if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    if (canUndo.value) undo()
    e.preventDefault()
    return
  }

  if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
      (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
    if (canRedo.value) redo()
    e.preventDefault()
    return
  }

  if (typing) return

  if (e.key === ' ') {
    togglePlay(totalFrames.value, fps.value)
    e.preventDefault()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedId.value) deleteLayer(selectedId.value)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (isArrowShortcutControl(e.target)) return

    const deltaFrames = globalPlayheadArrowDelta(
      e,
      selectedId.value,
      playheadPointerSeekActive.value,
    )

    if (deltaFrames === null) {
      e.preventDefault()
      return
    }

    pause()
    setFrame(currentFrame.value + deltaFrames, totalFrames.value)
    e.preventDefault()
  } else if (e.key === 'Home') {
    pause()
    setFrame(0, totalFrames.value)
  } else if (e.key === 'End') {
    pause()
    setFrame(totalFrames.value - 1, totalFrames.value)
  }
})
