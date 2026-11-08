/**
 * Prepare Mermaid diagram source for rendering in Mermaid v11+.
 *
 * Older versions of this app stripped YAML frontmatter manually before calling
 * `mermaid.render()`. Mermaid 11 reads frontmatter natively (including config
 * such as `layout: elk`). Manual stripping dropped that config and failed when
 * the closing `---` delimiter was indented, leaving broken YAML that triggers
 * "Syntax error in text".
 */

/** Matches YAML frontmatter with optional leading indent (Mermaid 11.14+). */
const FRONTMATTER_RE = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s

/** First graph / flowchart declaration line. */
const DIAGRAM_LINE_RE = /^[ \t]*(?:graph|flowchart)\s+(?:TB|TD|BT|RL|LR)\b/im

/**
 * Normalize Mermaid source before render.
 * - Keeps valid YAML frontmatter intact for Mermaid 11
 * - Recovers the diagram body when frontmatter is incomplete or malformed
 */
export function prepareMermaidSource(raw: string): string {
  const trimmed = raw.trimEnd()
  if (!trimmed) return trimmed

  const leading = trimmed.trimStart()
  if (!leading.startsWith('---')) {
    return trimmed
  }

  // Valid frontmatter — let Mermaid 11 parse config (layout, theme, look, …)
  if (FRONTMATTER_RE.test(trimmed)) {
    return trimmed
  }

  // Broken / unclosed frontmatter — keep only the diagram body
  const diagramLine = DIAGRAM_LINE_RE.exec(trimmed)
  if (diagramLine?.index != null) {
    return trimmed.slice(diagramLine.index).trimStart()
  }

  // Fallback: legacy strip (flush closing --- only)
  const end = leading.indexOf('\n---', 3)
  if (end !== -1) {
    return leading.slice(end + 4).trimStart()
  }

  return trimmed
}
