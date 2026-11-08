# Chart Code System (Mermaid) — Technical Documentation

Developer-facing documentation for the Chart Code feature: a Mermaid diagram
editor with live preview, node styling, code organization, export, and public
sharing.

## Overview

Chart Code lets users author Mermaid flowchart source, see a live rendered
preview, style individual nodes via a click-to-edit toolbar, organize messy
code, and export or share the rendered diagram. Charts are persisted per
instance in Supabase and can be linked to a Product.

- **Routes**
  - `/products/chartcode` — chart list (`ChartCodeList`)
  - `/products/chartcode/:id` — editor (`ChartCodeEditor`)
- **Navigation**: Sidebar → *Auxiliary* → "Chart Code"
  (`src/components/Sidebar.tsx`, requires `product_manage` permission)
- **Command Palette**: entry `chart-code` (`src/components/CommandPalette.tsx`)

## File map

| File | Responsibility |
| --- | --- |
| `src/screens/Product/ChartCodeList.tsx` | Grid of saved charts: create, search, delete |
| `src/screens/Product/ChartCodeEditor.tsx` | Editor screen: code pane + preview, save, organize, export, share |
| `src/components/MermaidViewer.tsx` | Reusable Mermaid renderer: zoom, fullscreen, ELK/dagre toggle, node styling toolbar |
| `src/lib/mermaidRuntime.ts` | Mermaid 11 render engine: ELK registration, DOM JSON guard, serialized render queue |
| `src/lib/mermaidSource.ts` | Source normalization (YAML frontmatter handling for Mermaid 11) |
| `src/lib/mermaidOrganizer.ts` | `organizeMermaid()` — parses and rewrites flowchart source into clean structure |
| `src/lib/chartCodes.ts` | `ChartCode`/`NodeStyle` types, REST client, node style parse/serialize |
| `src/hooks/useMermaidInteractive.ts` | Click-to-select node interactivity on rendered SVGs |
| `netlify/functions/chart-codes.ts` | REST backend: CRUD + share-upload to GCS |

## Architecture / data flow

```
ChartCodeList ──create──▶ chartCodesApi ──▶ /api/chart-codes ──▶ Supabase chart_codes
                                                                      │
ChartCodeEditor ──load/update─────────────────────────────────────────┘
   │  code (mmd text)
   ▼
MermaidViewer ──prepareMermaidSource()──▶ renderMermaidSvg() ──▶ SVG in .mermaid-host
   │                                        (mermaid 11 + ELK)
   ├─ node click ──▶ styling toolbar ──▶ onStyleChange ──▶ `style <node>` lines in source
   └─ Export/Share ──▶ SVG → canvas → PNG/JPG/SVG download or GCS public URL
```

The editor keeps a single source of truth — the `mmd_code` string. Node
styling is written back into the Mermaid source as `style <nodeId> …` lines
(the editor inserts/updates/removes the line in `ChartCodeEditor.tsx`,
`onStyleChange`), so styles round-trip through save/load with no extra schema.

## Data model & API

**Table `chart_codes`** (Supabase), via `netlify/functions/chart-codes.ts`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | number | PK |
| `title` | text | |
| `mmd_code` | text | Mermaid source |
| `product_id` / `product_name` | text | Optional product link (nullable, legacy fallback exists) |
| `protected` | bool | System charts (used by Product Map) cannot be deleted |
| `created_at` / `updated_at` | timestamptz | |

**REST endpoints** (`/api/chart-codes`, JWT auth required — `authHeaders()`
attaches the bearer token; web session JWTs and 90-day PC app tokens with the
`products` scope are both accepted — see "Rebuild kit" below):

| Method | Path | Action |
| --- | --- | --- |
| `GET` | `/api/chart-codes` | List all (ordered by `updated_at` desc) |
| `GET` | `/api/chart-codes?id=N` | Fetch one |
| `POST` | `/api/chart-codes` | Create `{ title, mmd_code, product_id }` |
| `PATCH` | `/api/chart-codes?id=N` | Update `title` / `mmd_code` / `product_id` |
| `DELETE` | `/api/chart-codes?id=N` | Delete (403 if `protected`) |
| `POST` | `/api/chart-codes?action=share` | `{ chart_id, image: base64 PNG }` → uploads to GCS, returns public URL |

