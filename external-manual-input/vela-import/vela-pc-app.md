# Vela PC App — Architecture & Plan

Plan for rebuilding the **Chart Code (Mermaid)** and **Picture Connector**
features natively in a Vela PC desktop app, instead of only on Vela web.

## Decisions

| Decision | Choice |
| --- | --- |
| Desktop shell | **Electron** — the web renderer code (Mermaid runtime, canvas compositing) ports almost verbatim into a webview |
| Authentication | **Token minted on Vela web** (user menu → Connect PC App), valid **3 months (90 days)**, pasted into the app once |
| Chart storage | **Cloud** — same Supabase `chart_codes` table via `/api/chart-codes`, so charts sync across web / mobile / PC app |
| Picture Connector storage | **None** — stays 100% local (session-only), matching the web feature |

## Architecture

```
┌────────────────────────────── Vela web (vela.sawitlabs.com) ─────────────────────────────┐
│  User menu → Connect PC App → POST /api/pc-app-token → 90-day token (scope: products)    │
└──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                           │ token copied once by the user
                                           ▼
┌────────────────────────────── Vela PC App (Electron) ────────────────────────────────────┐
│  auth-connector.ts ── verify (GET /api/pc-app-token?action=me) ── store (safeStorage)     │
│                                                                                          │
│  Chart Code screen                     │  Picture Connector screen                        │
│   ChartCodesApi → /api/chart-codes     │  compose.ts + imageProcessing.ts                 │
│   Mermaid renderer (ports verbatim)    │  local canvas only — no API, no storage          │
└──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                           │ Bearer token
                                           ▼
                        Netlify functions → Supabase (chart_codes, api_tokens)
```

Seed code lives in [`../pc-app/`](../pc-app/README.md) (auth connector +
chart storage client).

## Token & connector spec

### Endpoints (new: `netlify/functions/pc-app-token.ts`)

| Call | Who | Purpose |
| --- | --- | --- |
| `POST /api/pc-app-token` `{ name? }` | logged-in web user (session) | Mint 90-day token, scope `products`, shown once |
| `GET /api/pc-app-token` | session | List own connection tokens (status: active/expired/revoked) |
| `GET /api/pc-app-token?action=me` | the PC app (bearer token) | Verify token → identity |
| `DELETE /api/pc-app-token?id=` | session (own) or the token itself | Revoke |

### Security properties

- Tokens are ordinary rows in `api_tokens` (iss `vela-mcp`, kind
  `personal-token`) → revocation and scope enforcement apply automatically on
  every API they touch (`lib/patAuth.ts`).
- Scope is fixed to `products` (chart codes only) — no admin/private domains,
  no scope escalation.
- Personal tokens cannot mint new tokens (POST is session-only) — a leaked PC
  app token cannot create more tokens.
- `POST`/`DELETE` from the browser require the standard one-time CSRF token
  (`src/lib/api.ts` handles this automatically).
- The raw JWT is displayed exactly once; only metadata is stored server-side.

### Connector behavior (pc-app/src/auth-connector.ts)

`connect(token)` verifies then stores → `restore()` on startup →
`apiFetch()` attaches the bearer and raises `AuthExpiredError` on 401 (with
`onAuthExpired` callback) → `disconnect()` best-effort self-revokes and
clears. `daysRemaining()` decodes the JWT exp for pre-expiry warnings
(verify server-side is authoritative).

## Storage plan

| Data | Where | Notes |
| --- | --- | --- |
| Chart list + Mermaid source | Supabase `chart_codes` (DDL: [`../supabase/chart_codes.sql`](../supabase/chart_codes.sql)) | Shared with web + mobile; `protected` system charts are read-only seeds |
| Node styles / frontmatter config | inside `mmd_code` text | No schema needed |
| Picture Connector images & settings | in-memory only | Export PNG/JPEG is the only output; closing the app discards |
| Connection token | OS keychain (`safeStorage`) | Never plain text |

## Feature port mapping

| Web source | PC app target | Effort |
| --- | --- | --- |
| `src/lib/mermaidRuntime.ts`, `mermaidSource.ts`, `mermaidOrganizer.ts` | copy verbatim | low — pure TS |
| `src/components/MermaidViewer.tsx` + `hooks/useMermaidInteractive.ts` | copy, strip Vela-only bits | low |
| `src/screens/Product/ChartCodeList/Editor.tsx` | rebuild with `ChartCodesApi` | medium |
| `src/lib/chartCodes.ts` node style parse/serialize | copy verbatim | low |
| `src/screens/PictureConnector/compose.ts`, `imageProcessing.ts` | copy verbatim | low — pure DOM/canvas |
| `src/screens/PictureConnector/index.tsx` | rebuild; drop toast/dnd-kit or keep | medium |
| `netlify/functions/chart-codes.ts` share endpoint | optional later (GCS) | deferred |

Feature internals: [`chart-code-system.md`](chart-code-system.md) and
[`picture-connector.md`](picture-connector.md) (both include rebuild-kit
appendices with pinned versions and gotchas).

## Networking note

Vela's API CORS allowlist (`netlify/functions/lib/cors.ts`) covers web origins
only. In Electron, make API calls from the **main process** via IPC (Node
fetch is not CORS-bound), or add the app origin to the allowlist. Chromium
canvas limits (~16k px) apply in Electron too — Picture Connector's
`CANVAS_LIMIT` scaling already handles this.

## Roadmap

1. ✅ Token flow + connector (`/api/pc-app-token`, Connect PC App dialog,
   `pc-app/` package) — done in this iteration.
2. HTML mockups of the PC app screens (connect screen, Chart Code editor,
   Picture Connector) — reviewed before building.
3. Electron scaffold (`electron-vite`), wire the connector + secure storage.
4. Port Picture Connector (pure modules first), then Chart Code.
5. Optional: share-to-GCS, auto-update, packaged installers.
