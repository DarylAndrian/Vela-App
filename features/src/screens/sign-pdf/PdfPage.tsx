import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { Placement, Rectangle } from './pdf';
import type { Signature } from './SignatureDialog';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
const style = ({ x, y, width, height }: Rectangle) => ({
  left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%`,
});

export function PdfPage({ page, zoom, fitWidth, placements, signature, selected, disabled, onPlace, onSelect, onMove, onRemove }: {
  page: PDFPageProxy;
  zoom: number;
  fitWidth: number;
  placements: Placement[];
  signature: Signature | null;
  selected: number | null;
  disabled: boolean;
  onPlace(rect: Rectangle): void;
  onSelect(id: number | null): void;
  onMove(id: number, rect: Rectangle): void;
  onRemove(id: number): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: Placement; x: number; y: number; mode: 'move' | 'resize' } | null>(null);
  const [hover, setHover] = useState<Rectangle | null>(null);
  const [error, setError] = useState(false);
  const base = page.getViewport({ scale: 1 });
  const pageAspect = base.width / base.height;
  const width = Math.min(base.width, fitWidth) * zoom;
  const height = width / pageAspect;

  useEffect(() => {
    const element = canvas.current!;
    const density = Math.min(devicePixelRatio, 2, Math.sqrt(16_000_000 / (width * height)), 8192 / Math.max(width, height));
    const viewport = page.getViewport({ scale: width * density / page.getViewport({ scale: 1 }).width });
    element.width = Math.max(1, Math.ceil(viewport.width));
    element.height = Math.max(1, Math.ceil(viewport.height));
    setError(false);
    const task = page.render({ canvas: element, viewport });
    let active = true;
    void task.promise.catch(() => { if (active) setError(true); });
    return () => { active = false; task.cancel(); };
  }, [page, width, height]);

  function position(clientX: number, clientY: number) {
    const bounds = surface.current!.getBoundingClientRect();
    return { x: (clientX - bounds.left) / bounds.width, y: (clientY - bounds.top) / bounds.height };
  }

  function centered(x: number, y: number): Rectangle {
    const ratio = signature!.aspect / pageAspect;
    const w = Math.min(0.26, 0.14 * ratio);
    const h = w / ratio;
    return { x: clamp(x - w / 2, 0, 1 - w), y: clamp(y - h / 2, 0, 1 - h), width: w, height: h };
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, start: Placement, mode: 'move' | 'resize') {
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    onSelect(start.id);
    drag.current = { start, ...position(event.clientX, event.clientY), mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return (
    <div
      ref={surface}
      className={`sign-page${signature && !disabled ? ' is-placing' : ''}`}
      style={{ width, height }}
      tabIndex={0}
      role="group"
      aria-label={signature ? 'PDF page. Press Enter to place your signature in the center.' : 'PDF page'}
      onKeyDown={(event) => {
        if (disabled || event.target !== event.currentTarget || !signature || event.key !== 'Enter') return;
        event.preventDefault();
        onPlace(centered(0.5, 0.5));
      }}
      onPointerMove={(event) => {
        if (disabled || error) return;
        const cursor = position(event.clientX, event.clientY);
        const gesture = drag.current;
        if (!gesture) {
          if (signature) setHover(centered(cursor.x, cursor.y));
          return;
        }
        const { start, mode } = gesture;
        const dx = cursor.x - gesture.x;
        const dy = cursor.y - gesture.y;
        if (mode === 'move') {
          onMove(start.id, { ...start, x: clamp(start.x + dx, 0, 1 - start.width), y: clamp(start.y + dy, 0, 1 - start.height) });
        } else {
          const max = Math.min((1 - start.x) / start.width, (1 - start.y) / start.height);
          const delta = Math.abs(dx * width) >= Math.abs(dy * height) ? dx / start.width : dy / start.height;
          const scale = clamp(1 + delta, Math.min(max, 0.15), max);
          onMove(start.id, { ...start, width: start.width * scale, height: start.height * scale });
        }
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerLeave={() => setHover(null)}
      onClick={(event) => {
        if (disabled || error || (event.target !== canvas.current && event.target !== event.currentTarget)) return;
        if (signature) {
          const cursor = position(event.clientX, event.clientY);
          onPlace(centered(cursor.x, cursor.y));
          setHover(null);
        } else onSelect(null);
      }}
    >
      <canvas ref={canvas} aria-label={`Page ${page.pageNumber}`} role="img" />
      {error && <div className="sign-render-error" role="alert">Could not display this page.</div>}
      {placements.map((mark) => (
        <div key={mark.id} className={`sign-mark${selected === mark.id ? ' is-selected' : ''}`} style={style(mark)}>
          <button type="button" className="sign-mark-image" aria-label="Signature. Use arrow keys to move or Delete to remove."
            onPointerDown={(event) => startDrag(event, mark, 'move')}
            onFocus={() => onSelect(mark.id)}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === 'Delete') {
                event.preventDefault();
                onRemove(mark.id);
              }
              const dx = Number(event.key === 'ArrowRight') - Number(event.key === 'ArrowLeft');
              const dy = Number(event.key === 'ArrowDown') - Number(event.key === 'ArrowUp');
              if (!dx && !dy) return;
              event.preventDefault();
              onMove(mark.id, { ...mark, x: clamp(mark.x + dx / width, 0, 1 - mark.width), y: clamp(mark.y + dy / height, 0, 1 - mark.height) });
            }}>
            <img src={mark.signature} alt="" draggable={false} />
          </button>
          {selected === mark.id && !disabled && (
            <button type="button" className="sign-resize" aria-label="Resize signature"
              onPointerDown={(event) => startDrag(event, mark, 'resize')}
              onKeyDown={(event) => {
                const delta = Number(event.key === 'ArrowRight' || event.key === 'ArrowDown')
                  - Number(event.key === 'ArrowLeft' || event.key === 'ArrowUp');
                if (!delta) return;
                event.preventDefault();
                const max = Math.min((1 - mark.x) / mark.width, (1 - mark.y) / mark.height);
                const scale = clamp(1 + delta * 0.05, Math.min(max, 0.15), max);
                onMove(mark.id, { ...mark, width: mark.width * scale, height: mark.height * scale });
              }} />
          )}
        </div>
      ))}
      {signature && hover && !disabled && !error && <img className="sign-ghost" src={signature.url} style={style(hover)} alt="" />}
    </div>
  );
}
