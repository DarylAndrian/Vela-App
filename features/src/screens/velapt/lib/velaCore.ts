// @ts-nocheck
/* ================================================================
   VelaPTP · imaging + layout core — ported near-verbatim from
   VelaPTP/js/vela-core.js. Environment-neutral pure math on
   {data,width,height} buffers — no DOM, no canvas.
   ================================================================ */

/* ---------- primitive helpers ---------- */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- quad geometry ---------- */
export const quadCorners = (q) => [q.tl, q.tr, q.br, q.bl];
export const quadArea = (q) => {
  const p = quadCorners(q);
  let a = 0;
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; a += p[i].x * p[j].y - p[j].x * p[i].y; }
  return Math.abs(a) / 2;
};
/* output size estimated from the quad's real edge lengths (CamScanner-style) */
export const quadOutputSize = (q, rotW, rotH) => {
  const px = (c) => ({ x: c.x * rotW, y: c.y * rotH });
  const tl = px(q.tl), tr = px(q.tr), br = px(q.br), bl = px(q.bl);
  const w = Math.max(dist(tl, tr), dist(bl, br));
  const h = Math.max(dist(tl, bl), dist(tr, br));
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
};
export const defaultQuad = () => ({
  tl: { x: 0.14, y: 0.07 }, tr: { x: 0.86, y: 0.07 },
  br: { x: 0.86, y: 0.93 }, bl: { x: 0.14, y: 0.93 },
});
/* follow each corner's physical pixel under +90° CW rotation: (x,y)->(1-y,x) */
export const rotateQuad90 = (q) => ({
  tl: { x: 1 - q.tl.y, y: q.tl.x }, tr: { x: 1 - q.tr.y, y: q.tr.x },
  br: { x: 1 - q.br.y, y: q.br.x }, bl: { x: 1 - q.bl.y, y: q.bl.x },
});

/* ---------- homography: map unit square -> source quad ----------
   8-unknown projective solve (h33 = 1) by Gaussian elimination. */
export const homography = (dst, src) => {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col] || 1e-12;
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / d;
      if (!f) continue;
      for (let k = col; k < n; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
    h[r] = s / (A[r][r] || 1e-12);
  }
  return h;
};

/* ---------- perspective rectify (inverse map + bilinear sample) ----------
   src: {data,width,height} of the rotated/downscaled photo (sw×sh).
   quadPx: {tl,tr,br,bl} in src pixels. Returns {data,width,height}. */
export const rectify = (src, sw, sh, quadPx, outW, outH) => {
  const H = homography(
    [[0, 0], [1, 0], [1, 1], [0, 1]],
    [[quadPx.tl.x, quadPx.tl.y], [quadPx.tr.x, quadPx.tr.y], [quadPx.br.x, quadPx.br.y], [quadPx.bl.x, quadPx.bl.y]]
  );
  const out = { data: new Uint8ClampedArray(outW * outH * 4), width: outW, height: outH };
  const sd = src.data, od = out.data;
  const h0 = H[0], h1 = H[1], h2 = H[2], h3 = H[3], h4 = H[4], h5 = H[5], h6 = H[6], h7 = H[7];
  const maxX = sw - 1, maxY = sh - 1;
  for (let y = 0; y < outH; y++) {
    const v0 = (y + 0.5) / outH;
    const rowBase = y * outW * 4;
    for (let x = 0; x < outW; x++) {
      const u0 = (x + 0.5) / outW;
      const w = h6 * u0 + h7 * v0 + 1;
      let sx = (h0 * u0 + h1 * v0 + h2) / w;
      let sy = (h3 * u0 + h4 * v0 + h5) / w;
      if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0, y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const o = rowBase + x * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      od[o]     = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      od[o + 3] = 255;
    }
  }
  return out;
};

/* ---------- brightness / contrast LUT ---------- */
export const bcLUT = (brightness, contrast) => {
  const c = contrast * 2.55;
  const k = (259 * (c + 255)) / (255 * (259 - c));
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = k * (i - 128) + 128 + brightness * 1.27;
  return lut;
};
export const applyLUT = (img, lut) => {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
};

/* ---------- grayscale ---------- */
export const grayscale = (img) => {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = L;
  }
};

/* ---------- unsharp mask (separable 3×3 box) ---------- */
export const unsharp = (img, amount) => {
  const w = img.width, h = img.height, d = img.data;
  const tmp = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0, xr = x < w - 1 ? x + 1 : x;
      const i = (y * w + x) * 4, il = (y * w + xl) * 4, ir = (y * w + xr) * 4;
      tmp[i] = (d[il] + d[i] + d[ir]) / 3;
      tmp[i + 1] = (d[il + 1] + d[i + 1] + d[ir + 1]) / 3;
      tmp[i + 2] = (d[il + 2] + d[i + 2] + d[ir + 2]) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const yt = y > 0 ? y - 1 : 0, yb = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, it = (yt * w + x) * 4, ib = (yb * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur = (tmp[it + c] + tmp[i + c] + tmp[ib + c]) / 3;
        d[i + c] = d[i + c] + amount * (d[i + c] - blur);
      }
    }
  }
};

/* ---------- auto enhance: levels stretch + mild sharpen ---------- */
export const autoEnhance = (img) => {
  const d = img.data, n = img.width * img.height;
  const step = Math.max(1, Math.floor(n / 65536));
  const hist = new Uint32Array(256); let count = 0;
  for (let i = 0; i < n; i += step) {
    const p = i * 4;
    hist[(d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) | 0]++; count++;
  }
  const loT = count * 0.005, hiT = count * 0.995;
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= loT) { lo = i; break; } }
  acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= hiT) { hi = i; break; } }
  if (hi - lo >= 30) {
    const range = hi - lo;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = (i - lo) * 255 / range;
    applyLUT(img, lut);
  }
  unsharp(img, 0.35);
};

