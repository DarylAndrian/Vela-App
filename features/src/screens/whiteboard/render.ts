import { drawInk, PAGE_HEIGHT, PAGE_WIDTH } from './ink';
import { rectBetween, type BoardObject, type Page, type Picture, type Raster, type Rect, type Shape } from './notebook';

export type Pictures = ReadonlyMap<string, Raster>;

function drawShape(context: CanvasRenderingContext2D, { kind, start, end, color, width }: Shape) {
  const rect = rectBetween(start, end);
  if (!rect.width && !rect.height) return;
  if (kind === 'Square' || kind === 'Circle') {
    const side = Math.max(rect.width, rect.height);
    rect.x = end.x < start.x ? start.x - side : start.x;
    rect.y = end.y < start.y ? start.y - side : start.y;
    rect.width = rect.height = side;
  }

  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (kind === 'Circle' || kind === 'Oval') {
    if (!rect.width || !rect.height) return;
    context.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
  } else if (kind === 'Square' || kind === 'Rectangle') {
    context.rect(rect.x, rect.y, rect.width, rect.height);
  } else {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    if (kind === 'Arrow') {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const tip = Math.min(Math.max(12, width * 3), Math.hypot(rect.width, rect.height) * 0.45);
      context.moveTo(end.x - tip * Math.cos(angle - Math.PI / 6), end.y - tip * Math.sin(angle - Math.PI / 6));
      context.lineTo(end.x, end.y);
      context.lineTo(end.x - tip * Math.cos(angle + Math.PI / 6), end.y - tip * Math.sin(angle + Math.PI / 6));
    }
  }
  context.stroke();
}

export function drawObject(context: CanvasRenderingContext2D, object: BoardObject, pictures: Pictures) {
  if (object.type === 'ink') drawInk(context, object);
  if (object.type === 'shape') drawShape(context, object);
  if (object.type === 'picture') {
    const image = pictures.get(object.id);
    if (image) context.drawImage(image.bitmap, object.x, object.y, object.width, object.height);
  }
}

export function drawPage(context: CanvasRenderingContext2D, page: Page, pictures: Pictures, replacement?: Picture) {
  for (const object of page.objects) {
    drawObject(context, replacement && object.type === 'picture' && object.id === replacement.id
      ? replacement : object, pictures);
  }
}

export function drawSelection(context: CanvasRenderingContext2D, rect: Rect, scale: number, picture: boolean) {
  context.strokeStyle = '#047857';
  context.lineWidth = 1.5 / scale;
  if (!picture) {
    context.fillStyle = 'rgba(16,185,129,0.13)';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.setLineDash([6 / scale, 4 / scale]);
  }
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  if (picture) {
    const size = 12 / scale;
    const x = rect.x + rect.width - size;
    const y = rect.y + rect.height - size;
    context.fillStyle = '#047857';
    context.fillRect(x, y, size, size);
    context.strokeStyle = '#ffffff';
    context.strokeRect(x, y, size, size);
  }
}

export function drawThumbnail(canvas: HTMLCanvasElement, page: Page, pictures: Pictures) {
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(canvas.width / PAGE_WIDTH, canvas.height / PAGE_HEIGHT);
  drawPage(context, page, pictures);
  context.restore();
}
