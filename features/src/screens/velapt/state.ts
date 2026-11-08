// @ts-nocheck
/* ================================================================
   VelaPTP state store — ported from VelaPTP/js/util.js (near-verbatim).
   Pub/sub store kept as-is so tag updates map 1:1 onto React re-renders.
   Toasts are queued here and rendered by the ToastStack component.
   ================================================================ */
import { clamp, dist, defaultQuad, quadCorners, quadArea, quadOutputSize } from './lib/velaCore';

export { clamp, dist, quadCorners, quadArea, quadOutputSize };

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clone = (o: any) => JSON.parse(JSON.stringify(o));

export const debounce = (fn: (...a: any[]) => void, ms: number) => {
  let t: any;
  return (...a: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

/* latest-wins requestAnimationFrame scheduler (coalesces slider scrubs) */
export const scheduler = () => {
  let pending = false, job: any = null;
  return {
    request(fn: () => void) {
      job = fn;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const j = job; job = null;
        if (j) j();
      });
    },
  };
};

export const fmtBytes = (b: number) => {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
};

/* ---------- state + store ---------- */
export const lastLayout = { size: 'a4', orientation: 'auto', marginMM: 10, fit: 'fit', align: { x: 0.5, y: 0.5 } };

export const state: any = {
  pages: [],
  activeId: null,
  flow: { step: 1 },
  export: { filename: 'vela-scan', quality: 0.85 },
  busy: false,
  version: 0,
};

const listeners = new Set<(tag: string) => void>();
export const subscribe = (fn: (tag: string) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const emit = (tag: string) => {
  state.version++;
  listeners.forEach((fn) => {
    try { fn(tag); } catch (e) { console.error(e); }
  });
};
export const active = () => state.pages.find((p: any) => p.id === state.activeId) || null;
export const activeIndex = () => state.pages.findIndex((p: any) => p.id === state.activeId);

export const makePage = (opts: any) => ({
  id: uid(),
  name: opts.name || 'Page',
  bitmap: opts.bitmap,
  width: opts.width,
  height: opts.height,
  rotation: 0,
  quad: opts.quad || defaultQuad(),
  filter: 'original',
  brightness: 0,
  contrast: 0,
  confirmed: false,
  layout: clone(lastLayout),
  thumb: null,
  _cache: {},
});

export const releasePage = (p: any) => {
  if (!p) return;
  if (p.bitmap && p.bitmap.close) { try { p.bitmap.close(); } catch (e) {} }
  p._cache = {};
  p.thumb = null;
};

/* ---------- toasts (rendered by ToastStack) ---------- */
export interface ToastItem {
  id: number;
  msg: string;
  type?: string;
  undo?: () => void;
}
let toastSeq = 0;
const toastListeners = new Set<(items: ToastItem[]) => void>();
let toasts: ToastItem[] = [];

function pushToast(msg: string, opts: { type?: string; undo?: () => void; duration?: number } = {}) {
  const item: ToastItem = { id: ++toastSeq, msg, type: opts.type, undo: opts.undo };
  toasts = [...toasts, item];
  toastListeners.forEach((fn) => fn(toasts));
  const dismiss = () => {
    toasts = toasts.filter((t) => t.id !== item.id);
    toastListeners.forEach((fn) => fn(toasts));
  };
  setTimeout(dismiss, opts.duration || (opts.undo ? 6000 : 3200));
  return item;
}

export const toast = pushToast;
export const subscribeToasts = (fn: (items: ToastItem[]) => void) => {
  toastListeners.add(fn);
  fn(toasts);
  return () => toastListeners.delete(fn);
};
