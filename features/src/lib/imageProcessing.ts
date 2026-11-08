/** Decode, shrink, and compress an uploaded picture before it joins the composite. */

export const MAX_HEIGHT = 1000
export const MAX_BYTES = 1024 * 1024

const QUALITIES = [0.92, 0.84, 0.76, 0.68, 0.6]
const SHRINK = 0.85
const MIN_EDGE = 64

export interface ProcessedImage {
  id: string
  blob: Blob
  url: string
  width: number
  height: number
  name: string
}

export async function normalizeImage(file: File): Promise<ProcessedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`Couldn't read “${file.name || 'image'}”. This format may not be supported in this browser.`)
  }

  try {
    if (bitmap.width < 1 || bitmap.height < 1) {
      throw new Error(`“${file.name || 'image'}” has no visible pixels.`)
    }

    const hasAlpha = imageMayHaveAlpha(file) && bitmapHasAlpha(bitmap)
    let width = bitmap.width
    let height = bitmap.height
    if (height > MAX_HEIGHT) {
      const scale = MAX_HEIGHT / height
      width = Math.max(1, Math.round(bitmap.width * scale))
      height = MAX_HEIGHT
    }

    const blob = await encodeWithinLimit(bitmap, width, height, hasAlpha)
    const size = await measureBlob(blob)
    return {
      id: crypto.randomUUID(),
      blob,
      url: URL.createObjectURL(blob),
      width: size.width,
      height: size.height,
      name: file.name || 'image',
    }
  } finally {
    bitmap.close()
  }
}

function imageMayHaveAlpha(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/bmp') return false
  return true
}

/** Sample a small draw of the bitmap. Full-frame scans are unnecessary for this decision. */
function bitmapHasAlpha(bitmap: ImageBitmap): boolean {
  const canvas = document.createElement('canvas')
  const w = Math.min(bitmap.width, 64)
  const h = Math.min(bitmap.height, 64)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(bitmap, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 250) return true
  }
  return false
}

async function encodeWithinLimit(
  bitmap: ImageBitmap,
  startWidth: number,
  startHeight: number,
  hasAlpha: boolean,
): Promise<Blob> {
  let width = startWidth
  let height = startHeight
  let smallest: Blob | null = null

  for (let pass = 0; pass < 12; pass++) {
    const png = await renderBlob(bitmap, width, height, 'image/png')
    if (png && (!smallest || png.size < smallest.size)) smallest = png
    if (png && png.size <= MAX_BYTES) return png

    const lossyType = hasAlpha ? 'image/webp' : 'image/jpeg'
    for (const quality of QUALITIES) {
      const lossy = await renderBlob(bitmap, width, height, lossyType, quality, !hasAlpha)
      const candidate = lossy ?? (lossyType === 'image/webp'
        ? await renderBlob(bitmap, width, height, 'image/png')
        : null)
      if (candidate && (!smallest || candidate.size < smallest.size)) smallest = candidate
      if (candidate && candidate.size <= MAX_BYTES) return candidate
      if (!lossy && lossyType === 'image/webp') break
    }

    if (Math.min(width, height) <= MIN_EDGE) break
    width = Math.max(1, Math.round(width * SHRINK))
    height = Math.max(1, Math.round(height * SHRINK))
  }

  if (!smallest) throw new Error('Could not encode this image.')
  return smallest
}

function renderBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string,
  quality?: number,
  fillWhite = false,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (fillWhite) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), type, quality)
  })
}

function measureBlob(blob: Blob): Promise<{ width: number; height: number }> {
  return createImageBitmap(blob).then(decoded => {
    const size = { width: decoded.width, height: decoded.height }
    decoded.close()
    return size
  })
}
