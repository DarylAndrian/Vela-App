# Picture Connector — Technical Documentation

Developer-facing documentation for the Picture Connector: a client-side tool
that joins screenshots/images into a single composite picture with connecting
arrows, then exports or copies the result.

## Overview

Picture Connector accepts images (drag-drop, paste, or file browse), normalizes
them (decode → shrink → compress), lets the user reorder/remove them, computes a
row or wrapped-row layout with arrows centered in the gaps, and draws the
composite to a canvas for live preview, download (PNG/JPEG), or clipboard copy.

- **Route**: `/picture-connector` (lazy-loaded in `src/Root.tsx`,
  `PictureConnectorPage`)
- **Navigation**: Sidebar → *Auxiliary* → "Picture Connector"
  (`src/components/Sidebar.tsx`, **no permission required**)
- **Command Palette**: entry `picture-connector`
- **Everything runs in the browser** — no upload, no backend, no persistence.
  Images live only in memory (object URLs) for the session.

## File map

| File | Responsibility |
| --- | --- |
| `src/screens/PictureConnector/index.tsx` | Page: upload intake, thumbnail strip, settings panel, live preview, export/copy, small helpers (image cache, export blob) |
| `src/screens/PictureConnector/compose.ts` | Pure layout math (`computeLayout`) + canvas drawing (`drawComposite`, `drawArrow`) |
| `src/screens/PictureConnector/imageProcessing.ts` | `normalizeImage()`: decode, downscale, compress within limits |

## Architecture / data flow

```
Files (drop / paste / browse)
  └─ addFiles() ── 2 parallel workers ──▶ normalizeImage(file)
        │                                    (decode → shrink → compress)
        ▼
  images: ProcessedImage[]  ── dnd-kit reorder / remove
        │
        ▼  (debounced 150ms on any change)
  computeLayout(images, options) ──▶ CompositeLayout { rects, arrows, scale }
        │
        ▼
  drawComposite(canvas, sources, layout, options)   ← live preview canvas
        │
        ├─ Download ──▶ exportBlob() ──▶ PNG or JPEG file
        └─ Copy ─────▶ canvasToBlob('image/png') ──▶ clipboard.write()
```

State is in-memory React state only. `ProcessedImage.url` is an object URL
(`URL.createObjectURL`) that is revoked on removal/clear/unmount
(`releaseImage`), so there are no leaks across long sessions.

## Data model

### `ProcessedImage` (`imageProcessing.ts`)

```ts
{ id: string /* crypto.randomUUID */, blob: Blob, url: string /* object URL */,
  width: number, height: number, name: string }
```

### `ComposeOptions` / `ConnectorSettings` (`compose.ts`, `index.tsx`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `mode` | `'row'` | `'row'` = one line of images; `'wrap'` = rows of `perRow` |
| `perRow` | `4` | Images per row when wrapping |
| `matchHeights` | `true` | Scale each image in a row to the row's shortest height |
| `gap` | `80` | Space between images (and between rows) — arrows live here |
| `padding` | `32` | Outer canvas padding |
| `arrowColor` | `#18181b` | Arrow stroke/fill color |
| `arrowThickness` | `5` | Shaft line width |
| `arrowHeadSize` | `22` | Arrowhead length (width = 0.72 × length) |
| `background` | `#ffffff` | Any CSS color or `'transparent'` |
| `format` | `'png'` | Export format: `png` or `jpeg` |
| `quality` | `0.92` | JPEG quality |

### `CompositeLayout` (`compose.ts`)

`{ width, height /* logical */, pixelWidth, pixelHeight, scale,
canvasLimited, rects: ImageRect[], arrows: ArrowSegment[] }` — logical size is
pre-limit; `scale` maps logical → actual canvas pixels.

## Layout algorithm (`computeLayout`)

1. Split images into rows: `wrap` mode chunks by `perRow`, `row` mode is a
   single row of everything.
2. Per row, `sizeRow()` either keeps natural sizes or (with `matchHeights`)
   scales every image to the row's **minimum** height, preserving aspect ratio.
3. Rows are laid out left→right at `y` offset; each image is vertically centered
   in its row (`y + (rowHeight - item.height) / 2`).
4. **Arrows** are horizontal segments at the row's vertical midline
   (`arrowY = y + rowHeight / 2`) spanning each gap: between consecutive
   images, and also leading/trailing gap segments that carry the flow from the
   previous row to the next (rows are joined visually by arrows at row edges).
5. Canvas size = content + padding. If `max(width, height)` exceeds
   `CANVAS_LIMIT = 16000` px, the whole layout is uniformly scaled down
   (`canvasLimited = true`, surfaced in the UI as a size warning).

Drawing (`drawComposite`) sets a `ctx.setTransform(scale, …)` so all drawing
happens in logical coordinates. Arrows are drawn with an inset from the gap
edges; the arrowhead is a filled triangle capped at 70% of the usable span, so
tiny gaps never produce broken arrows.

