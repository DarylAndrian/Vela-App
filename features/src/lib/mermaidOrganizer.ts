/**
 * Mermaid Code Organizer
 *
 * Parses messy Mermaid flowchart code and reorganizes it into a
 * clean, scalable structure:
 *  - Extracts all node declarations into a top section
 *  - Groups edges separately
 *  - Deduplicates nodes and edges
 *  - Consistent formatting and indentation
 */

/** Parsed representation of a single Mermaid node. */
export interface MmNode {
  id: string
  shape: 'rect' | 'round' | 'circle' | 'diamond' | 'hexagon' | 'parallelogram' | 'stadium' | 'subroutine' | 'cylinder' | 'label'
  label: string
  raw: string
}

/** Parsed representation of a single Mermaid edge. */
export interface MmEdge {
  from: string
  to: string
  label: string
  line: string
}

/** Full parsed Mermaid diagram. */
export interface MmDiagram {
  direction: string
  nodes: MmNode[]
  edges: MmEdge[]
  subgraphs: string[]
}

/* ── Regex patterns ───────────────────────────────────────────── */

/** Matches a complete standalone Mermaid node declaration. */
const NODE_SHAPE_RE = /^([\w][\w-]*)\s*(\[\[[^\]]*\]\]|\[\([^)]*\)\]|\(\[[^\]]*\]\)|\[[^\]]*\]|\(\([^)]*\)\)|\{[^}]*\}|>\[[^\]]*\]|>[^\]]*\]|\([^)]*\))$/

/** Arrow patterns. */
const ARROW_RE = /(--+>|-\.->|==>|~~~>|<--+|-<<-+)/

/* ── Shape/delimiter helpers ──────────────────────────────────── */

/** Detect shape type from the raw bracket string. */
function shapeFromLabel(s: string): MmNode['shape'] {
  s = s.trim()
  if (/^\[\[.*\]\]$/.test(s)) return 'hexagon'
  if (/^\(\(.*\)\)$/.test(s)) return 'circle'
  if (/^\[\(.*\)\]$/.test(s)) return 'cylinder'
  if (/^\(\[.*\]\)$/.test(s)) return 'subroutine'
  if (/^>\[.*\]$/.test(s) || /^\[\/.*\/\]$/.test(s)) return 'parallelogram'
  if (/^\{.*\}$/.test(s)) return 'diamond'
  if (/^\[.*\]$/.test(s)) return 'rect'
  if (/^\(.*\)$/.test(s)) return 'stadium'
  return 'rect'
}

/** Strip delimiter chars from around a label to get plain text. */
function stripDelimiters(s: string): string {
  return s
    .replace(/^\[\[?/, '')
    .replace(/\]\]?$/, '')
    .replace(/^\(\(/, '')
    .replace(/\)\)$/, '')
    .replace(/^\{\{?/, '')
    .replace(/\}\}?$/, '')
    .replace(/^\[\(/, '')
    .replace(/\)\]$/, '')
    .trim()
}

/**
 * Parse a token as a standalone node. Returns the node parts if it
 * is a valid node declaration, or null.
 */
function matchNode(token: string): { id: string; shape: MmNode['shape']; label: string; raw: string } | null {
  const m = NODE_SHAPE_RE.exec(token)
  if (!m) return null
  const id = m[1]
  const rawShape = m[2]
  return { id, shape: shapeFromLabel(rawShape), label: stripDelimiters(rawShape), raw: token }
}

/* ── Core parsing ─────────────────────────────────────────────── */

/**
 * Parse Mermaid flowchart code into structured representation.
 * Handles both declared nodes and inline edge-only definitions.
 */
