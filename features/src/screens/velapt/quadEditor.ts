// @ts-nocheck
/* ================================================================
   VelaPTP · free quadrilateral node editor — ported from
   VelaPTP/js/editor.js. Factory variant: takes element refs instead
   of querying by id, so it mounts inside a React component.
   ================================================================ */
import { active, clone, clamp, emit } from './state';
import { getRotated } from './lib/imaging';

export function createQuadEditor(wrap, photoCanvas, nodeCanvas, stage) {
  let pctx, nctx, dpr = 1, wrapW = 0, wrapH = 0;
  let drag = null, lastPreviewEmit = 0;

  const corners = (q) => [q.tl, q.tr, q.br, q.bl];
  const mids = (q) => ({
    top: { x: (q.tl.x + q.tr.x) / 2, y: (q.tl.y + q.tr.y) / 2 },
    right: { x: (q.tr.x + q.br.x) / 2, y: (q.tr.y + q.br.y) / 2 },
    bottom: { x: (q.br.x + q.bl.x) / 2, y: (q.br.y + q.bl.y) / 2 },
    left: { x: (q.bl.x + q.tl.x) / 2, y: (q.bl.y + q.tl.y) / 2 },
  });
  const toPx = (c) => ({ x: c.x * wrapW, y: c.y * wrapH });
  const lerpPt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  function init() {
    pctx = photoCanvas.getContext('2d'); nctx = nodeCanvas.getContext('2d');
    nodeCanvas.addEventListener('pointerdown', onDown);
    nodeCanvas.addEventListener('pointermove', onMove);
    nodeCanvas.addEventListener('pointerup', onUp);
    nodeCanvas.addEventListener('pointercancel', onUp);
  }

  function destroy() {
    nodeCanvas.removeEventListener('pointerdown', onDown);
    nodeCanvas.removeEventListener('pointermove', onMove);
    nodeCanvas.removeEventListener('pointerup', onUp);
    nodeCanvas.removeEventListener('pointercancel', onUp);
  }

  function fit() {
    const page = active(); if (!page) return;
    const rot = getRotated(page);
    const ratio = rot.width / rot.height;
    const availW = stage.clientWidth - 60, availH = stage.clientHeight - 60;
    let w = Math.min(availW, availH * ratio);
    let h = w / ratio;
    if (h > availH) { h = availH; w = h * ratio; }
    wrapW = Math.max(1, w); wrapH = Math.max(1, h);
    wrap.style.width = wrapW + 'px'; wrap.style.height = wrapH + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [photoCanvas, nodeCanvas]) {
      cv.width = Math.round(wrapW * dpr); cv.height = Math.round(wrapH * dpr);
    }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPhoto(); drawOverlay();
  }

  function drawPhoto() {
    const page = active(); if (!page) return;
    const rot = getRotated(page);
    pctx.clearRect(0, 0, wrapW, wrapH);
    pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(rot, 0, 0, wrapW, wrapH);
  }

  function drawOverlay() {
    const page = active(); if (!page) return;
    const q = page.quad, c = corners(q).map(toPx);
    nctx.clearRect(0, 0, wrapW, wrapH);
    // scrim outside the quad
    nctx.beginPath();
    nctx.rect(0, 0, wrapW, wrapH);
    nctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 4; i++) nctx.lineTo(c[i].x, c[i].y);
    nctx.closePath();
    nctx.fillStyle = 'rgba(4,9,18,.66)';
    nctx.fill('evenodd');
    // rule-of-thirds inside quad
    nctx.strokeStyle = 'rgba(255,255,255,.22)'; nctx.lineWidth = 1;
    for (const t of [1 / 3, 2 / 3]) {
      let a = lerpPt(c[0], c[1], t), b = lerpPt(c[3], c[2], t);
      nctx.beginPath(); nctx.moveTo(a.x, a.y); nctx.lineTo(b.x, b.y); nctx.stroke();
      a = lerpPt(c[0], c[3], t); b = lerpPt(c[1], c[2], t);
      nctx.beginPath(); nctx.moveTo(a.x, a.y); nctx.lineTo(b.x, b.y); nctx.stroke();
    }
    // quad border
    nctx.beginPath(); nctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 4; i++) nctx.lineTo(c[i].x, c[i].y);
    nctx.closePath();
    nctx.strokeStyle = 'rgba(34,211,238,.95)'; nctx.lineWidth = 2; nctx.stroke();
    // edge midpoint handles
    const m = mids(q);
    nctx.fillStyle = '#fff'; nctx.strokeStyle = '#22D3EE'; nctx.lineWidth = 2;
    for (const key of ['top', 'right', 'bottom', 'left']) {
      const p = toPx(m[key]);
      nctx.beginPath(); nctx.arc(p.x, p.y, 5, 0, 7); nctx.fill(); nctx.stroke();
    }
    // corner nodes (registration style)
    for (let i = 0; i < 4; i++) {
      const p = c[i];
      nctx.beginPath(); nctx.arc(p.x, p.y, 11, 0, 7);
      nctx.fillStyle = 'rgba(34,211,238,.18)'; nctx.fill();
      nctx.beginPath(); nctx.arc(p.x, p.y, 7, 0, 7);
      nctx.fillStyle = '#22D3EE'; nctx.fill();
      nctx.lineWidth = 2.5; nctx.strokeStyle = '#0B1220'; nctx.stroke();
      nctx.beginPath(); nctx.arc(p.x, p.y, 2.4, 0, 7); nctx.fillStyle = '#fff'; nctx.fill();
    }
  }

  /* ---------- hit testing ---------- */
  function localPoint(e) {
    const r = nodeCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function hitTest(pt) {
    const page = active(), q = page.quad;
    const cs = corners(q).map(toPx);
    for (let i = 0; i < 4; i++) if (Math.hypot(pt.x - cs[i].x, pt.y - cs[i].y) < 18) return { type: 'corner', index: i };
    const m = mids(q);
    const edges = [['top', 'tl', 'tr'], ['right', 'tr', 'br'], ['bottom', 'br', 'bl'], ['left', 'bl', 'tl']];
    for (const [name, a, b] of edges) {
      const p = toPx(m[name]);
      if (Math.hypot(pt.x - p.x, pt.y - p.y) < 14) return { type: 'edge', a, b };
    }
    if (pointInQuad(pt, cs)) return { type: 'move' };
    // outside: grab nearest corner
    let best = 0, bd = Infinity;
    for (let i = 0; i < 4; i++) { const d = Math.hypot(pt.x - cs[i].x, pt.y - cs[i].y); if (d < bd) { bd = d; best = i; } }
    return { type: 'corner', index: best };
  }
  function pointInQuad(pt, cs) {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const xi = cs[i].x, yi = cs[i].y, xj = cs[j].x, yj = cs[j].y;
      if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ---------- pointer handlers ---------- */
  function onDown(e) {
    const page = active(); if (!page) return;
    const pt = localPoint(e);
    const hit = hitTest(pt);
    drag = { hit, start: pt, quad: clone(page.quad) };
    try { nodeCanvas.setPointerCapture(e.pointerId); } catch (err) {}
    nodeCanvas.style.cursor = hit.type === 'move' ? 'grabbing' : 'crosshair';
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
    const page = active(); if (!page) return;
    const pt = localPoint(e);
    const dx = (pt.x - drag.start.x) / wrapW, dy = (pt.y - drag.start.y) / wrapH;
    const q0 = drag.quad, q = page.quad;
    const cl = (v) => clamp(v, 0.002, 0.998);
    const keys = ['tl', 'tr', 'br', 'bl'];
    if (drag.hit.type === 'corner') {
      const k = keys[drag.hit.index];
      q[k].x = cl(q0[k].x + dx); q[k].y = cl(q0[k].y + dy);
    } else if (drag.hit.type === 'edge') {
      for (const k of [drag.hit.a, drag.hit.b]) { q[k].x = cl(q0[k].x + dx); q[k].y = cl(q0[k].y + dy); }
    } else { // move whole quad, clamp so all corners stay inside
      let mx = dx, my = dy;
      for (const k of keys) {
        mx = clamp(mx, -q0[k].x + 0.002, 0.998 - q0[k].x);
        my = clamp(my, -q0[k].y + 0.002, 0.998 - q0[k].y);
      }
      for (const k of keys) { q[k].x = q0[k].x + mx; q[k].y = q0[k].y + my; }
    }
    drawOverlay();
    const now = performance.now();
    if (now - lastPreviewEmit > 90) { lastPreviewEmit = now; emit('image'); }
    e.preventDefault();
  }

  function onUp() {
    if (!drag) return;
    drag = null;
    nodeCanvas.style.cursor = 'crosshair';
    emit('image');
  }

  return {
    init,
    destroy,
    render: fit,
    fit,
    redraw: () => { drawPhoto(); drawOverlay(); },
  };
}
