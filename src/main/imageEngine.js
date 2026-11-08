const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const mediaEngine = require('./mediaEngine');

// Local image engine for formats the renderer cannot decode (HEIC/TIFF) or
// encode (GIF/TIFF). Port of the web app's sharp converter + quality/resize
// compression loop; small images cross IPC as base64 so the blob/ZIP download
// UX is preserved. HEIC decodes through heic-convert (sharp's prebuilt libheif
// only handles AVIF); BMP decodes through the bundled ffmpeg.

const OUTPUT_FORMATS = ['jpg', 'png', 'webp', 'tiff', 'gif'];

const MIN_QUALITY = 30;
const QUALITY_STEP = 5;
const START_QUALITY = 85;
const RESET_QUALITY = 80;
const SCALE_FACTOR = 0.9;
const MIN_DIMENSION = 16;
const PALETTE_STEPS = [256, 128, 64, 32, 16];
const DEFAULT_TARGET_BYTES = Math.floor(1.5 * 1024 * 1024);

let sharpLib = null;
function getSharp() {
  if (!sharpLib) sharpLib = require('sharp');
  return sharpLib;
}

function normalizeOutputFormat(format) {
  const normalized = String(format || '').toLowerCase().replace(/^\./, '');
  if (normalized === 'jpeg') return 'jpg';
  if (!OUTPUT_FORMATS.includes(normalized)) {
    throw new Error(`Unsupported output format: ${format}`);
  }
  return normalized;
}

function normalizeInputFormat(inputFormat) {
  const normalized = String(inputFormat || '').toLowerCase().replace(/^\./, '');
  if (normalized === 'jpeg') return 'jpg';
  if (normalized === 'tif') return 'tiff';
  return normalized;
}

function isHeicFormat(format) {
  return format === 'heic' || format === 'heif';
}

async function decodeHeic(inputBuffer) {
  const heicConvert = require('heic-convert');
  // heic-decode requires a Uint8Array — an ArrayBuffer breaks its brand sniff.
  const decoded = await heicConvert({
    buffer: new Uint8Array(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength),
    format: 'PNG',
    quality: 1,
  });
  return Buffer.from(decoded);
}

async function decodeViaFfmpeg(inputBuffer, ext) {
  const ffmpegPath = mediaEngine.resolveFfmpeg();
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error('The ffmpeg binary could not be found.');
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-img-'));
  const inputPath = path.join(tmpDir, `input.${ext}`);
  fs.writeFileSync(inputPath, inputBuffer);
  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn(
        ffmpegPath,
        ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'],
        { windowsHide: true },
      );
      const chunks = [];
      let stderr = '';
      proc.stdout.on('data', (chunk) => chunks.push(chunk));
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks));
        else reject(new Error(stderr.trim().split('\n').pop() || `ffmpeg exited with code ${code}.`));
      });
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function prepareBuffer(inputBuffer, inputFormat) {
  const normalized = normalizeInputFormat(inputFormat);
  if (isHeicFormat(normalized)) return decodeHeic(inputBuffer);
  if (normalized === 'bmp') return decodeViaFfmpeg(inputBuffer, 'bmp');
  return inputBuffer;
}

async function encodeBuffer(inputBuffer, targetFormat) {
  let pipeline = getSharp()(inputBuffer, { failOn: 'none' });

  switch (targetFormat) {
    case 'jpg':
      pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9 });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality: 90 });
      break;
    case 'tiff':
      pipeline = pipeline.tiff({ compression: 'lzw' });
      break;
    case 'gif':
      pipeline = pipeline.gif();
      break;
    default:
      throw new Error(`Unsupported output format: ${targetFormat}`);
  }

  return { buffer: await pipeline.toBuffer(), extension: targetFormat };
}

async function convertImage(inputBuffer, inputFormat, outputFormat) {
  const targetFormat = normalizeOutputFormat(outputFormat);
  return encodeBuffer(await prepareBuffer(inputBuffer, inputFormat), targetFormat);
}

function pickFormatForInput(inputFormat) {
  switch (inputFormat) {
    case 'jpg':
    case 'png':
    case 'webp':
    case 'gif':
      return inputFormat;
    default:
      return 'jpg';
  }
}