export function parseMermaid(source: string): MmDiagram {
  const lines = source.split('\n')
  const nodes: MmNode[] = []
  const edges: MmEdge[] = []
  const subgraphs: string[] = []
  let direction = 'TD'
  const seenNodeIds = new Set<string>()
  const seenEdges = new Set<string>()

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%%') || line.startsWith('//')) continue

    // Direction declaration
    const dirMatch = line.match(/^\s*(graph|flowchart)\s+(TD|TB|BT|RL|LR)\s*$/i)
    if (dirMatch) {
      direction = dirMatch[2].toUpperCase()
      continue
    }

    // Subgraph boundary lines — pass through as-is
    if (/^\s*subgraph\s+/i.test(line)) {
      subgraphs.push(line)
      continue
    }
    if (/^\s*end\s+(?:subgraph)?\s*$/i.test(line)) {
      continue
    }

    // --- Node declaration (standalone, no edge arrow on line) ---
    const nodeResult = matchNode(line)
    if (nodeResult) {
      if (!seenNodeIds.has(nodeResult.id)) {
        seenNodeIds.add(nodeResult.id)
        nodes.push(nodeResult)
      }
      continue
    }

    // --- Edge line ---
    const arrowMatch = line.match(ARROW_RE)
    if (!arrowMatch) continue

    const arrow = arrowMatch[0]
    const arrowIdx = arrowMatch.index!

    const left = line.slice(0, arrowIdx).trim()
    const right = line.slice(arrowIdx + arrow.length).trim()

    // Parse edge label:  -->|text|
    let edgeLabel = ''
    let cleanRight = right
    const pipeMatch = right.match(/^\|([^|]*)\|\s*(.*)/)
    if (pipeMatch) {
      edgeLabel = pipeMatch[1]
      cleanRight = pipeMatch[2] || ''
    }

    // Extract from-node
    let fromId = left
    let fromRaw = left
    const fromNode: ReturnType<typeof matchNode> | null = left ? matchNode(left) : null
    if (fromNode) {
      fromId = fromNode.id
      fromRaw = fromNode.raw
    }

    // Extract to-node
    let toId = cleanRight
    let toRaw = cleanRight
    let toNode: ReturnType<typeof matchNode> | null = null
    if (cleanRight) {
      toNode = matchNode(cleanRight)
      if (toNode) {
        toId = toNode.id
        toRaw = toNode.raw
      }
    }

    // Register nodes
    if (!seenNodeIds.has(fromId)) {
      seenNodeIds.add(fromId)
      nodes.push({ id: fromId, shape: shapeFromLabel(fromRaw) || 'rect', label: stripDelimiters(fromRaw) || fromId, raw: fromNode ? fromRaw : fromId })
    }
    if (toId && !seenNodeIds.has(toId)) {
      seenNodeIds.add(toId)
      nodes.push({ id: toId, shape: shapeFromLabel(toRaw) || 'rect', label: stripDelimiters(toRaw) || toId, raw: toNode ? toRaw : toId })
    }

    // Deduplicate edges (preserve raw line for edge)
    if (toId) {
      const edgeKey = `${fromId}->${toId}(${edgeLabel || ''})`
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey)
        edges.push({ from: fromId, to: toId, label: edgeLabel, line: rawLine })
      }
    }
  }

  return { direction, nodes, edges, subgraphs }
}

/**
 * Reorganize Mermaid code into a clean, scalable structure.
 *
 * Output format:
 * ```
 * graph TD
 *   %% === Nodes ===
 *   A[Start]
 *   B{Decision}
 *   C[End]
 *
 *   %% === Edges ===
 *   A --> B
 *   B -->|Yes| C
 * ```
 */
export function organizeMermaid(source: string): string {
  const { direction, nodes, edges, subgraphs } = parseMermaid(source)

  const parts: string[] = []
  parts.push(`graph ${direction}`)

  if (nodes.length > 0) {
    parts.push('')
    parts.push('  %% === Nodes ===')
    for (const node of nodes) {
      parts.push(`  ${node.raw}`)
    }
  }

  if (edges.length > 0) {
    parts.push('')
    parts.push('  %% === Edges ===')
    for (const edge of edges) {
      const lb = edge.label ? `|${edge.label}|` : ''
      parts.push(`  ${edge.from} -->${lb ? ` ${lb}` : ''} ${edge.to}`)
    }
  }

  if (subgraphs.length > 0) {
    parts.push('')
    parts.push('  %% === Subgraphs ===')
    for (const sg of subgraphs) {
      parts.push(`  ${sg}`)
    }
    parts.push('  end')
  }

  return parts.join('\n')
}

/**
 * Validate that a Mermaid source string looks like a valid flowchart.
 * Returns an array of issue strings (empty = valid).
 */
export function validateMermaid(source: string): string[] {
  const issues: string[] = []
  const lines = source.split('\n')
  let hasDirection = false
  let hasEdges = false

  for (const line of lines) {
    const t = line.trim()
    if (/^graph\s+(TD|TB|BT|RL|LR)/i.test(t)) hasDirection = true
    if (/-->/.test(t)) hasEdges = true
  }

  if (!hasDirection) issues.push('Missing graph direction declaration (e.g., `graph TD`)')
  if (!hasEdges) issues.push('No edges found — diagram needs connections')

  return issues
}