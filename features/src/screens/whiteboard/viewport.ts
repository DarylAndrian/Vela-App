import { PAGE_HEIGHT, PAGE_WIDTH, type Point } from './ink';
import type { Rect } from './notebook';

export const PAPER_MARGIN = 28;
export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function toPage(point: Point, paper: Element): Point {
  const rect = paper.getBoundingClientRect();
  return { x: (point.x - rect.left) * PAGE_WIDTH / rect.width, y: (point.y - rect.top) * PAGE_HEIGHT / rect.height };
}

export function clampToPage(point: Point): Point {
  return { x: clamp(point.x, 0, PAGE_WIDTH), y: clamp(point.y, 0, PAGE_HEIGHT) };
}

export function paperElements(viewport: HTMLElement) {
  return Array.from(viewport.querySelectorAll<HTMLElement>('.wb-paper[data-page-id]'));
}

export function visiblePageRect(paper: Element, viewport: HTMLElement): Rect {
  const { left, top } = viewport.getBoundingClientRect();
  const start = clampToPage(toPage({ x: left, y: top }, paper));
  const end = clampToPage(toPage({ x: left + viewport.clientWidth, y: top + viewport.clientHeight }, paper));
  return { ...start, width: end.x - start.x, height: end.y - start.y };
}

export function paintLayer(canvas: HTMLCanvasElement, viewport: HTMLElement, clear: boolean) {
  const { clientWidth: width, clientHeight: height } = viewport;
  const dpr = window.devicePixelRatio || 1;
  const backingWidth = Math.round(width * dpr);
  const backingHeight = Math.round(height * dpr);
  if (!backingWidth || !backingHeight) return null;
  const resized = canvas.width !== backingWidth || canvas.height !== backingHeight;
  if (resized) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d')!;
  if (clear) context.clearRect(0, 0, backingWidth, backingHeight);
  const bounds = viewport.getBoundingClientRect();
  const sx = backingWidth / width;
  const sy = backingHeight / height;

  return {
    resized,
    page(paper: Element, draw: (context: CanvasRenderingContext2D, scale: number) => void) {
      const rect = paper.getBoundingClientRect();
      if (rect.bottom <= bounds.top || rect.top >= bounds.top + height ||
        rect.right <= bounds.left || rect.left >= bounds.left + width) return;
      context.save();
      const scale = rect.width / PAGE_WIDTH;
      context.setTransform(sx * scale, 0, 0, sy * rect.height / PAGE_HEIGHT,
        sx * (rect.left - bounds.left), sy * (rect.top - bounds.top));
      context.beginPath();
      context.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      context.clip();
      draw(context, scale);
      context.restore();
    },
  };
}
