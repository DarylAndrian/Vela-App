interface NodeDescription {
  label: string
  description: string
  connections: { nodeId: string; label: string }[]
}

interface InteractiveOptions {
  onNodeClick?: (nodeId: string, element: SVGGElement, connections: { nodeId: string; label: string }[]) => void
  onClearClick?: () => void
  nodeDescriptions?: Record<string, NodeDescription>
  /** Re-apply click highlight after remount without re-opening the toolbar callback. */
  initialSelectedNodeId?: string | null
}

export interface MermaidInteractivityHandle {
  destroy: () => void
  selectNode: (nodeId: string, opts?: { notify?: boolean }) => void
  clearSelection: () => void
}

/** Parse Mermaid's rendered node group id down to the flowchart node name. */
export function getMermaidNodeBaseId(el: Element): string {
  const id = el.id
  // Mermaid node IDs follow: mermaid-{graphId}-flowchart-{name}-{autoIndex}
  const flowchartIdx = id.lastIndexOf('flowchart-')
  if (flowchartIdx !== -1) {
    const after = id.slice(flowchartIdx + 'flowchart-'.length)
    return after.replace(/-\d+$/, '')
  }
  return id
}

export function findMermaidNodeGroup(svg: SVGSVGElement, nodeId: string): SVGGElement | null {
  return (
    (Array.from(svg.querySelectorAll('.node')).find(
      el => getMermaidNodeBaseId(el) === nodeId
    ) as SVGGElement | undefined) ?? null
  )
}

/**
 * Resolve an edge path's source/target node ids.
 *
 * Mermaid v11 flowcharts no longer tag edges with LS-/LE- classes. Instead each
 * edge path carries `data-id="L_<from>_<to>_<counter>"` (see getEdgeId). Because
 * node ids may themselves contain underscores and digits, we cannot naively split
 * on "_"; instead we test candidate splits against the real node-id list and only
 * accept a split that leaves a numeric counter (or nothing) behind.
 */
function resolveEdgeEndpoints(
  el: Element,
  edgeId: string,
  nodeIdsByLength: string[],
): { source: string; target: string } {
  // Back-compat: older renders / other diagram types may still expose LS-/LE-.
  const classes = Array.from(el.classList)
  const ls = classes.find(c => c.startsWith('LS-'))?.substring(3)
  const le = classes.find(c => c.startsWith('LE-'))?.substring(3)
  if (ls && le) return { source: ls, target: le }

  if (!edgeId) return { source: '', target: '' }

  // If handed the element id (diagram-prefixed), keep only the "L_…" edge id part.
  let body = edgeId
  const edgeIdStart = body.lastIndexOf('-L_')
  if (edgeIdStart !== -1) body = body.slice(edgeIdStart + 1)
  // Strip the flowchart edge prefix ("L_").
  if (body.startsWith('L_')) body = body.slice(2)

  for (const from of nodeIdsByLength) {
    if (!body.startsWith(from)) continue
    const afterFrom = body.slice(from.length)
    if (!afterFrom.startsWith('_')) continue
    const rest = afterFrom.slice(1) // "<to>_<counter>" or "<to>"
    for (const to of nodeIdsByLength) {
      if (rest === to) return { source: from, target: to }
      if (rest.startsWith(to + '_') && /^\d+$/.test(rest.slice(to.length + 1))) {
        return { source: from, target: to }
      }
    }
  }

  return { source: '', target: '' }
}

