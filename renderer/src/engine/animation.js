import { easings } from './math.js'

const PRESETS = {
  fade: (phase, t) => ({ opacity: t }),
  'fade-up': (phase, t) => ({ opacity: t, dy: (1 - t) * 80 }),
  'fade-down': (phase, t) => ({ opacity: t, dy: (1 - t) * -80 }),
  'slide-left': (phase, t) => ({ dx: (1 - t) * -120 }),
  'slide-right': (phase, t) => ({ dx: (1 - t) * 120 }),
  'scale-in': (phase, t) => ({ scale: 0.5 + t * 0.5, opacity: t }),
  pop: (phase, t) => ({ scale: t, opacity: t }),
  bounce: (phase, t) => ({ scale: t }),
  reveal: (phase, t) => ({ clipProgress: t }),
  'blur-in': (phase, t) => ({ opacity: t, blur: (1 - t) * 12 }),
}

export function computeAnimDelta(layer, effectiveFrame) {
  const anim = layer.animation
  if (!anim || (!anim.enter && !anim.exit)) return null

  const { startFrame, durationFrames } = layer
  const relFrame = effectiveFrame - startFrame
  if (relFrame < 0 || relFrame >= durationFrames) return null

  const enterDur = anim.enter?.durationFrames ?? 0
  const exitDur = anim.exit?.durationFrames ?? 0

  let animDef
  let rawT
  let phase

  if (anim.enter && relFrame < enterDur) {
    phase = 'enter'
    animDef = anim.enter
    rawT = relFrame / enterDur
  } else if (anim.exit && relFrame >= durationFrames - exitDur) {
    phase = 'exit'
    animDef = anim.exit
    rawT = (relFrame - (durationFrames - exitDur)) / exitDur
  } else {
    return null
  }

  const easeFn = easings[animDef.easing] ?? easings.easeOutQuad
  const t = phase === 'enter' ? easeFn(rawT) : 1 - easeFn(rawT)
  const presetFn = PRESETS[animDef.preset] ?? PRESETS.fade

  return presetFn(phase, t)
}