async function encodeJpeg(buffer, width, height, quality) {
  return getSharp()(buffer, { failOn: 'none' })
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

async function encodeWebp(buffer, width, height, quality) {
  return getSharp()(buffer, { failOn: 'none' })
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

async function encodePngPalette(buffer, width, height, colours) {
  const usePalette = colours < 256;
  return getSharp()(buffer, { failOn: 'none' })
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .png({
      compressionLevel: 9,
      palette: usePalette,
      colours: usePalette ? colours : undefined,
      effort: 10,
    })
    .toBuffer();
}

async function encodeGifPalette(buffer, width, height, colours) {
  const usePalette = colours < 256;
  return getSharp()(buffer, { failOn: 'none', animated: true })
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .gif({ colours: usePalette ? colours : 256, effort: 10 })
    .toBuffer();
}

async function tryAllQualityLevels(encoder, width, height, startQuality, targetBytes) {
  let quality = startQuality;
  let lastBuffer = null;

  while (quality >= MIN_QUALITY) {
    const buffer = await encoder(width, height, quality);
    lastBuffer = buffer;
    if (buffer.length < targetBytes) return { buffer, quality };
    quality -= QUALITY_STEP;
  }

  return lastBuffer ? { buffer: lastBuffer, quality: MIN_QUALITY } : null;
}

function nextDimensions(width, height) {
  return {
    width: Math.max(MIN_DIMENSION, Math.floor(width * SCALE_FACTOR)),
    height: Math.max(MIN_DIMENSION, Math.floor(height * SCALE_FACTOR)),
  };
}

async function lossyCompressToTarget(buffer, startWidth, startHeight, targetBytes, encode) {
  let width = startWidth;
  let height = startHeight;
  let startQuality = START_QUALITY;

  for (;;) {
    const attempt = await tryAllQualityLevels(
      (w, h, q) => encode(buffer, w, h, q),
      width,
      height,
      startQuality,
      targetBytes,
    );

    if (attempt && attempt.buffer.length < targetBytes) return attempt.buffer;

    const next = nextDimensions(width, height);
    if (next.width === width && next.height === height) {
      return attempt?.buffer ?? (await encode(buffer, width, height, MIN_QUALITY));
    }

    width = next.width;
    height = next.height;
    startQuality = RESET_QUALITY;
  }
}

async function compressAsPng(buffer, startWidth, startHeight, targetBytes) {
  let width = startWidth;
  let height = startHeight;
  let lastPng = null;

  while (width >= MIN_DIMENSION && height >= MIN_DIMENSION) {
    for (const colours of PALETTE_STEPS) {
      const encoded = await encodePngPalette(buffer, width, height, colours);
      lastPng = encoded;
      if (encoded.length < targetBytes) return { buffer: encoded, extension: 'png' };
    }

    const next = nextDimensions(width, height);
    if (next.width === width && next.height === height) break;
    width = next.width;
    height = next.height;
  }

  const jpegBuffer = await lossyCompressToTarget(buffer, startWidth, startHeight, targetBytes, encodeJpeg);
  if (lastPng && jpegBuffer.length >= lastPng.length) {
    return { buffer: lastPng, extension: 'png' };
  }
  return { buffer: jpegBuffer, extension: 'jpg' };
}

async function compressAsGif(buffer, startWidth, startHeight, targetBytes) {
  let width = startWidth;
  let height = startHeight;
  let lastGif = null;

  while (width >= MIN_DIMENSION && height >= MIN_DIMENSION) {
    for (const colours of PALETTE_STEPS) {
      const encoded = await encodeGifPalette(buffer, width, height, colours);
      lastGif = encoded;
      if (encoded.length < targetBytes) return { buffer: encoded, extension: 'gif' };
    }

    const next = nextDimensions(width, height);
    if (next.width === width && next.height === height) break;
    width = next.width;
    height = next.height;
  }

  const jpegBuffer = await lossyCompressToTarget(buffer, startWidth, startHeight, targetBytes, encodeJpeg);
  if (lastGif && jpegBuffer.length >= lastGif.length) {
    return { buffer: lastGif, extension: 'gif' };
  }
  return { buffer: jpegBuffer, extension: 'jpg' };
}

async function compressWorkingBuffer(workingBuffer, normalizedInput, originalSize, targetBytes, formatPreference) {
  const sharp = getSharp();
  const metadata = await sharp(workingBuffer, { failOn: 'none' }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error(`Could not read dimensions for ${normalizedInput || 'input'} file.`);
  }

  const chosenFormat =
    formatPreference === 'keep'
      ? pickFormatForInput(normalizedInput)
      : normalizeOutputFormat(formatPreference);

  const formatChanged =
    chosenFormat !== normalizedInput &&
    !(normalizedInput === 'jpg' && chosenFormat === 'jpg');

  if (originalSize < targetBytes && !formatChanged) {
    return { buffer: workingBuffer, extension: chosenFormat };
  }

  switch (chosenFormat) {
    case 'png':
    case 'tiff':
      return compressAsPng(workingBuffer, width, height, targetBytes);
    case 'gif':
      return compressAsGif(workingBuffer, width, height, targetBytes);
    case 'webp':
      return {
        buffer: await lossyCompressToTarget(workingBuffer, width, height, targetBytes, encodeWebp),
        extension: 'webp',
      };
    default:
      return {
        buffer: await lossyCompressToTarget(workingBuffer, width, height, targetBytes, encodeJpeg),
        extension: 'jpg',
      };
  }
}

async function compressImageToTarget(inputBuffer, inputFormat, options) {
  const targetBytes = options.targetBytes > 0 ? options.targetBytes : DEFAULT_TARGET_BYTES;
  const normalizedInput = normalizeInputFormat(inputFormat);
  const formatPreference = options.formatPreference || 'keep';

  const workingBuffer = await prepareBuffer(inputBuffer, inputFormat);
  return compressWorkingBuffer(workingBuffer, normalizedInput, inputBuffer.length, targetBytes, formatPreference);
}

function registerIpc() {
  ipcMain.handle('media:image-convert', async (_e, req) => {
    try {
      const { inputBase64, inputFormat, outputFormat } = req || {};
      if (!inputBase64) return { ok: false, error: 'No image data received.' };
      const result = await convertImage(Buffer.from(inputBase64, 'base64'), inputFormat, outputFormat);
      return { ok: true, dataBase64: result.buffer.toString('base64') };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('media:image-compress', async (_e, req) => {
    try {
      const { inputBase64, inputFormat, targetBytes, format } = req || {};
      if (!inputBase64) return { ok: false, error: 'No image data received.' };
      const result = await compressImageToTarget(Buffer.from(inputBase64, 'base64'), inputFormat, {
        targetBytes: Number(targetBytes) || 0,
        formatPreference: format || 'keep',
      });
      return { ok: true, dataBase64: result.buffer.toString('base64'), extension: result.extension };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

module.exports = { registerIpc, convertImage, compressImageToTarget };