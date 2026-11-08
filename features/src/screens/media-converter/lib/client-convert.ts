import JSZip from 'jszip';
import { getMimeType, getInputFormatFromFilename, normalizeOutputFormat, replaceFileExtension } from './formats';
import {
  browserSupportsWebpEncode,
  canvasToBlob,
  decodeImage,
  isBrowserDecodable,
} from './browser-image';
import { base64ToBlob, fileToBase64 } from './blob-base64';
import { getMedia } from './media-bridge';

// Canvas can encode these formats. GIF/TIFF outputs (and HEIC/TIFF inputs,
// which the browser cannot decode) fall back to the local sharp/heic engine.
const BROWSER_ENCODABLE = new Set(['jpg', 'png', 'webp']);

// High-quality single-pass encode. Unlike the compressor there is no byte
// target, so we use a fixed quality instead of an iterative loop.
const ENCODE_QUALITY = 0.9;

function mimeTypeFor(format: string): string {
  if (format === 'webp') return 'image/webp';
  if (format === 'png') return 'image/png';
  return 'image/jpeg';
}

async function convertInBrowser(
  file: File,
  format: string,
): Promise<{ blob: Blob; filename: string }> {
  const image = await decodeImage(file);

  try {
    let outputFormat = format;

    if (outputFormat === 'webp' && !(await browserSupportsWebpEncode())) {
      outputFormat = 'jpg';
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context is unavailable in this browser.');
    }

    // JPEG has no alpha channel; paint white so transparency doesn't turn black.
    if (outputFormat === 'jpg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(image.source, 0, 0);

    const quality = outputFormat === 'png' ? undefined : ENCODE_QUALITY;
    const blob = await canvasToBlob(canvas, mimeTypeFor(outputFormat), quality);

    return { blob, filename: replaceFileExtension(file.name, outputFormat) };
  } finally {
    image.cleanup();
  }
}

// Local fallback for formats the browser cannot decode (HEIC/TIFF) or encode
// (GIF/TIFF). Runs sharp + heic-convert in the Electron main process.
async function convertViaMain(
  file: File,
  format: string,
): Promise<{ blob: Blob; filename: string }> {
  const media = getMedia();
  const inputBase64 = await fileToBase64(file);
  const inputFormat = getInputFormatFromFilename(file.name);

  const result = await media.imageConvert({ inputBase64, inputFormat, outputFormat: format });

  if (!result.ok || !result.dataBase64) {
    throw new Error(result.error ?? `Failed to convert ${file.name}.`);
  }

  const outputFormat = normalizeOutputFormat(format);
  const blob = base64ToBlob(result.dataBase64, getMimeType(outputFormat));
  return { blob, filename: replaceFileExtension(file.name, outputFormat) };
}

export async function convertSingleFile(
  file: File,
  format: string,
): Promise<{ blob: Blob; filename: string }> {
  if (isBrowserDecodable(file.name) && BROWSER_ENCODABLE.has(format)) {
    return convertInBrowser(file, format);
  }

  return convertViaMain(file, format);
}

export async function convertFilesToZip(
  files: File[],
  format: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> {
  const zip = new JSZip();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const { blob, filename } = await convertSingleFile(file, format);
    zip.file(filename, blob);
    onProgress?.(index + 1, files.length);
  }

  return zip.generateAsync({ type: 'blob' });
}