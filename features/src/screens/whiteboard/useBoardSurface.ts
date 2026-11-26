import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { drawInk, PAGE_HEIGHT, PAGE_WIDTH, type Brush, type Point, type Stroke } from './ink';
import { contains, rectBetween, type BoardObject, type Page, type Picture, type Selection, type Shape, type ShapeKind } from './notebook';
import { drawObject, drawPage, drawSelection, type Pictures } from './render';
import { clamp, clampToPage, PAPER_MARGIN, paintLayer, paperElements, toPage, visiblePageRect } from './viewport';

export type Tool = 'Pen' | 'Select picture' | 'Region Copy' | ShapeKind;
type Gesture = { pointerId: number } & (
  | { type: 'pan'; last: Point }
  | { type: 'ink'; paper: HTMLElement; stroke: Stroke }
  | { type: 'shape'; paper: HTMLElement; shape: Shape }
  | { type: 'region'; paper: HTMLElement; start: Point; end: Point }
  | { type: 'picture'; paper: HTMLElement; start: Point; original: Picture; placement: Picture; resize: boolean }
);

interface Options {
  pages: Page[];
  activePageId: string;
  pictures: Pictures;
  brush: Brush;
  tool: Tool;
  selection: Selection | null;
  select: (selection: Selection | null) => void;
  selectPage: (id: string) => void;
  commit: (id: string, object: BoardObject) => void;
  updatePicture: (id: string, placement: Picture) => void;
}

const eventPoint = (event: { clientX: number; clientY: number }): Point => ({ x: event.clientX, y: event.clientY });

// A touch that starts while the pen is in range, or shortly after it was, is treated as a resting palm.
export const PALM_GUARD_MS = 500;

function sample(event: PointerEvent, paper: Element, releasePressure?: number) {
  return {
    ...toPage(eventPoint(event), paper),
    pressure: releasePressure ?? (event.pointerType === 'pen' ? clamp(event.pressure, 0, 1) : 1),
  };
}

function touchAnchor(touches: Map<number, Point>) {
  const [a, b] = touches.values();
  if (!b) return { midpoint: a, span: 0 };
  return {
    midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    span: Math.hypot(a.x - b.x, a.y - b.y),
  };
}

function updatePlacement(gesture: Extract<Gesture, { type: 'picture' }>, point: Point): Picture {
  const { original, start, resize } = gesture;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (resize) {
    const { x, y, width, height } = original;
    const limit = Math.min((PAGE_WIDTH - x) / width, (PAGE_HEIGHT - y) / height);
    const amount = (dx * width + dy * height) / (width ** 2 + height ** 2);
    const scale = clamp(1 + amount, Math.min(1, 12 / Math.max(width, height)), limit);
    return { ...original, width: width * scale, height: height * scale };
  }
  return { ...original, x: clamp(original.x + dx, 0, PAGE_WIDTH - original.width),
    y: clamp(original.y + dy, 0, PAGE_HEIGHT - original.height) };
}

