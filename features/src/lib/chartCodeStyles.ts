export interface ChartCode {
  id: number
  title: string
  mmd_code: string
  product_name?: string
  product_id?: string
  protected: boolean
  created_at: string
  updated_at: string
}

/** Per-node visual style — maps to Mermaid `style` directive properties. */
export interface NodeStyle {
  fill?: string
  color?: string
  stroke?: string
  strokeWidth?: string
  fontWeight?: string
  fontStyle?: string
  fontSize?: string
}

/** Escape a string for use inside a RegExp built at runtime. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse an existing Mermaid `style <nodeId> …` line out of the diagram source.
 * Returns a partial `NodeStyle` with only the properties that were set.
 */
export function parseNodeStyle(source: string, nodeId: string): NodeStyle {
  const re = new RegExp(`^\\s*style\\s+${escapeRegex(nodeId)}\\s+(.+)$`, 'm')
  const match = source.match(re)
  if (!match) return {}

  const hyphenToCamel: Record<string, keyof NodeStyle> = {
    fill: 'fill',
    color: 'color',
    stroke: 'stroke',
    'stroke-width': 'strokeWidth',
    'font-weight': 'fontWeight',
    'font-style': 'fontStyle',
    'font-size': 'fontSize',
  }

  const style: NodeStyle = {}
  for (const pair of match[1].split(',')) {
    const colonIdx = pair.indexOf(':')
    if (colonIdx === -1) continue
    const key = pair.slice(0, colonIdx).trim()
    let value = pair.slice(colonIdx + 1).trim()
    const camelKey = hyphenToCamel[key]
    if (!camelKey) continue

    // Strip "px" suffix so numeric inputs stay clean
    if (value.endsWith('px')) value = value.slice(0, -2)
    style[camelKey] = value
  }
  return style
}

/**
 * Build the Mermaid style-string fragment from a `NodeStyle` object.
 * Only includes defined properties; automatically adds "px" suffix for
 * numeric-only stroke-width / font-size values.
 */
export function serializeNodeStyle(style: NodeStyle): string {
  const parts: string[] = []
  if (style.fill) parts.push(`fill:${style.fill}`)
  if (style.color) parts.push(`color:${style.color}`)
  if (style.stroke) parts.push(`stroke:${style.stroke}`)
  if (style.strokeWidth) {
    const v = /^\d+(\.\d+)?$/.test(style.strokeWidth) ? `${style.strokeWidth}px` : style.strokeWidth
    parts.push(`stroke-width:${v}`)
  }
  if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`)
  if (style.fontStyle) parts.push(`font-style:${style.fontStyle}`)
  if (style.fontSize) {
    const v = /^\d+(\.\d+)?$/.test(style.fontSize) ? `${style.fontSize}px` : style.fontSize
    parts.push(`font-size:${v}`)
  }
  return parts.join(',')
}

// REST client intentionally omitted — chart CRUD goes through the Electron main process (src/main/velaApi).
