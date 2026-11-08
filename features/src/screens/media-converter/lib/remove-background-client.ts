import { removeBackground } from '@imgly/background-removal';

export type QualityMode = 'fast' | 'high';

// Served from the userData model cache by the main process (app://models).
export const MODELS_PUBLIC_PATH = 'app://models/background-removal/';

const EDGE_CONFIG = {
  fast: { blurRadius: 1 },
  high: { blurRadius: 2 },
} as const;

function smoothAlphaEdges(
  sourceCanvas: HTMLCanvasElement,
  blurRadius: number,
): HTMLCanvasElement {
  const { width, height } = sourceCanvas;
  const ctx = sourceCanvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const alpha = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const passes = Math.max(1, Math.round(blurRadius));
  let current = alpha;
  let next = new Float32Array(width * height);

  for (let pass = 0; pass < passes; pass++) {
    const radius = Math.ceil(blurRadius / passes);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width) {
            sum += current[y * width + nx];
            count++;
          }
        }
        next[y * width + x] = sum / count;
      }
    }

    const temp = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < height) {
            sum += next[ny * width + x];
            count++;
          }
        }
        temp[y * width + x] = sum / count;
      }
    }
    current = temp;
    next = new Float32Array(width * height);
  }

  const refinedAlpha = current;
  for (let i = 0; i < width * height; i++) {
    const original = alpha[i];
    if (original === 0) {
      refinedAlpha[i] = 0;
    } else if (original === 255) {
      refinedAlpha[i] = 255;
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d')!;
  const outImageData = outCtx.createImageData(width, height);
  const outData = outImageData.data;

  for (let i = 0; i < width * height; i++) {
    outData[i * 4 + 0] = data[i * 4 + 0];
    outData[i * 4 + 1] = data[i * 4 + 1];
    outData[i * 4 + 2] = data[i * 4 + 2];
    outData[i * 4 + 3] = Math.round(refinedAlpha[i]);
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
}

export async function removeBackgroundClient(
  file: File,
  quality: QualityMode,
  onProgress?: (message: string) => void,
): Promise<Blob> {
  onProgress?.('Initializing model (this may take a moment on first run)...');

  const edgeCfg = EDGE_CONFIG[quality];

  const resultBlob = await removeBackground(file, {
    publicPath: MODELS_PUBLIC_PATH,
    device: 'cpu',
    model: quality === 'fast' ? 'isnet_quint8' : 'isnet',
    progress: (key: string, current: number, total: number) => {
      if (key.includes('fetch')) {
        onProgress?.(`Loading AI models... ${Math.round((current / total) * 100)}%`);
      } else if (key === 'compute:inference') {
        onProgress?.('Processing image...');
      }
    },
  });

  onProgress?.('Smoothing edges...');

  const img = new Image();
  const url = URL.createObjectURL(resultBlob);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const smoothed = smoothAlphaEdges(canvas, edgeCfg.blurRadius);

      smoothed.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate output image.'));
          }
        },
        'image/png',
        1.0,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load processed image.'));
    };
    img.src = url;
  });
}