/** Layout and canvas drawing for a row (or wrapped rows) of pictures joined by centered arrows. */

export const CANVAS_LIMIT = 16000

export interface LayoutImage {
  width: number
  height: number
}

export interface ComposeOptions {
  mode: 'row' | 'wrap'
  perRow: number
  matchHeights: boolean
  gap: number
  padding: number
  arrowColor: string
  arrowThickness: number
  arrowHeadSize: number
  /** `'transparent'` or any CSS color. */
  background: string
}

export interface ImageRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ArrowSegment {
  x1: number
  y: number
  x2: number
}

export interface CompositeLayout {
  /** Logical size, before the browser canvas limit is applied. */
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
  scale: number
  canvasLimited: boolean
  rects: ImageRect[]
  arrows: ArrowSegment[]
}

const EMPTY: CompositeLayout = {
  width: 0,
  height: 0,
  pixelWidth: 0,
  pixelHeight: 0,
  scale: 1,
  canvasLimited: false,
  rects: [],
  arrows: [],
}

export function computeLayout(images: LayoutImage[], opts: ComposeOptions): CompositeLayout {
  if (images.length === 0) return EMPTY

  const perRow = opts.mode === 'wrap' ? Math.max(1, Math.floor(opts.perRow)) : images.length
  const rows: LayoutImage[][] = []
  for (let i = 0; i < images.length; i += perRow) rows.push(images.slice(i, i + perRow))

  const gap = Math.max(0, opts.gap)
  const padding = Math.max(0, opts.padding)
  const rects: ImageRect[] = []
  const arrows: ArrowSegment[] = []
  let canvasWidth = 0
  let y = padding

  rows.forEach((row, rowIndex) => {
    const sized = sizeRow(row, opts.matchHeights)
    const rowHeight = Math.max(...sized.map(item => item.height))
    const arrowY = y + rowHeight / 2
    const lead = rowIndex > 0 ? gap : 0
    const trail = rowIndex < rows.length - 1 ? gap : 0
    let x = padding + lead

    if (lead > 0) {
      arrows.push({ x1: padding, y: arrowY, x2: padding + lead })
    }

    sized.forEach((item, index) => {
      rects.push({
        x,
        y: y + (rowHeight - item.height) / 2,
        width: item.width,
        height: item.height,
      })
      x += item.width
      if (index < sized.length - 1) {
        arrows.push({ x1: x, y: arrowY, x2: x + gap })
        x += gap
      }
    })

    if (trail > 0) {
      arrows.push({ x1: x, y: arrowY, x2: x + trail })
      x += trail
    }

    canvasWidth = Math.max(canvasWidth, x + padding)
    y += rowHeight
    if (rowIndex < rows.length - 1) y += gap
  })

  const width = Math.max(1, Math.round(canvasWidth))
  const height = Math.max(1, Math.round(y + padding))
  const maxDim = Math.max(width, height)
  const scale = maxDim > CANVAS_LIMIT ? CANVAS_LIMIT / maxDim : 1

  return {
    width,
    height,
    pixelWidth: Math.max(1, Math.floor(width * scale)),
    pixelHeight: Math.max(1, Math.floor(height * scale)),
    scale,
    canvasLimited: scale < 1,
    rects,
    arrows,
  }
}

function sizeRow(row: LayoutImage[], matchHeights: boolean): { width: number; height: number }[] {
  if (!matchHeights || row.length === 0) {
    return row.map(item => ({
      width: Math.max(1, Math.round(item.width)),
      height: Math.max(1, Math.round(item.height)),
    }))
  }
  const target = Math.max(1, Math.min(...row.map(item => item.height)))
  return row.map(item => {
    const scale = target / item.height
    return {
      width: Math.max(1, Math.round(item.width * scale)),
      height: target,
    }
  })
}

export function drawComposite(
  canvas: HTMLCanvasElement,
  sources: CanvasImageSource[],
  layout: CompositeLayout,
  opts: Pick<ComposeOptions, 'background' | 'arrowColor' | 'arrowThickness' | 'arrowHeadSize'>,
): void {
  canvas.width = layout.pixelWidth
  canvas.height = layout.pixelHeight
  const ctx = canvas.getContext('2d')
  if (!ctx || layout.width === 0) return

  ctx.setTransform(layout.scale, 0, 0, layout.scale, 0, 0)
  ctx.clearRect(0, 0, layout.width, layout.height)
  if (opts.background !== 'transparent') {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, layout.width, layout.height)
  }

  layout.rects.forEach((rect, index) => {
    const source = sources[index]
    if (!source) return
    ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height)
  })

  for (const arrow of layout.arrows) {
    drawArrow(ctx, arrow, opts)
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowSegment,
  opts: Pick<ComposeOptions, 'arrowColor' | 'arrowThickness' | 'arrowHeadSize'>,
): void {
  const span = arrow.x2 - arrow.x1
  if (span <= 2) return
  const inset = Math.min(4, span / 6)
  const x1 = arrow.x1 + inset
  const x2 = arrow.x2 - inset
  const usable = x2 - x1
  if (usable <= 2) return

  const head = Math.min(Math.max(6, opts.arrowHeadSize), usable * 0.7)
  const headWidth = head * 0.72
  const y = arrow.y

  ctx.save()
  ctx.strokeStyle = opts.arrowColor
  ctx.fillStyle = opts.arrowColor
  ctx.lineWidth = Math.max(1, opts.arrowThickness)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2 - head, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y)
  ctx.lineTo(x2 - head, y - headWidth / 2)
  ctx.lineTo(x2 - head, y + headWidth / 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