export function useBoardSurface(options: Options) {
  const [zoom, setZoom] = useState(0.75);
  const viewport = useRef<HTMLDivElement>(null);
  const artwork = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const latest = useRef(options);
  const zoomLevel = useRef(zoom);
  const anchor = useRef<{ paper: Element; point: Point; target: Point } | null>(null);
  const jumpTarget = useRef<string | null>(null);
  const jumpOffset = useRef<number | null>(null);
  const active = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const penSeen = useRef(-Infinity);
  const spaceHeld = useRef(false);
  const frame = useRef<number | null>(null);
  const needsRepaint = useRef(true);
  const previewCount = useRef(0);

  const schedule = useCallback((repaint = false) => {
    needsRepaint.current ||= repaint;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const scroller = viewport.current!;
      const { pages, pictures, selection } = latest.current;
      const gesture = active.current;
      const papers = paperElements(scroller);
      const redraw = needsRepaint.current;
      needsRepaint.current = false;
      if (redraw) {
        const layer = paintLayer(artwork.current!, scroller, true);
        for (const [index, paper] of papers.entries()) {
          const page = pages[index];
          const replacement = gesture?.type === 'picture' && gesture.paper === paper ? gesture.placement : undefined;
          if (page) layer?.page(paper, context => drawPage(context, page, pictures, replacement));
        }
      }
      const layer = paintLayer(preview.current!, scroller, redraw || gesture?.type !== 'ink');
      if (gesture?.type === 'ink') {
        layer?.page(gesture.paper, context => drawInk(context, gesture.stroke, redraw || layer.resized ? 0 : previewCount.current));
        previewCount.current = gesture.stroke.samples.length;
      }
      if (gesture?.type === 'shape') {
        layer?.page(gesture.paper, context => drawObject(context, gesture.shape, pictures));
      }
      if (gesture?.type === 'region') {
        layer?.page(gesture.paper, (context, scale) => drawSelection(context, rectBetween(gesture.start, gesture.end), scale, false));
      } else if (selection && gesture?.type !== 'ink' && gesture?.type !== 'shape') {
        const paper = papers.find(element => element.dataset.pageId === selection.pageId);
        const page = pages.find(item => item.id === selection.pageId);
        const rect = selection.kind === 'region' ? selection.rect : gesture?.type === 'picture' ? gesture.placement
          : page?.objects.find((object): object is Picture => object.type === 'picture' && object.id === selection.id);
        if (paper && rect) layer?.page(paper, (context, scale) => drawSelection(context, rect, scale, selection.kind === 'picture'));
      }
    });
  }, []);

  const jumpTo = useCallback((id: string) => {
    const paper = paperElements(viewport.current!).find(element => element.dataset.pageId === id);
    if (paper) {
      const scroller = viewport.current!;
      scroller.scrollTop += paper.getBoundingClientRect().top - scroller.getBoundingClientRect().top - PAPER_MARGIN;
      jumpOffset.current = scroller.scrollTop;
      latest.current.selectPage(id);
    } else {
      jumpTarget.current = id;
    }
  }, []);

  useLayoutEffect(() => {
    latest.current = options;
  });

  useLayoutEffect(() => schedule(), [options.selection, schedule]);

  useLayoutEffect(() => {
    const scroller = viewport.current!;
    const pending = anchor.current;
    if (pending?.paper.isConnected) {
      jumpOffset.current = null;
      const rect = pending.paper.getBoundingClientRect();
      scroller.scrollLeft += rect.left + pending.point.x * rect.width / PAGE_WIDTH - pending.target.x;
      scroller.scrollTop += rect.top + pending.point.y * rect.height / PAGE_HEIGHT - pending.target.y;
    }
    anchor.current = null;
    const target = jumpTarget.current;
    if (target) {
      jumpTarget.current = null;
      jumpTo(target);
    }
    schedule(true);
  }, [options.pages, options.pictures, zoom, jumpTo, schedule]);

  const zoomAt = useCallback((value: number, origin?: Point, target?: Point) => {
    const scroller = viewport.current!;
    const bounds = scroller.getBoundingClientRect();
    const from = origin ?? { x: bounds.left + scroller.clientWidth / 2, y: bounds.top + scroller.clientHeight / 2 };
    const to = target ?? from;
    const next = clamp(value, 0.25, 8);
    if (next === zoomLevel.current && !anchor.current) {
      scroller.scrollBy(from.x - to.x, from.y - to.y);
      return;
    }
    if (anchor.current && origin && target && from.x === anchor.current.target.x && from.y === anchor.current.target.y) {
      anchor.current.target = to;
      zoomLevel.current = next;
      setZoom(next);
      return;
    }
    const papers = paperElements(scroller);
    const found = papers.find(paper => {
      const rect = paper.getBoundingClientRect();
      return from.y >= rect.top && from.y < rect.bottom;
    });
    const paper = found ?? papers.find(paper => paper.dataset.pageId === latest.current.activePageId);
    if (paper) anchor.current = { paper, point: toPage(from, paper), target: to };
    zoomLevel.current = next;
    setZoom(next);
  }, []);

  useEffect(() => {
    const scroller = viewport.current!;
    const redraw = () => schedule(true);
    const observer = new ResizeObserver(redraw);
    observer.observe(scroller);
    window.addEventListener('resize', redraw);
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (active.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1);
      zoomAt(zoomLevel.current * Math.exp(-delta * 0.002), eventPoint(event));
    };
    scroller.addEventListener('wheel', wheel, { passive: false });
    // Pen hover reports pointer events anywhere in the window. A pen in range takes over from touch.
    const penActivity = (event: PointerEvent) => {
      if (event.pointerType !== 'pen') return;
      penSeen.current = event.timeStamp;
      if (!active.current) touches.current.clear();
    };
    const penEvents = ['pointerover', 'pointerdown', 'pointermove', 'pointerup', 'pointerout'] as const;
    for (const type of penEvents) window.addEventListener(type, penActivity, true);
    const releaseSpace = (event?: KeyboardEvent) => {
      if (!event || event.code === 'Space') {
        spaceHeld.current = false;
        delete scroller.dataset.pan;
      }
    };
    const blur = () => releaseSpace();
    window.addEventListener('keyup', releaseSpace);
    window.addEventListener('blur', blur);
    scroller.addEventListener('blur', blur);
    return () => {
      observer.disconnect();
      scroller.removeEventListener('wheel', wheel);
      for (const type of penEvents) window.removeEventListener(type, penActivity, true);
      window.removeEventListener('resize', redraw);
      window.removeEventListener('keyup', releaseSpace);
      window.removeEventListener('blur', blur);
      scroller.removeEventListener('blur', blur);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [schedule, zoomAt]);

  function onScroll() {
    schedule(true);
    if (active.current && active.current.type !== 'pan') return;
    const scroller = viewport.current!;
    if (jumpOffset.current === scroller.scrollTop) return;
    jumpOffset.current = null;
    const top = scroller.getBoundingClientRect().top;
    const bottom = top + scroller.clientHeight;
    let visible = 0;
    let id = latest.current.activePageId;
    for (const paper of paperElements(scroller)) {
      const rect = paper.getBoundingClientRect();
      const portion = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
      if (portion > visible || (portion === visible && portion > 0 && paper.dataset.pageId === latest.current.activePageId)) {
        visible = portion;
        id = paper.dataset.pageId!;
      }
    }
    if (id !== latest.current.activePageId) latest.current.selectPage(id);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const scroller = event.currentTarget;
    if (active.current || event.button !== 0) return;
    const point = eventPoint(event);
    if (event.pointerType === 'touch') {
      // A rejected contact never enters the map, so it cannot become a pan once the guard expires.
      if (touches.current.size === 2 || event.timeStamp - penSeen.current < PALM_GUARD_MS) return;
      touches.current.set(event.pointerId, point);
      scroller.setPointerCapture(event.pointerId);
      return;
    }
    const paper = (event.target as HTMLElement).closest<HTMLElement>('.wb-paper');
    if (!spaceHeld.current && !paper) return;
    event.preventDefault();
    scroller.focus({ preventScroll: true });
    scroller.setPointerCapture(event.pointerId);
    if (spaceHeld.current) {
      active.current = { type: 'pan', pointerId: event.pointerId, last: point };
      return;
    }
    if (!paper) return;
    latest.current.selectPage(paper.dataset.pageId!);
    const { brush, tool, selection, pages, select } = latest.current;
    const start = toPage(point, paper);
    const base = { pointerId: event.pointerId, paper };
    if (tool === 'Select picture') {
      const objects = pages.find(page => page.id === paper.dataset.pageId)?.objects ?? [];
      const selected = selection?.kind === 'picture' && selection.pageId === paper.dataset.pageId
        ? objects.find((object): object is Picture => object.type === 'picture' && object.id === selection.id) : undefined;
      const handle = 16 * PAGE_WIDTH / paper.getBoundingClientRect().width;
      const resize = !!selected && (Math.abs(start.x - selected.x - selected.width) <= handle &&
        Math.abs(start.y - selected.y - selected.height) <= handle);
      const picture = resize ? selected : objects.filter((object): object is Picture => object.type === 'picture' && contains(object, start)).at(-1);
      select(picture ? { kind: 'picture', pageId: paper.dataset.pageId!, id: picture.id } : null);
      if (!picture) return;
      active.current = { ...base, type: 'picture', start, original: picture, placement: picture, resize };
    } else if (tool === 'Region Copy') {
      select(null);
      const origin = clampToPage(start);
      active.current = { ...base, type: 'region', start: origin, end: origin };
    } else if (tool === 'Pen') {
      active.current = { ...base, type: 'ink', stroke: { type: 'ink', brush, samples: [sample(event.nativeEvent, paper)] } };
    } else {
      active.current = { ...base, type: 'shape', shape: { type: 'shape', kind: tool, start, end: start, color: brush.color, width: brush.width } };
    }
    previewCount.current = 0;
    schedule(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const point = eventPoint(event);
    const fingers = touches.current;
    if (!active.current && fingers.has(event.pointerId)) {
      const previous = touchAnchor(fingers);
      fingers.set(event.pointerId, point);
      const current = touchAnchor(fingers);
      const scale = previous.span > 0 ? current.span / previous.span : 1;
      zoomAt(zoomLevel.current * scale, previous.midpoint, current.midpoint);
      return;
    }
    const gesture = active.current;
    if (gesture?.pointerId !== event.pointerId) return;
    if (gesture.type === 'pan') {
      event.currentTarget.scrollBy(gesture.last.x - point.x, gesture.last.y - point.y);
      gesture.last = point;
      return;
    }
    if (gesture.type === 'ink') {
      const events = event.nativeEvent.getCoalescedEvents?.();
      for (const entry of events?.length ? events : [event.nativeEvent]) {
        gesture.stroke.samples.push(sample(entry, gesture.paper));
      }
    } else if (gesture.type === 'shape') {
      gesture.shape.end = toPage(point, gesture.paper);
    } else if (gesture.type === 'region') {
      gesture.end = clampToPage(toPage(point, gesture.paper));
    } else {
      gesture.placement = updatePlacement(gesture, toPage(point, gesture.paper));
    }
    schedule(gesture.type === 'picture');
  }

  function cancelGesture() {
    const gesture = active.current;
    active.current = null;
    schedule(gesture?.type === 'picture');
  }

  function cancel(event: ReactPointerEvent<HTMLDivElement>) {
    touches.current.delete(event.pointerId);
    if (active.current?.pointerId !== event.pointerId) return;
    cancelGesture();
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = active.current;
    cancel(event);
    if (gesture?.pointerId !== event.pointerId || gesture.type === 'pan') return;
    const id = gesture.paper.dataset.pageId!;
    if (gesture.type === 'ink') {
      const { samples } = gesture.stroke;
      const previous = samples[samples.length - 1];
      const end = sample(event.nativeEvent, gesture.paper, previous.pressure);
      if (end.x !== previous.x || end.y !== previous.y) samples.push(end);
      latest.current.commit(id, gesture.stroke);
    } else if (gesture.type === 'shape') {
      const end = toPage(eventPoint(event), gesture.paper);
      const { start, kind } = gesture.shape;
      if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return;
      if (kind === 'Oval' && (start.x === end.x || start.y === end.y)) return;
      latest.current.commit(id, { ...gesture.shape, end });
    } else if (gesture.type === 'region') {
      const end = clampToPage(toPage(eventPoint(event), gesture.paper));
      const rect = rectBetween(gesture.start, end);
      if (rect.width && rect.height) latest.current.select({ kind: 'region', pageId: id, rect });
    } else {
      const next = updatePlacement(gesture, toPage(eventPoint(event), gesture.paper));
      const { original } = gesture;
      if (next.x !== original.x || next.y !== original.y || next.width !== original.width || next.height !== original.height) {
        latest.current.updatePicture(id, next);
      }
    }
  }

  return {
    viewport, artwork, preview, zoom, zoomAt, jumpTo, onScroll, cancelGesture,
    visibleArea(id: string) {
      const scroller = viewport.current!;
      const paper = paperElements(scroller).find(element => element.dataset.pageId === id);
      return paper && visiblePageRect(paper, scroller);
    },
    fitPage: () => {
      const { clientWidth, clientHeight } = viewport.current!;
      const next = clamp(Math.min((clientWidth - PAPER_MARGIN * 2) / PAGE_WIDTH, (clientHeight - PAPER_MARGIN * 2) / PAGE_HEIGHT), 0.25, 8);
      const id = latest.current.activePageId;
      if (next === zoomLevel.current) jumpTo(id);
      else {
        zoomLevel.current = next;
        jumpTarget.current = id;
        setZoom(next);
      }
    },
    enablePan: () => {
      spaceHeld.current = true;
      viewport.current!.dataset.pan = '';
    },
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel, onLostPointerCapture: cancel },
  };
}
