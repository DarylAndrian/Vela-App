import type { NodeStyle } from './chartCodeStyles';
import { findMermaidNodeGroup } from './useMermaidInteractive';

export function applyStyleToSvg(svg: SVGSVGElement, nodeId: string, style: NodeStyle) {
  const nodeGroup = findMermaidNodeGroup(svg, nodeId);
  if (!nodeGroup) return;

  const shape = nodeGroup.querySelector('rect, circle, polygon, ellipse') as SVGElement | null;
  const label = nodeGroup.querySelector('text') as SVGTextElement | null;
  const tspan = label?.querySelector('tspan') as SVGTextElement | null;

  if (shape) {
    if (style.fill !== undefined) shape.setAttribute('fill', style.fill);
    if (style.stroke !== undefined) shape.setAttribute('stroke', style.stroke);
    if (style.strokeWidth !== undefined) {
      shape.setAttribute('stroke-width', /^\d+(\.\d+)?$/.test(style.strokeWidth) ? `${style.strokeWidth}px` : style.strokeWidth);
    }
  }
  if (style.color !== undefined) {
    if (label) label.setAttribute('fill', style.color);
    if (tspan) tspan.setAttribute('fill', style.color);
  }
  if (style.fontWeight !== undefined) {
    if (label) label.setAttribute('font-weight', style.fontWeight);
    if (tspan) tspan.setAttribute('font-weight', style.fontWeight);
  }
  if (style.fontStyle !== undefined) {
    if (label) label.setAttribute('font-style', style.fontStyle);
    if (tspan) tspan.setAttribute('font-style', style.fontStyle);
  }
  if (style.fontSize !== undefined) {
    const fs = /^\d+(\.\d+)?$/.test(style.fontSize) ? `${style.fontSize}px` : style.fontSize;
    if (label) label.setAttribute('font-size', fs);
    if (tspan) tspan.setAttribute('font-size', fs);
  }
}
