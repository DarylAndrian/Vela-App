// @ts-nocheck
/* ================================================================
   VelaPTP · browser canvas pipeline — ported from VelaPTP/js/imaging.js.
   DOM/canvas wrappers around the shared pure core (lib/velaCore.ts).
   ================================================================ */
import {
  quadOutputSize, rectify, applyAdjustments, detectQuadFromRGBA,
} from './velaCore';

/* ---------- canvas primitives (browser-only) ---------- */
export const rotatedCanvas = (bitmap, rotation) => {
  const bw = bitmap.width, bh = bitmap.height;
  const swap = rotation % 180 !== 0;
  const w = swap ? bh : bw, h = swap ? bw : bh;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -bw / 2, -bh / 2);
  return c;
};

export const getRotated = (page) => {
  const r = page._cache.rot;
  if (r && r.rotation === page.rotation) return r.canvas;
  const canvas = rotatedCanvas(page.bitmap, page.rotation);
  page._cache.rot = { rotation: page.rotation, canvas };
  return canvas;
};

export const downscale = (canvas, maxSide) => {
  const long = Math.max(canvas.width, canvas.height);
  if (long <= maxSide) return canvas;
  const s = maxSide / long;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
};

/* ---------- full page pipeline: rotate -> rectify -> enhance ---------- */
export const processPage = (page, maxSide) => {
  const rot = getRotated(page);
  const rotW = rot.width, rotH = rot.height;
  const srcCanvas = downscale(rot, maxSide);
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const srcData = srcCanvas.getContext('2d')!.getImageData(0, 0, sw, sh);
  const q = page.quad;
  const quadPx = {
    tl: { x: q.tl.x * sw, y: q.tl.y * sh }, tr: { x: q.tr.x * sw, y: q.tr.y * sh },
    br: { x: q.br.x * sw, y: q.br.y * sh }, bl: { x: q.bl.x * sw, y: q.bl.y * sh },
  };
  const nat = quadOutputSize(q, rotW, rotH);
  const scale = Math.min(1, maxSide / Math.max(nat.w, nat.h));
  const outW = Math.max(1, Math.round(nat.w * scale));
  const outH = Math.max(1, Math.round(nat.h * scale));
  const out = rectify(srcData, sw, sh, quadPx, outW, outH);
  applyAdjustments(out, page);
  const c = document.createElement('canvas'); c.width = out.width; c.height = out.height;
  const id = new ImageData(out.width, out.height);
  id.data.set(out.data);
  c.getContext('2d')!.putImageData(id, 0, 0);
  return c;
};

export const previewKey = (page) =>
  JSON.stringify(page.quad) + '|' + page.filter + '|' + page.brightness + '|' + page.contrast + '|' + page.rotation;

export const getPreview = (page) => {
  const key = previewKey(page);
  const c = page._cache.preview;
  if (c && c.key === key) return c.canvas;
  const canvas = processPage(page, 1280);
  page._cache.preview = { key, canvas };
  return canvas;
};

/* ---------- auto edge detection (wraps pure core) ---------- */
export const autoDetectQuad = (canvas) => {
  const small = downscale(canvas, 200);
  const d = small.getContext('2d')!.getImageData(0, 0, small.width, small.height);
  return detectQuadFromRGBA(d);
};
