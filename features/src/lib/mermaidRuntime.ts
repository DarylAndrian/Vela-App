/**
 * Shared Mermaid 11 render helpers.
 *
 * Mermaid's ELK and dagre layout paths eagerly `JSON.stringify` the layout
 * graph for debug logs — even when logging is disabled. In a React app those
 * graphs still hold D3 selections / SVG nodes, and React's enumerable
 * `__reactFiber$…` properties make `JSON.stringify` throw:
 *   Firefox: "Cyclic object value"
 *   Chromium: "Converting circular structure to JSON"
 *
 * See mermaid-js/mermaid#5530, #7907 and the APA01 logs in @mermaid-js/layout-elk.
 */

type MermaidApi = typeof import('mermaid').default

let elkRegistered = false
let renderQueue: Promise<unknown> = Promise.resolve()
let renderSeq = 0

/** Make DOM nodes JSON-serializable so Mermaid debug stringify cannot walk React fibers. */
export function installMermaidDomJsonGuard(): void {
  if (typeof Element === 'undefined') return
  const proto = Element.prototype as Element & { toJSON?: () => Record<string, never> }
  if (typeof proto.toJSON === 'function') return
  Object.defineProperty(proto, 'toJSON', {
    value: () => ({}),
    configurable: true,
    writable: true,
  })
}

export function nextMermaidGraphId(prefix: string): string {
  renderSeq += 1
  return `mermaid-${prefix}-${renderSeq}`
}

export async function renderMermaidSvg(
  mermaid: MermaidApi,
  graphId: string,
  source: string,
  layout: 'elk' | 'dagre',
): Promise<string> {
  installMermaidDomJsonGuard()

  const run = async () => {
    if (!elkRegistered) {
      const elkLayouts = (await import('@mermaid-js/layout-elk')).default
      mermaid.registerLayoutLoaders(elkLayouts)
      elkRegistered = true
    }

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      logLevel: 'fatal',
      theme: 'neutral',
      // Prevent Mermaid from drawing its built-in "Syntax error in text / mermaid
      // version 11.14.0" fallback SVG onto <body> when parse/render fails. Without
      // this flag the temp <div id="d{graphId}"> is never cleaned up on the error
      // path, so orphan error SVGs pile up behind the app. Callers (MermaidViewer,
      // ChartCodeEditor) already surface a proper inline error banner.
      suppressErrorRendering: true,
      flowchart: {
        htmlLabels: true,
        defaultRenderer: layout === 'elk' ? 'elk' : 'dagre-wrapper',
      },
    })

    const { svg } = await mermaid.render(graphId, source)
    return svg
  }

  // Mermaid's global diagram registry is not safe for overlapping render() calls
  // (React Strict Mode, tab switches). Serialize them.
  const pending = renderQueue.then(run, run)
  renderQueue = pending.then(
    () => undefined,
    () => undefined,
  )
  return pending
}
