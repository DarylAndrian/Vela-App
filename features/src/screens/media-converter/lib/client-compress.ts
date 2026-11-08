import JSZip from 'jszip';
import { getMimeType, normalizeOutputFormat, replaceFileExtension } from './formats';
import { COMPRESS_DEFAULT_TARGET_BYTES } from './compress-defaults';
import {
  browserSupportsWebpEncode,
  canvasToBlob,
  decodeImage,
  isBrowserDecodable,
  getExtension,
  type DecodedImage,
} from './browser-image';
import { base64ToBlob, fileToBase64 } from './blob-base64';
import { getMedia } from './media-bridge';

export type CompressFormatPreference = 'keep' | 'jpg' | 'png' | 'webp' | 'gif' | 'tiff';

export interface CompressRequestOptions {
  targetBytes: number;
  format: CompressFormatPreference;
}

// Mirrors the local quality/resize loop, but expressed in canvas quality units
// (0..1) instead of sharp's 0..100 scale.
const MIN_QUALITY = 0.3;
const QUALITY_STEP = 0.05;
const START_QUALITY = 0.85;
const RESET_QUALITY = 0.8;
const SCALE_FACTOR = 0.9;
const MIN_DIMENSION = 16;

// Inputs that can be returned as-is when already under the target size.
const KEEPABLE_AS_IS = new Set(['jpg', 'jpeg', 'png', 'webp']);

type ClientOutputFormat = 'jpg' | 'png' | 'webp';

// Canvas cannot encode GIF or TIFF. GIF requests go to the local sharp engine
// (which keeps the GIF format); TIFF requests compress as PNG here, matching
// the source app's palette loop.
function resolveClientOutput(
  inputExt: string,
  preference: CompressFormatPreference,
): ClientOutputFormat {
  if (preference === 'keep') {
    if (inputExt === 'png') return 'png';
    if (inputExt === 'webp') return 'webp';
    if (inputExt === 'gif') return 'png';
    return 'jpg';
  }

  switch (preference) {
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'gif':
    case 'tiff':
      return 'png';
    default:
      return 'jpg';
  }
}

function mimeTypeFor(format: ClientOutputFormat): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    default:
      return 'image/jpeg';
  }
}

async function encodeFrame(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  mime: string,
  quality?: number,
): Promise<Blob> {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  context.drawImage(source, 0, 0, width, height);
  return canvasToBlob(canvas, mime, quality);
}

async function lossyCompressToTarget(
  canvas: HTMLCanvasElement,
  image: DecodedImage,
  mime: string,
  targetBytes: number,
): Promise<Blob> {
  let width = image.width;
  let height = image.height;
  let startQuality = START_QUALITY;
  let lastBlob: Blob | null = null;

  while (true) {
    let quality = startQuality;
    let matched: Blob | null = null;

    while (quality >= MIN_QUALITY) {
      const blob = await encodeFrame(canvas, image.source, width, height, mime, quality);
      lastBlob = blob;

      if (blob.size < targetBytes) {
        matched = blob;
        break;
      }

      quality -= QUALITY_STEP;
    }

    if (matched) {
      return matched;
    }

    const nextWidth = Math.max(MIN_DIMENSION, Math.floor(width * SCALE_FACTOR));
    const nextHeight = Math.max(MIN_DIMENSION, Math.floor(height * SCALE_FACTOR));

    if (nextWidth === width && nextHeight === height) {
      return lastBlob ?? (await encodeFrame(canvas, image.source, width, height, mime, MIN_QUALITY));
    }

    width = nextWidth;
    height = nextHeight;
    startQuality = RESET_QUALITY;
  }
}

