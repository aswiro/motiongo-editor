# MotionGo Architecture

MotionGo V2 separates editing, preview, rendering, and export responsibilities.

## Components

### Editor

Vue 3 desktop-oriented editing workspace. The editor owns user interaction and Composition editing, including:

- layers
- timeline
- inspector controls
- assets
- local project state
- undo / redo
- render requests

### Renderer

A separate Vue 3 application that evaluates the canonical Composition model at an exact frame. The renderer is the visual authority used by both preview and export.

### Render API

A loopback-only Node.js HTTP bridge. It accepts a Composition JSON document and invokes the export pipeline while enforcing a single active render job.

### Export pipeline

`render-v2.js` drives Chromium through Playwright, requests each exact frame from the Renderer, captures PNG frames, encodes them with FFmpeg, and validates the final MP4 with ffprobe.

Optional `--double-check` mode repeats the frame render and compares SHA256 hashes to detect non-deterministic output.

## Canonical data flow

```text
Composition JSON
      |
      +------> Editor
      |          |
      |          +--> human editing
      |
      +------> Renderer
                 |
                 +--> frame N
                 +--> frame N+1
                 +--> ...
                         |
                         v
                  Playwright capture
                         |
                         v
                       PNGs
                         |
                         v
                       FFmpeg
                         |
                         v
                    validated MP4
```

## AI integration direction

Future AI modules are expected to generate or modify structured Composition data rather than bypassing the editor/rendering model.

```text
Natural-language brief
        |
        v
AI scenario planning
        |
        v
AI animation planning
        |
        v
Composition JSON
        |
        +--> human review/editing
        |
        v
Deterministic renderer
```

This keeps AI output inspectable and editable while preserving a reproducible final rendering path.
