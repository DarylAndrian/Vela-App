// @ts-nocheck
/* ================================================================
   Page preview composition + drag-to-position — ported from the
   renderPageEl / wirePageDrag / positionFromPointer section of
   VelaPTP/js/app.js (lines 278-362).
   ================================================================ */
import { active, clamp, lastLayout, emit } from '../state';
import { getPreview } from '../lib/imaging';
import { pageDims, computePlacement, fillCropRect, SIZES } from '../lib/velaCore';

export function fillCrop(canvas, targetRatio, align) {
  const r = fillCropRect(canvas.width, canvas.height, targetRatio, align);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.sw)); c.height = Math.max(1, Math.round(r.sh));
  c.getContext('2d').drawImage(canvas, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
  return c;
}

export function renderPageEl(node, page, isBig, availW, availH) {
  const pv = getPreview(page);
  const { wmm, hmm } = pageDims(page, pv.width, pv.height);
  const ratio = wmm / hmm;
  if (isBig) {
    let h = Math.min(availH, availW / ratio); let w = h * ratio;
    if (w > availW) { w = availW; h = w / ratio; }
    node.style.width = w + 'px'; node.style.height = h + 'px';
  } else { node.style.width = '200px'; node.style.height = 200 / ratio + 'px'; }
  const pw = node.clientWidth, ph = node.clientHeight;
  const pxPerMm = pw / wmm, marginPx = page.layout.marginMM * pxPerMm;
  const content = node.querySelector('.vp-page-content');
  content.style.inset = marginPx + 'px';
  const cw = pw - marginPx * 2, ch = ph - marginPx * 2;
  const ir = pv.width / pv.height;
  content.innerHTML = '';
  const media = document.createElement('canvas');
  if (page.layout.fit === 'fill') {
    const cropped = fillCrop(pv, cw / ch, page.layout.align);
    media.width = Math.round(cw); media.height = Math.round(ch);
    media.getContext('2d').drawImage(cropped, 0, 0, media.width, media.height);
    media.style.width = '100%'; media.style.height = '100%';
    content.style.justifyContent = 'center'; content.style.alignItems = 'center';
  } else {
    let mw, mh;
    if (cw / ch > ir) { mh = ch; mw = ch * ir; } else { mw = cw; mh = cw / ir; }
    media.width = Math.round(mw); media.height = Math.round(mh);
    media.getContext('2d').drawImage(pv, 0, 0, media.width, media.height);
    media.style.width = mw + 'px'; media.style.height = mh + 'px';
    content.style.justifyContent = page.layout.align.x === 0 ? 'flex-start' : page.layout.align.x === 1 ? 'flex-end' : 'center';
    content.style.alignItems = page.layout.align.y === 0 ? 'flex-start' : page.layout.align.y === 1 ? 'flex-end' : 'center';
  }
  content.appendChild(media);
  const tag = node.querySelector('.vp-page-tag');
  const label = SIZES[page.layout.size]?.label || 'MATCH';
  if (tag) tag.textContent = `${label} · ${page.layout.fit.toUpperCase()} · ${Math.round(wmm)} × ${Math.round(hmm)} MM`;
}

export function positionFromPointer(e, node, page) {
  if (!page) return;
  const content = node.querySelector('.vp-page-content');
  const r = content.getBoundingClientRect();
  const pv = getPreview(page);
  const cw = r.width, ch = r.height, ir = pv.width / pv.height;
  let ax, ay;
  if (page.layout.fit === 'fill') {
    ax = (e.clientX - r.left) / cw; ay = (e.clientY - r.top) / ch;
  } else {
    let mw, mh; if (cw / ch > ir) { mh = ch; mw = ch * ir; } else { mw = cw; mh = cw / ir; }
    ax = cw > mw ? (e.clientX - r.left - mw / 2) / (cw - mw) : 0.5;
    ay = ch > mh ? (e.clientY - r.top - mh / 2) / (ch - mh) : 0.5;
  }
  page.layout.align = { x: clamp(ax, 0, 1), y: clamp(ay, 0, 1) };
  lastLayout.align = page.layout.align;
  emit('layout');
}

/* drag-to-position on page previews */
export function wirePageDrag(node) {
  const content = node.querySelector('.vp-page-content');
  let dragging = false;
  content.addEventListener('pointerdown', (e) => {
    const page = active(); if (!page) return;
    dragging = true; try { content.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault();
    positionFromPointer(e, node, page);
  });
  content.addEventListener('pointermove', (e) => { if (dragging) positionFromPointer(e, node, active()); });
  content.addEventListener('pointerup', () => { dragging = false; });
  content.addEventListener('pointercancel', () => { dragging = false; });
}

export { computePlacement };