async function losslessCompressToTarget(
  canvas: HTMLCanvasElement,
  image: DecodedImage,
  targetBytes: number,
): Promise<{ blob: Blob; extension: 'png' | 'jpg' }> {
  let width = image.width;
  let height = image.height;
  let lastPng: Blob | null = null;

  while (width >= MIN_DIMENSION && height >= MIN_DIMENSION) {
    const encoded = await encodeFrame(canvas, image.source, width, height, 'image/png');
    lastPng = encoded;

    if (encoded.size < targetBytes) {
      return { blob: encoded, extension: 'png' };
    }

    const nextWidth = Math.max(MIN_DIMENSION, Math.floor(width * SCALE_FACTOR));
    const nextHeight = Math.max(MIN_DIMENSION, Math.floor(height * SCALE_FACTOR));

    if (nextWidth === width && nextHeight === height) {
      break;
    }

    width = nextWidth;
    height = nextHeight;
  }

  // PNG is lossless, so fall back to JPEG when it cannot fit and is larger.
  const jpeg = await lossyCompressToTarget(canvas, image, 'image/jpeg', targetBytes);

  if (lastPng && jpeg.size >= lastPng.size) {
    return { blob: lastPng, extension: 'png' };
  }

  return { blob: jpeg, extension: 'jpg' };
}

async function compressInBrowser(
  file: File,
  options: CompressRequestOptions,
): Promise<{ blob: Blob; filename: string }> {
  const inputExt = getExtension(file.name);
  const targetBytes =
    options.targetBytes > 0 ? options.targetBytes : COMPRESS_DEFAULT_TARGET_BYTES;

  if (
    options.format === 'keep' &&
    KEEPABLE_AS_IS.has(inputExt) &&
    file.size <= targetBytes
  ) {
    return { blob: file, filename: file.name };
  }

  const image = await decodeImage(file);

  try {
    let outputFormat = resolveClientOutput(inputExt, options.format);

    if (outputFormat === 'webp' && !(await browserSupportsWebpEncode())) {
      outputFormat = 'jpg';
    }

    const canvas = document.createElement('canvas');
    let blob: Blob;
    let extension: ClientOutputFormat;

    if (outputFormat === 'png') {
      const result = await losslessCompressToTarget(canvas, image, targetBytes);
      blob = result.blob;
      extension = result.extension;
    } else {
      blob = await lossyCompressToTarget(
        canvas,
        image,
        mimeTypeFor(outputFormat),
        targetBytes,
      );
      extension = outputFormat;
    }

    return { blob, filename: replaceFileExtension(file.name, extension) };
  } finally {
    image.cleanup();
  }
}

// Local fallback for formats the browser cannot decode (HEIC/TIFF). Runs the
// sharp quality/resize loop in the Electron main process.
async function compressViaMain(
  file: File,
  options: CompressRequestOptions,
): Promise<{ blob: Blob; filename: string }> {
  const media = getMedia();
  const inputBase64 = await fileToBase64(file);
  const inputFormat = getExtension(file.name);

  const result = await media.imageCompress({
    inputBase64,
    inputFormat,
    targetBytes: options.targetBytes,
    format: options.format,
  });

  if (!result.ok || !result.dataBase64) {
    throw new Error(result.error ?? `Failed to compress ${file.name}.`);
  }

  const extension = normalizeOutputFormat(result.extension ?? 'jpg');
  const blob = base64ToBlob(result.dataBase64, getMimeType(extension));
  const filename =
    options.format === 'keep' && extension === inputFormat
      ? file.name
      : replaceFileExtension(file.name, extension);
  return { blob, filename };
}

export async function compressSingleFile(
  file: File,
  options: CompressRequestOptions,
): Promise<{ blob: Blob; filename: string }> {
  // GIF output (and keep-as-GIF) needs the sharp engine — canvas cannot encode
  // GIF, and re-encoding to PNG would silently change the format.
  const needsMain =
    !isBrowserDecodable(file.name) ||
    options.format === 'gif' ||
    (options.format === 'keep' && getExtension(file.name) === 'gif');

  if (needsMain) {
    return compressViaMain(file, options);
  }

  return compressInBrowser(file, options);
}

export async function compressFilesToZip(
  files: File[],
  options: CompressRequestOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> {
  const zip = new JSZip();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const { blob, filename } = await compressSingleFile(file, options);
    zip.file(filename, blob);
    onProgress?.(index + 1, files.length);
  }

  return zip.generateAsync({ type: 'blob' });
}

// A soft, browser-memory warning rather than a hard upload cap.
export const COMPRESS_LARGE_FILE_BYTES = 100 * 1024 * 1024;

export function hasLargeFiles(files: File[]): boolean {
  return files.some((file) => file.size > COMPRESS_LARGE_FILE_BYTES);
}