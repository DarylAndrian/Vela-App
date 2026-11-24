import { PDFDocument, radians } from 'pdf-lib';
import { getDocument, PDFWorker, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement extends Rectangle {
  id: number;
  page: number;
  signature: string;
}

export async function readPdf(file: File) {
  // Pass the local module worker explicitly for Electron's app:// scheme.
  const port = new Worker(workerUrl, { type: 'module' });
  const worker = PDFWorker.create({ port });
  const assets = import.meta.env.DEV ? './node_modules/pdfjs-dist/' : './pdf-assets/';
  const assetUrl = (folder: string) => new URL(assets + folder + '/', location.href).href;
  const close = async () => {
    try {
      await task?.destroy();
    } finally {
      worker.destroy();
      port.terminate();
    }
  };
  let task: ReturnType<typeof getDocument> | undefined;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    task = getDocument({
      data: bytes.slice(),
      worker,
      cMapUrl: assetUrl('cmaps'),
      standardFontDataUrl: assetUrl('standard_fonts'),
      wasmUrl: assetUrl('wasm'),
      iccUrl: assetUrl('iccs'),
      useWorkerFetch: false,
    });
    const doc = await task.promise;
    await PDFDocument.load(bytes, { updateMetadata: false });
    await doc.getPage(1);
    return { doc, bytes, close };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

export async function exportPdf(bytes: Uint8Array, preview: PDFDocumentProxy, placements: Placement[]) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  for (const placement of placements) {
    const { x, y, width, height, page, signature } = placement;
    let image = images.get(signature);
    if (!image) {
      image = await doc.embedPng(signature);
      images.set(signature, image);
    }

    const viewport = (await preview.getPage(page)).getViewport({ scale: 1 });
    const point = (u: number, v: number) => viewport.convertToPdfPoint(u * viewport.width, v * viewport.height);
    const [left, bottom] = point(x, y + height);
    const [rightX, rightY] = point(x + width, y + height);
    const [topX, topY] = point(x, y);
    doc.getPage(page - 1).drawImage(image, {
      x: left,
      y: bottom,
      width: Math.hypot(rightX - left, rightY - bottom),
      height: Math.hypot(topX - left, topY - bottom),
      rotate: radians(Math.atan2(rightY - bottom, rightX - left)),
    });
  }
  const output = await doc.save({ updateFieldAppearances: false });
  return new Blob([new Uint8Array(output)], { type: 'application/pdf' });
}