**Seeding**: on first request the function inserts two protected system charts
("Tech Flow", "Business Flow") when the table is empty
(`seedIfEmpty`, `netlify/functions/chart-codes.ts`).

**Share/GCS**: uploads PNG to bucket `vela-gallery` under
`shared-charts/chart_<id>_<ts>_<rand>.png`. Bucket has Uniform Bucket-Level
Access, so public read is granted at bucket level (no per-object ACLs). Requires
the `GCP_SERVICE_ACCOUNT` env var on the Netlify function; returns a 503 with a
clear message when missing.

## Rendering pipeline

### 1. Source normalization — `mermaidSource.ts`

`prepareMermaidSource(raw)` runs before every render:

- Valid YAML frontmatter (delimited by `---`, Mermaid 11.14+ style) is **kept**
  so Mermaid 11 can apply config like `layout: elk`, `look: neo`, `theme: mc`.
- Broken/unclosed frontmatter is recovered by slicing from the first
  `graph|flowchart` line; a legacy fallback strips a trailing `---` block.

### 2. Render engine — `mermaidRuntime.ts`

`renderMermaidSvg(mermaid, graphId, source, layout)`:

- **DOM JSON guard**: Mermaid's ELK/dagre layout code eagerly
  `JSON.stringify`s the layout graph for debug logs, which walks React fiber
  properties on DOM nodes and throws ("Cyclic object value" / "Converting
  circular structure to JSON"). `installMermaidDomJsonGuard()` adds
  `Element.prototype.toJSON = () => ({})` to neutralize this
  (upstream: mermaid-js/mermaid#5530, #7907).
- **ELK registration**: `@mermaid-js/layout-elk` layout loaders are registered
  once (module-level `elkRegistered` flag).
- **Render queue**: Mermaid's global diagram registry is not safe under
  overlapping `render()` calls (React Strict Mode), so renders are serialized
  through a module-level promise chain (`renderQueue`).
- **Initialization**: `startOnLoad: false`, `securityLevel: 'strict'`,
  `logLevel: 'fatal'`, `theme: 'neutral'`, `suppressErrorRendering: true`
  (prevents Mermaid's fallback error SVG from being appended to `<body>`).
- `flowchart.defaultRenderer` is `elk` or `dagre-wrapper` depending on the
  selected layout mode.

### 3. Viewer — `MermaidViewer.tsx`

- Re-renders on source/layout/`renderKey` change; shows a "Rendering diagram…"
  placeholder and an inline error banner on parse/render failure.
- Controls: **Auto Fit**, **Zoom** (100/150/200/300%), **Layout toggle**
  (ELK ↔ dagre), **Fullscreen**.
- **Interactivity** (`useMermaidInteractive.ts`): clicking a node resolves its
  flowchart node name from the rendered group id
  (`mermaid-{graphId}-flowchart-{name}-{n}` → `name`), resolves edge endpoints
  from `data-id="L_<from>_<to>_<n>"`, and opens a styling toolbar. A
  `MermaidInteractivityHandle` supports re-selection after re-render
  (`initialSelectedNodeId`).

## Node styling

`NodeStyle` (`src/lib/chartCodes.ts`) maps 1:1 to Mermaid `style` directive
properties: `fill`, `color`, `stroke`, `stroke-width`, `font-weight`,
`font-style`, `font-size`.

- `parseNodeStyle(source, nodeId)` — regex-extracts an existing
  `style <nodeId> …` line into a partial `NodeStyle` (strips `px` suffixes).
- `serializeNodeStyle(style)` — builds the style string; re-adds `px` for
  numeric-only `stroke-width` / `font-size` values.
- The editor's `onStyleChange` writes the serialized style back into the code
  textarea content (replace, append, or delete the `style` line), so **styles
  are plain source text** — no separate storage.
- The viewer applies the live style as an SVG overlay on the selected node only
  and re-syncs the previous node from the source snapshot to avoid stuck
  overlays.

## Code organizer

`organizeMermaid(source)` (`src/lib/mermaidOrganizer.ts`) parses flowchart
source into `MmDiagram { direction, nodes, edges, subgraphs }`:

- Node parsing handles all Mermaid shapes (rect, round, circle, diamond,
  hexagon, parallelogram, stadium, subroutine, cylinder, label).
- Emits a clean layout: direction line, node declarations section, edge section,
  deduplicated nodes/edges, consistent indentation.
- The editor's **Organize** button prepends `graph TD` if no direction line
  exists.

## Editor screen specifics (`ChartCodeEditor.tsx`)

- **Layout**: side-by-side (code left / preview right) only when the window is
  ≥ 1920px **and** the container ≥ 960px; otherwise stacked with a resizable
  splitter. Splitter sizes persist in `localStorage`
  (`vela.chartcode.editorHeight`, `vela.chartcode.editorWidth`); in stacked
  mode the code pane auto-grows with line count (clamped to 55% of the
  container) until the user drags it.
- **Save**: explicit Save button + `Ctrl/Cmd+S` shortcut.
- **Export** (PNG / JPG / SVG): measures the rendered SVG's `viewBox`, clones it
  (strips `[data-export-ignore]` overlays and the style toolbar, keeps Mermaid's
  embedded `<style>` tags — stripping them breaks the export), rasterizes on a
  2× canvas with 40px padding and theme-aware background
  (`#18181b` dark / `#ffffff` light). JPEG quality 0.92.
- **Share**: renders the preview to a PNG base64 (same clone/measure path),
  POSTs to `?action=share`, copies the returned public GCS URL to the clipboard.
- **Product link**: a product picker in the header sets `product_id`; the
  accent color follows the product via `resolveProductAccent`.

## Edge cases & gotchas

- Never call `mermaid.render()` directly — always go through
  `renderMermaidSvg()` or you lose the JSON guard, ELK registration, and
  render serialization.
- SVG export must keep Mermaid's `<style>` elements; only remove
  `[data-export-ignore]` and `.node-style-toolbar`.
- `parseNodeStyle` matches `style <nodeId>` at line start — style lines are
  written with two-space indentation in the editor but the regex is
  whitespace-tolerant.
- `protected` charts (system seeds, used by Product Map) are rejected on
  DELETE with 403.
- The share feature is the only part that needs `GCP_SERVICE_ACCOUNT`; the rest
  of the feature works without GCS.

## Rebuild kit (standalone / PC app)

Everything needed to rebuild this feature outside Vela web — e.g. in the
Vela PC app (see [`vela-pc-app.md`](vela-pc-app.md)).

### Stack & pinned versions

- `mermaid` ^11.4.0 (Mermaid 11 frontmatter/config semantics are relied on)
- `@mermaid-js/layout-elk` ^0.2.1 (ELK layout loader)
- React 19 + TypeScript + Vite + Tailwind (UI); lucide-react icons

### Schema

`chart_codes` DDL: [`../supabase/chart_codes.sql`](../supabase/chart_codes.sql).
Node styles and diagram config live inside `mmd_code` text — no extra tables.

### Auth contract

- `Authorization: Bearer <JWT>` on every `/api/chart-codes` call.
- Two token kinds work: web session JWTs and personal API tokens
  (`iss: vela-mcp`) with the **`products`** scope. PC app tokens are minted on
  Vela web (user menu → Connect PC App) via `/api/pc-app-token`, valid 90 days.
- Revocation and scope are enforced on every call (`lib/patAuth.ts`);
  `protected` charts cannot be deleted (403).

### Vela-specific coupling (strip or replace when rebuilding)

| Web dependency | Role | Standalone replacement |
| --- | --- | --- |
| `productsStore` / `resolveProductAccent` | product picker + accent colors | drop, or your own product list |
| `SEED_CHARTS` in `netlify/functions/chart-codes.ts` | system charts for Product Map | omit |
| Share via GCS (`?action=share`) | public link upload | optional; needs GCS creds |
| `/api/*` → Netlify functions redirects | routing | call the functions' URLs directly |

### PC app port notes

- `mermaidRuntime.ts`, `mermaidSource.ts`, `mermaidOrganizer.ts`, and the
  node-style parse/serialize helpers are pure TypeScript — copy verbatim.
- `MermaidViewer` + `useMermaidInteractive` are DOM/SVG-based and run as-is in
  an Electron renderer.
- Export/share rasterize through a DOM canvas — identical in Electron.
- Use `pc-app/src/chartCodesApi.ts` (same CRUD contract as
  `src/lib/chartCodes.ts`) for storage.
