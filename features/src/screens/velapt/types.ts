/** Shared shapes for the VelaPTP screens (loose typing over the ported JS core). */
export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export interface PageLayout {
  size: string;
  orientation: 'auto' | 'portrait' | 'landscape';
  marginMM: number;
  fit: 'fit' | 'fill';
  align: Point;
}

export type FilterId = 'original' | 'auto' | 'gray' | 'bw';

export interface Page {
  id: string;
  name: string;
  bitmap: ImageBitmap | HTMLCanvasElement;
  width: number;
  height: number;
  rotation: number;
  quad: Quad;
  filter: FilterId;
  brightness: number;
  contrast: number;
  confirmed: boolean;
  layout: PageLayout;
  thumb: string | null;
  _cache: Record<string, any>;
}
