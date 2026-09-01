# MotionGo Editor

MotionGo is a composition-based motion design editor with deterministic frame-by-frame video rendering.

> **Public showcase:** this repository is a sanitized portfolio version of a larger private development repository. Third-party research materials, customer/vendor documents, generated outputs, private working notes, and historical artifacts are intentionally excluded.

## What MotionGo demonstrates

- Vue 3 motion-design editor with a visual canvas
- Global timeline and layer-based composition model
- Text, shape, image, SVG, group, and background layers
- Direct move / resize / rotate editing
- Inspector controls for transform, timing, and animation
- Undo / redo with gesture transactions
- Local project autosave and recovery
- Asset registry and managed media workflow
- Deterministic frame-by-frame rendering
- Playwright-driven frame capture
- FFmpeg H.264 MP4 encoding
- ffprobe output validation
- Optional double-render SHA256 checks for deterministic output

## Current render pipeline

```text
Editor (Vue 3)
   |
   +--> Preview bridge --> Renderer (Vue 3)
   |
   +--> Render API
            |
            v
      Composition JSON
            |
            v
        Renderer
            |
            v
    Playwright PNG frames
            |
            v
          FFmpeg
            |
            v
      Validated MP4
```

The canonical V2 model is:

```text
Composition -> Global Timeline -> Layers
```

Authoritative time is frame-based, making the renderer suitable for repeatable automated video generation.

## AI roadmap

MotionGo is being extended toward an **AI-assisted video automation workflow**.

Planned capabilities include:

- AI-generated video scenarios and scene structures from a user brief
- AI-assisted composition planning for scenes, layers, timing, and transitions
- AI-generated animation parameters for text, shapes, images, and SVG assets
- Automatic conversion of an AI-generated scenario into MotionGo Composition JSON
- AI-assisted timing, motion presets, and transition selection
- Human review and manual editing before final rendering
- Deterministic rendering of AI-generated compositions through the existing MotionGo renderer

Planned workflow:

```text
User brief
   |
   v
AI Scenario Generator
   |
   v
Scene / Timeline Plan
   |
   v
AI Animation Generator
   |
   v
MotionGo Composition JSON
   |
   v
Visual Editor
   |
   v
Deterministic Renderer
   |
   v
MP4
```

These AI capabilities are **roadmap items**, not presented as completed features.

## Technology

- Vue 3
- JavaScript
- Vite
- Playwright
- FFmpeg / ffprobe
- Node.js
- Vitest / Node test runner

## Repository scope

This public repository focuses on the active V2 editor/rendering architecture. The original private repository remains the development source of truth and contains materials that are not appropriate for public distribution.

Excluded from this showcase include:

- third-party research and scraped website content
- presentations and PDFs belonging to external companies
- render outputs and generated frames
- archived legacy experiments
- private AI-agent working instructions
- local environment files and runtime artifacts

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the planned AI-assisted scenario and animation pipeline.

## License

This repository is currently published as a portfolio showcase. No open-source license is granted unless a license file is added explicitly.
