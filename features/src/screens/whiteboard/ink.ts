export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

export interface Point {
  x: number;
  y: number;
}

export interface InkSample extends Point {
  pressure: number;
}

export interface Brush {
  color: string;
  width: number;
  sensitivity: number;
}

export interface Stroke {
  type: 'ink';
  brush: Brush;
  samples: InkSample[];
}

function radius(sample: InkSample, brush: Brush) {
  return brush.width * (0.2 + 0.8 * sample.pressure ** (1 / brush.sensitivity)) / 2;
}

export function drawInk(context: CanvasRenderingContext2D, { brush, samples }: Stroke, from = 0) {
  if (from >= samples.length) return;
  context.fillStyle = brush.color;
  context.beginPath();

  for (let i = from; i < samples.length; i++) {
    const point = samples[i];
    const r = radius(point, brush);
    const previous = samples[i - 1];
    if (previous) {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const nx = -dy / distance;
        const ny = dx / distance;
        const previousRadius = radius(previous, brush);
        context.moveTo(previous.x - nx * previousRadius, previous.y - ny * previousRadius);
        context.lineTo(point.x - nx * r, point.y - ny * r);
        context.lineTo(point.x + nx * r, point.y + ny * r);
        context.lineTo(previous.x + nx * previousRadius, previous.y + ny * previousRadius);
        context.closePath();
      }
    }
    context.moveTo(point.x + r, point.y);
    context.arc(point.x, point.y, r, 0, Math.PI * 2);
    context.closePath();
  }
  context.fill();
}
