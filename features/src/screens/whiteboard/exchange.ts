import { vela } from '../../lib/ipc';
import { blobToBase64, canvasToBlob } from '../picture/helpers';
import type { Page, Rect } from './notebook';
import { drawPage, type Pictures } from './render';

export function pastePlacement(bitmap: ImageBitmap, area: Rect): Rect {
  const scale = Math.min(1, area.width * 0.86 / bitmap.width, area.height * 0.86 / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

export async function exportRegion(page: Page, rect: Rect, pictures: Pictures, format: 'png' | 'jpg') {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const context = canvas.getContext('2d')!;
  if (format === 'jpg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.scale(scale, scale);
  context.translate(-rect.x, -rect.y);
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  drawPage(context, page, pictures);
  const blob = await canvasToBlob(canvas, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.94);
  const data = await blobToBase64(blob);
  if (format === 'png') {
    await vela().clipboard.writeImage(data);
    return true;
  }
  return !!await vela().files.save('Whiteboard selection.jpg', [{ name: 'JPEG image', extensions: ['jpg', 'jpeg'] }], data);
}
