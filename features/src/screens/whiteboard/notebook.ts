import type { Point, Stroke } from './ink';

export const templates = ['Blank', 'Ruled', 'Dotted'] as const;
export type Template = typeof templates[number];

export const shapes = ['Circle', 'Oval', 'Square', 'Rectangle', 'Line', 'Arrow'] as const;
export type ShapeKind = typeof shapes[number];

export interface Shape {
  type: 'shape';
  kind: ShapeKind;
  start: Point;
  end: Point;
  color: string;
  width: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface Picture extends Rect {
  type: 'picture';
  id: string;
}

export type BoardObject = Stroke | Shape | Picture;

export type Selection =
  | { kind: 'region'; pageId: string; rect: Rect }
  | { kind: 'picture'; pageId: string; id: string };

export interface Raster {
  blob: Blob;
  bitmap: ImageBitmap;
}

export interface Page {
  id: string;
  template: Template;
  objects: BoardObject[];
}

export interface Notebook {
  pages: Page[];
  activePageId: string;
}

export function createPage(template: Template): Page {
  return { id: crypto.randomUUID(), template, objects: [] };
}

export function rectBetween(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
  };
}

export function contains(rect: Rect, point: Point) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}