## Image normalization (`imageProcessing.ts`)

`normalizeImage(file)`:

1. **Decode** with `createImageBitmap(file)` — throws a friendly error naming
   the file when the browser can't decode it (covers HEIC/HEIF on unsupported
   browsers). Zero-pixel images are rejected.
2. **Alpha detection**: JPEG/BMP are assumed opaque; others are sampled (64×64
   draw, every 4th pixel) for alpha < 250.
3. **Downscale**: height capped at `MAX_HEIGHT = 1000` px (aspect preserved).
4. **Compress to ≤ `MAX_BYTES = 1 MiB`** via an iterative encode loop
   (max 12 passes):
   - Try PNG first (always safe for alpha).
   - Then lossy: **WebP** if the image has alpha, else **JPEG** (white-filled
     background — JPEG has no alpha), across qualities
     `0.92 → 0.84 → 0.76 → 0.68 → 0.6`.
   - If still over budget, shrink both dimensions by `0.85` and repeat, stopping
     at a `64` px minimum edge.
   - The smallest blob seen is kept as the fallback if nothing fits the budget.

This keeps every composite well under browser/memory limits and makes the
clipboard path reliable.

## Intake (`index.tsx`)

- **Drag & drop**: `dragOver` state on the page container with
  `hasFiles(dataTransfer)` guard; nested `dragleave` is filtered via
  `relatedTarget` containment.
- **Paste**: a window-level `paste` listener takes `clipboardData.files`.
- **Browse**: hidden `<input type="file" multiple accept="image/*">`.
- **Concurrency**: 2 parallel workers process files in order; results are
  committed to state **in input order** (`slots` + `commitReady` cursor), so
  fast decodes never reorder slow ones. Pending count drives the spinner.
- Unmount safety: `aliveRef` prevents state updates after unmount and revokes
  all object URLs.

## Preview & export

- Preview re-renders on any images/settings change, debounced 150 ms; loads are
  cached in a module-level `imageCache` keyed by object URL.
- **Download**: `exportBlob()` — PNG passes the canvas through directly; JPEG
  flattens onto a solid canvas first (transparent background becomes white,
  since JPEG has no alpha) at the configured quality. Filename:
  `vela-connected-YYYYMMDD-HHMM.(png|jpg)`.
- **Copy**: always exports PNG to the clipboard via `ClipboardItem`; errors
  surface a "try downloading instead" toast (Safari/older browsers).
- Thumbnails are reorderable via **@dnd-kit/sortable**
  (`horizontalListSortingStrategy`, 6px pointer activation threshold).

## Edge cases & gotchas

- **Canvas limit**: browsers cap canvas dimensions (~16k px). `CANVAS_LIMIT`
  scales the layout down; `canvasLimited` is shown in the UI so users know the
  export is reduced-resolution.
- `matchHeights` scales to the **shortest** image in the row — very short
  images shrink whole rows. Turn it off to keep natural sizes.
- The compose module is pure (no DOM except canvas passed in) — `computeLayout`
  is unit-testable without a browser.
- Nothing is uploaded; closing the tab discards everything. If persistence is
  ever needed, that is a new feature (export is the only output today).
- `drawArrow` skips spans ≤ 2px, so zero-`gap` layouts simply show no arrows.

## Rebuild kit (standalone / PC app)

Everything needed to rebuild this feature outside Vela web — e.g. in the
Vela PC app (see [`vela-pc-app.md`](vela-pc-app.md)).

### Stack & pinned versions

- React 19 + TypeScript + Vite + Tailwind (UI); lucide-react icons
- `@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^10.0.0, `@dnd-kit/utilities` ^3.2.2
  (thumbnail reordering only — droppable if you skip drag-reorder)

### Schema & auth

**None.** The feature is fully client-side: no API calls, no tables, no token.
Images and settings live in memory for the session; PNG/JPEG export is the only
output. This is by design — keep it that way in the PC app.

### Vela-specific coupling (strip or replace when rebuilding)

| Web dependency | Role | Standalone replacement |
| --- | --- | --- |
| `ToastContext` | success/error toasts | any notification system |
| `dnd-kit` sortable strip | reorder thumbnails | keep, or simple up/down buttons |

### PC app port notes

- `compose.ts` and `imageProcessing.ts` are pure DOM/canvas modules — copy
  verbatim into the Electron renderer.
- Electron is Chromium, so the ~16k px canvas limit and `CANVAS_LIMIT` scaling
  behave exactly like the web.
- Clipboard copy currently uses `ClipboardItem` PNG; in Electron you may prefer
  `clipboard.writeImage` from the main process for reliability.
- File download works via a temporary anchor; Electron's
  `dialog.showSaveDialog` is a nicer native upgrade.
