import { ref, computed } from 'vue'
import { renderConfig } from '../config/render.config.js'
import { composition, totalFrames } from './composition.js'
import { clamp } from './math.js'

export const currentFrame = ref(0)
export const playbackSpeed = ref(renderConfig.playbackSpeed)

export const effectiveFrame = computed(() =>
  currentFrame.value * playbackSpeed.value
)

export function setFrame(n) {
  if (!composition.value) {
    throw new Error('Composition not loaded. Call __LOAD_COMPOSITION__ first.')
  }

  currentFrame.value = clamp(Math.round(n), 0, totalFrames.value - 1)
}

export function setPlaybackSpeed(speed) {
  playbackSpeed.value = speed
}
