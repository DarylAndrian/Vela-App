# Vela PC App — connector package

Seed code for the **Vela PC app** (Electron desktop): the login/token
connection layer and the chart-list storage client. Feature screens (Chart
Code editor, Picture Connector) will be ported from the web app — see
[`../docs/vela-pc-app.md`](../docs/vela-pc-app.md) for the full plan.

## What's here

| File | Purpose |
| --- | --- |
| `src/auth-connector.ts` | `VelaConnector` — verify/store/use the connection token, authorized fetch, expiry info, self-revoke on disconnect. Framework-free. |
| `src/chartCodesApi.ts` | `ChartCodesApi` — chart list CRUD against `/api/chart-codes` (shared with Vela web / vela-mobile). |

No dependencies; needs `fetch` (Node 18+, Electron, any browser context).

## Connection flow

1. On **Vela web**: user menu (top right) → **Connect PC App** → *Generate
   connection token*. A 90-day (3-month) token scoped to `products` is shown
   once — copy it.
2. In the **PC app**: paste the token into the connect screen →
   `connector.connect(token)` verifies it (`GET /api/pc-app-token?action=me`)
   and stores it.
3. From then on the app restores the session silently via `connector.restore()`.
   When the token expires or is revoked, `onAuthExpired` fires → show the
   "reconnect" screen and point the user back to the web app.
4. Disconnect: `connector.disconnect()` self-revokes the token server-side
   (and it can always also be revoked from the web Connect PC App dialog).

## Usage

```ts
import { VelaConnector } from './src/auth-connector'
import { ChartCodesApi } from './src/chartCodesApi'

const connector = new VelaConnector({
  baseUrl: 'https://vela.sawitlabs.com',
  store: myTokenStore,               // see below
  onAuthExpired: () => showReconnectScreen(),
})

const identity = await connector.connect(pastedToken)
const charts = await new ChartCodesApi(connector).list()
```

## Token storage

Never persist the raw token in plain config files. Implement `TokenStore` with
OS-protected storage:

- **Electron**: encrypt with `safeStorage` (OS keychain-backed) and write the
  ciphertext to `app.getPath('userData')`, e.g.
  `safeStorage.encryptString(token)` → `token.bin`.
- Fallback: OS keychain via `keytar`, or Electron's `safeStorage` only.

`MemoryTokenStore` exists for tests and prototyping.

## Networking note (Electron)

Vela's API CORS allowlist covers web origins only. In Electron, call the API
from the **main process** (or a utility process) via IPC — Node requests are
not subject to CORS. Alternatively add the app origin to
`netlify/functions/lib/cors.ts` `ALLOWED_ORIGINS`. The connector itself is
transport-agnostic and works either way.

## Related docs

- [`../docs/vela-pc-app.md`](../docs/vela-pc-app.md) — architecture, token flow, roadmap
- [`../docs/chart-code-system.md`](../docs/chart-code-system.md) — Chart Code internals to port
- [`../docs/picture-connector.md`](../docs/picture-connector.md) — Picture Connector internals to port
