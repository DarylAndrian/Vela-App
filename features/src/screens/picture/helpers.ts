import type { ConnectorSettings } from './types';

const imageCache = new Map<string, HTMLImageElement>();

export function releaseImage(url: string) {
  imageCache.delete(url);
  URL.revokeObjectURL(url);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(url, image);
      resolve(image);
    };
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = url;
  });
}

export function hasFiles(data: DataTransfer | null): boolean {
  return !!data && [...data.types].includes('Files');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileStamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), type, quality);
  });
}

export async function exportBlob(canvas: HTMLCanvasElement, settings: ConnectorSettings): Promise<Blob> {
  if (settings.format === 'jpeg') {
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    if (!ctx) return canvasToBlob(canvas, 'image/jpeg', settings.quality);
    ctx.fillStyle = settings.background === 'transparent' ? '#ffffff' : settings.background;
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    return canvasToBlob(flat, 'image/jpeg', settings.quality);
  }
  return canvasToBlob(canvas, 'image/png');
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read export data'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToFile(name: string, dataBase64: string): File {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name);
}
