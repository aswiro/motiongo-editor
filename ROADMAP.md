# MotionGo Roadmap

MotionGo is evolving from a deterministic motion-design editor into an AI-assisted video automation platform.

## Current foundation

- Composition-based visual editor
- Global frame-based timeline
- Layer model for text, shapes, images, SVG, groups, and backgrounds
- Preview renderer
- Playwright frame capture
- FFmpeg encoding and ffprobe validation
- Deterministic double-render verification

## Planned AI workflow

```text
User brief
   ↓
AI Scenario Generator
   ↓
Scene / Timeline Plan
   ↓
AI Animation Generator
   ↓
MotionGo Composition JSON
   ↓
Visual Editor / Human Review
   ↓
Deterministic Renderer
   ↓
Validated MP4
```

## Planned capabilities

### AI scenario generation

Generate an initial video structure from a natural-language brief:

- scenes and story beats
- approximate duration
- text blocks and visual intent
- asset requirements
- scene order and pacing
- transition intent

### AI composition planning

Translate the scenario into a structured plan suitable for MotionGo:

- layer creation
- start frame and duration
- placement and hierarchy
- asset references
- timeline structure
- transition boundaries

### AI animation generation

Generate editable animation parameters instead of opaque rendered video:

- entrance / exit motion
- position, scale, rotation, and opacity animation
- timing and easing
- staggered layer motion
- motion presets
- transition selection

### Human-in-the-loop editing

AI output should remain editable in the existing MotionGo editor before final rendering. The deterministic renderer remains the final export authority.

## Product direction

The target is not a black-box text-to-video system. MotionGo aims to combine AI generation with a structured, inspectable, editable Composition JSON model and reproducible rendering.

> Roadmap items describe planned development and are not presented as completed features.