/* ---------- B&W document: Bradley adaptive threshold ---------- */
export const bwDocument = (img) => {
  const w = img.width, h = img.height, d = img.data, n = w * h;
  const luma = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const p = i * 4; luma[i] = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) | 0; }
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += luma[y * w + x];
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 50));
  const t = 0.85;
  for (let y = 0; y < h; y++) {
    const y1 = y > r ? y - r : 0, y2 = y < h - 1 - r ? y + r : h - 1;
    for (let x = 0; x < w; x++) {
      const x1 = x > r ? x - r : 0, x2 = x < w - 1 - r ? x + r : w - 1;
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * iw + (x2 + 1)] - integral[y1 * iw + (x2 + 1)]
                - integral[(y2 + 1) * iw + x1] + integral[y1 * iw + x1];
      const val = (luma[y * w + x] * count < sum * t) ? 0 : 255;
      const p = (y * w + x) * 4; d[p] = d[p + 1] = d[p + 2] = val;
    }
  }
};

/* ---------- combined adjustments ---------- */
export const applyAdjustments = (img, opts) => {
  if (opts.brightness || opts.contrast) applyLUT(img, bcLUT(opts.brightness, opts.contrast));
  switch (opts.filter) {
    case 'gray': grayscale(img); break;
    case 'auto': autoEnhance(img); break;
    case 'bw': bwDocument(img); break;
  }
};

/* ---------- Otsu threshold on a luminance histogram ---------- */
export const otsu = (hist) => {
  let total = 0, sum = 0;
  for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
  if (!total) return 128;
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) { bestVar = between; best = i; }
  }
  return best;
};

/* ---------- auto edge detection (pure; input already ~200px) ----------
   Returns a normalized {tl,tr,br,bl} quad or null if not confident. */
export const detectQuadFromRGBA = (img) => {
  const w = img.width, h = img.height, d = img.data;
  const n = w * h, luma = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const p = i * 4; const L = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) | 0;
    luma[i] = L; hist[L]++;
  }
  let thr = otsu(hist);
  if (thr < 45) thr = 45;
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let tl = null, br = null, tr = null, bl = null, found = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (luma[y * w + x] > thr) {
      found++;
      const s = x + y, df = x - y;
      if (s < minSum) { minSum = s; tl = { x, y }; }
      if (s > maxSum) { maxSum = s; br = { x, y }; }
      if (df > maxDiff) { maxDiff = df; tr = { x, y }; }
      if (df < minDiff) { minDiff = df; bl = { x, y }; }
    }
  }
  if (found < n * 0.05 || found > n * 0.92 || !tl || !br || !tr || !bl) return null;
  const norm = (p) => ({ x: clamp(p.x / w, 0, 1), y: clamp(p.y / h, 0, 1) });
  const q = { tl: norm(tl), tr: norm(tr), br: norm(br), bl: norm(bl) };
  if (quadArea(q) < 0.05) return null;
  return q;
};

/* ---------- fill-crop rect math (for fit=fill placement) ---------- */
export const fillCropRect = (srcW, srcH, targetRatio, align) => {
  const w = srcW, h = srcH, r = w / h;
  let cw, ch, cx, cy;
  if (r > targetRatio) { ch = h; cw = h * targetRatio; cy = 0; cx = (w - cw) * align.x; }
  else { cw = w; ch = w / targetRatio; cx = 0; cy = (h - ch) * align.y; }
  return { sx: cx, sy: cy, sw: cw, sh: ch };
};

/* ---------- page sizing + placement (mm) ---------- */
export const SIZES = {
  a2: { w: 420, h: 594, label: 'A2' },
  a3: { w: 297, h: 420, label: 'A3' },
  a4: { w: 210, h: 297, label: 'A4' },
  a5: { w: 148, h: 210, label: 'A5' },
  a6: { w: 105, h: 148, label: 'A6' },
  f5: { w: 165, h: 210, label: 'F5' },
  letter: { w: 215.9, h: 279.4, label: 'LETTER' },
};
export const pageDims = (page, imgW, imgH) => {
  const L = page.layout; let wmm, hmm;
  if (L.size === 'match') {
    const r = imgW / imgH;
    if (r >= 1) { wmm = 297; hmm = 297 / r; } else { hmm = 297; wmm = 297 * r; }
  } else { const s = SIZES[L.size]; wmm = s.w; hmm = s.h; }
  let portrait = hmm >= wmm;
  if (L.orientation === 'portrait') portrait = true;
  if (L.orientation === 'landscape') portrait = false;
  if (!portrait) [wmm, hmm] = [hmm, wmm];
  return { wmm, hmm, portrait };
};
export const computePlacement = (page, imgW, imgH, pw, ph) => {
  const m = page.layout.marginMM, cw = pw - 2 * m, ch = ph - 2 * m;
  const s = Math.min(cw / imgW, ch / imgH);
  const w = imgW * s, h = imgH * s;
  return { x: m + (cw - w) * page.layout.align.x, y: m + (ch - h) * page.layout.align.y, w, h };
};

export const DEFAULT_MAX_SIDE = 2500;
export const HIGH_QUALITY_MAX_SIDE = 3200;