export function applyMermaidInteractivity(
  container: HTMLElement,
  options?: InteractiveOptions
): MermaidInteractivityHandle {
  const svg = container.querySelector('svg')
  if (!svg) {
    return {
      destroy: () => {},
      selectNode: () => {},
      clearSelection: () => {},
    }
  }

  const nodeDescriptions = options?.nodeDescriptions || {}

  // Inject styles if not present
  let styleEl = document.getElementById('mermaid-interactive-styles')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'mermaid-interactive-styles'
    styleEl.innerHTML = `
      /* Host interactions */
      .mermaid-interactive {
        transition: all 0.3s ease;
      }
      
      /* Node visual states */
      .mermaid-interactive.is-hovering .node,
      .mermaid-interactive.is-clicked .node {
        opacity: 0.25;
        transition: opacity 0.3s ease, filter 0.3s ease;
      }
      .mermaid-interactive.is-hovering .node.node-hovered,
      .mermaid-interactive.is-clicked .node.node-clicked {
        opacity: 1;
        filter: drop-shadow(0 0 12px rgba(16, 185, 129, 0.6));
      }
      .mermaid-interactive.is-hovering .node.node-hovered rect,
      .mermaid-interactive.is-hovering .node.node-hovered circle,
      .mermaid-interactive.is-hovering .node.node-hovered polygon,
      .mermaid-interactive.is-clicked .node.node-clicked rect,
      .mermaid-interactive.is-clicked .node.node-clicked circle,
      .mermaid-interactive.is-clicked .node.node-clicked polygon {
        stroke: #10B981 !important;
        stroke-width: 2px !important;
      }
      .mermaid-interactive.is-hovering .node.node-connected,
      .mermaid-interactive.is-clicked .node.node-connected-click {
        opacity: 1;
      }
      
      /* Edge visual states.
         Mermaid v11 renders every edge as a <path class="… flowchart-link"> directly
         inside <g class="edgePaths"> (there is no per-edge ".edgePath" wrapper), so the
         highlight class is applied to that <path> itself. */
      .mermaid-interactive.is-hovering .edgePaths path,
      .mermaid-interactive.is-hovering .edgeLabel,
      .mermaid-interactive.is-clicked .edgePaths path,
      .mermaid-interactive.is-clicked .edgeLabel {
        opacity: 0.15;
        transition: opacity 0.3s ease, stroke 0.3s ease, stroke-width 0.3s ease;
      }
      .mermaid-interactive.is-hovering .edgePaths path.edge-connected,
      .mermaid-interactive.is-clicked .edgePaths path.edge-connected-click {
        opacity: 1;
        stroke: #10B981 !important;
        stroke-width: 3px !important;
        filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.55));
      }
      .mermaid-interactive.is-hovering .edgeLabel.edge-connected,
      .mermaid-interactive.is-clicked .edgeLabel.edge-connected-click {
        opacity: 1;
      }
      
      /* Interactive elements */
      .mermaid-interactive .node {
        cursor: pointer;
      }
      .mermaid-interactive .edgePaths path {
        cursor: pointer;
      }
    `
    document.head.appendChild(styleEl)
  }

  svg.classList.add('mermaid-interactive')

  const nodes = Array.from(svg.querySelectorAll('.node')) as SVGGElement[]

  // Mermaid v11: each edge is a <path class="… flowchart-link"> directly inside
  // <g class="edgePaths"> and carries data-id="L_<from>_<to>_<counter>". Skip
  // invisible spacing edges so we never highlight a line meant to stay hidden.
  const edgePaths = (Array.from(
    svg.querySelectorAll('.edgePaths path')
  ) as SVGPathElement[]).filter(
    p =>
      (p.hasAttribute('data-id') || p.classList.contains('flowchart-link')) &&
      !p.classList.contains('edge-thickness-invisible')
  )

  const nodeData = nodes.map(el => ({ element: el, id: getMermaidNodeBaseId(el) }))

  // Longest ids first → prefer the most specific node match when parsing edge ids.
  const nodeIdsByLength = nodeData
    .map(nd => nd.id)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  // Edge labels render as <g class="edgeLabel"><g class="label" data-id="L_…">…</g></g>,
  // so each label can be linked back to its edge through the shared data-id.
  const labelByEdgeId = new Map<string, Element>()
  Array.from(svg.querySelectorAll('.edgeLabel')).forEach(lbl => {
    const id = lbl.querySelector('[data-id]')?.getAttribute('data-id')
    if (id) labelByEdgeId.set(id, lbl)
  })

  const edgeData = edgePaths.map(ep => {
    const id = ep.getAttribute('data-id') || ep.id || ''
    const { source, target } = resolveEdgeEndpoints(ep, id, nodeIdsByLength)
    return { element: ep, id, source, target, label: labelByEdgeId.get(id) ?? null }
  })

  const listeners: { el: Element; type: string; fn: EventListener }[] = []

  function addListener(el: Element, type: string, fn: EventListener) {
    el.addEventListener(type, fn)
    listeners.push({ el, type, fn })
  }

  let clickedNodeId: string | null = null

  function clearHighlights() {
    if (!svg) return
    svg.classList.remove('is-hovering')
    nodes.forEach(n => n.classList.remove('node-hovered', 'node-connected'))
    edgeData.forEach(ed => {
      ed.element.classList.remove('edge-connected')
      ed.label?.classList.remove('edge-connected')
    })
  }

  function clearClickHighlights() {
    if (!svg) return
    svg.classList.remove('is-clicked')
    nodes.forEach(n => n.classList.remove('node-clicked', 'node-connected-click'))
    edgeData.forEach(ed => {
      ed.element.classList.remove('edge-connected-click')
      ed.label?.classList.remove('edge-connected-click')
    })
    clickedNodeId = null
  }

  function highlightNodeAndConnections(nodeId: string) {
    if (!svg) return
    svg.classList.add('is-hovering')

    const connectedNodeIds = new Set<string>()

    edgeData.forEach(ed => {
      if (ed.source === nodeId || ed.target === nodeId) {
        ed.element.classList.add('edge-connected')
        ed.label?.classList.add('edge-connected')
        if (ed.source && ed.source !== nodeId) connectedNodeIds.add(ed.source)
        if (ed.target && ed.target !== nodeId) connectedNodeIds.add(ed.target)
      }
    })

    nodeData.forEach(nd => {
      if (nd.id === nodeId) {
        nd.element.classList.add('node-hovered')
      } else if (connectedNodeIds.has(nd.id)) {
        nd.element.classList.add('node-connected')
      }
    })
  }

  function clickHighlightNodeAndConnections(nodeId: string, notify = true) {
    if (!svg) return
    clearClickHighlights()
    clearHighlights()
    clickedNodeId = nodeId
    svg.classList.add('is-clicked')

    const connectedNodeIds = new Set<string>()
    const connections: { nodeId: string; label: string }[] = []

    edgeData.forEach(ed => {
      if (ed.source === nodeId || ed.target === nodeId) {
        ed.element.classList.add('edge-connected-click')
        ed.label?.classList.add('edge-connected-click')
        const otherId = ed.source === nodeId ? ed.target : ed.source
        if (otherId && otherId !== nodeId) {
          connectedNodeIds.add(otherId)
          const desc = nodeDescriptions[otherId]
          connections.push({ nodeId: otherId, label: desc?.label || formatNodeId(otherId) })
        }
      }
    })

    nodeData.forEach(nd => {
      if (nd.id === nodeId) {
        nd.element.classList.add('node-clicked')
      } else if (connectedNodeIds.has(nd.id)) {
        nd.element.classList.add('node-connected-click')
      }
    })

    if (notify && options?.onNodeClick) {
      const nodeEl = nodeData.find(nd => nd.id === nodeId)?.element
      if (nodeEl) options.onNodeClick(nodeId, nodeEl, connections)
    }
  }

  function highlightEdge(ed: typeof edgeData[0]) {
    if (!svg) return
    svg.classList.add('is-hovering')

    ed.element.classList.add('edge-connected')
    ed.label?.classList.add('edge-connected')
    nodeData.forEach(nd => {
      if (nd.id === ed.source || nd.id === ed.target) {
        nd.element.classList.add('node-connected')
      }
    })
  }

  nodeData.forEach(nd => {
    if (!nd.id) return
    addListener(nd.element, 'mouseenter', () => {
      if (clickedNodeId) return
      highlightNodeAndConnections(nd.id)
    })
    addListener(nd.element, 'mouseleave', () => {
      if (clickedNodeId) return
      clearHighlights()
    })
    addListener(nd.element, 'click', (e) => {
      e.stopPropagation()
      if (clickedNodeId === nd.id) {
        clearClickHighlights()
        if (options?.onClearClick) options.onClearClick()
      } else {
        clickHighlightNodeAndConnections(nd.id, true)
      }
    })
  })

  edgeData.forEach(ed => {
    addListener(ed.element, 'mouseenter', () => {
      if (clickedNodeId) return
      highlightEdge(ed)
    })
    addListener(ed.element, 'mouseleave', () => {
      if (clickedNodeId) return
      clearHighlights()
    })
  })

  // Click on SVG background to deselect
  addListener(svg, 'click', (e) => {
    if (e.target === svg || (e.target as Element)?.tagName === 'svg') {
      clearClickHighlights()
      clearHighlights()
      if (options?.onClearClick) options.onClearClick()
    }
  })

  if (options?.initialSelectedNodeId) {
    clickHighlightNodeAndConnections(options.initialSelectedNodeId, false)
  }

  return {
    destroy: () => {
      listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn))
      clearHighlights()
      clearClickHighlights()
    },
    selectNode: (nodeId: string, opts?: { notify?: boolean }) => {
      clickHighlightNodeAndConnections(nodeId, opts?.notify !== false)
    },
    clearSelection: () => {
      clearClickHighlights()
      clearHighlights()
    },
  }
}

function formatNodeId(id: string): string {
  return id.replace(/_/g, ' ').replace(/-/g, ' ')
}
