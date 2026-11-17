import { vela } from '../../lib/ipc';
import { TOKEN } from '../../styles/tokenValues';

/** Measure the rendered mermaid SVG inside the preview pane. */
export function measureMermaidSvg(): { svg: SVGSVGElement; width: number; height: number } | null {
  const host = document.querySelector('.mermaid-host') as HTMLElement | null;
  const svg = host?.querySelector('svg') as SVGSVGElement | null;
  if (!svg) return null;

  const viewBox = svg.getAttribute('viewBox');
  let width = 800;
  let height = 600;
  if (viewBox) {
    const parts = viewBox.split(/[ ,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2];
      height = parts[3];
    }
  } else {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      width = rect.width;
      height = rect.height;
    }
  }
  return { svg, width, height };
}

/** Clone the SVG for export: strip overlays (keep Mermaid's <style> tags),
 *  set xmlns, lock width/height for exact rasterization. */
export function cloneSvgForExport(svg: SVGSVGElement, width: number, height: number): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export-ignore], .node-style-toolbar').forEach((n) => n.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', width.toString());
  clone.setAttribute('height', height.toString());
  clone.removeAttribute('style');
  return clone;
}

export function safeFilename(rawTitle: string | undefined, id: number | undefined): string {
  const base = (rawTitle && rawTitle.trim()) || `chart-${id ?? 'untitled'}`;
  return base
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `chart-${id ?? 'untitled'}`;
}

function blobToBase64(blob: Blob): Promise<string> {
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

async function rasterize(format: 'png' | 'jpeg', isDark: boolean): Promise<Blob> {
  const measured = measureMermaidSvg();
  if (!measured) throw new Error('Could not find the chart preview. Make sure it has finished rendering.');
  const { svg, width, height } = measured;
  const padding = 40;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = (width + padding * 2) * scale;
  canvas.height = (height + padding * 2) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas export is not supported.');
  ctx.scale(scale, scale);
  ctx.fillStyle = isDark ? TOKEN.bgDark : TOKEN.bgLight;
  ctx.fillRect(0, 0, width + padding * 2, height + padding * 2);

  const cloned = cloneSvgForExport(svg, width, height);
  const svgString = new XMLSerializer().serializeToString(cloned);
  const encoded = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));

  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, width, height);
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode image. The chart may be too large.'))),
        mime,
        format === 'jpeg' ? 0.92 : undefined,
      );
    };
    img.onerror = () => reject(new Error('Failed to render chart to image.'));
    img.src = encoded;
  });
}

/** Rasterize the chart SVG to PNG/JPEG and save via the native save dialog. */
export async function exportRaster(format: 'png' | 'jpeg', isDark: boolean, title: string, chartId?: number): Promise<string> {
  const blob = await rasterize(format, isDark);
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const saved = await vela().files.save(
    `${safeFilename(title, chartId)}.${ext}`,
    [{ name: format === 'jpeg' ? 'JPEG image' : 'PNG image', extensions: [ext] }],
    await blobToBase64(blob),
  );
  if (!saved) throw new Error('SAVE_CANCELLED');
  return saved;
}

export async function copyPngToClipboard(isDark: boolean): Promise<void> {
  await vela().clipboard.writeImage(await blobToBase64(await rasterize('png', isDark)));
}

/** Save the raw SVG (vector) via the native save dialog. */
export async function exportSvg(isDark: boolean, title: string, chartId?: number): Promise<string> {
  void isDark;
  const measured = measureMermaidSvg();
  if (!measured) throw new Error('Could not find the chart preview. Make sure it has finished rendering.');
  const { svg, width, height } = measured;
  const cloned = cloneSvgForExport(svg, width, height);
  const svgString = new XMLSerializer().serializeToString(cloned);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const saved = await vela().files.save(
    `${safeFilename(title, chartId)}.svg`,
    [{ name: 'SVG image', extensions: ['svg'] }],
    await blobToBase64(blob),
  );
  if (!saved) throw new Error('SAVE_CANCELLED');
  return saved;
}
