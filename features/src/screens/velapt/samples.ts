// @ts-nocheck
/* ================================================================
   VelaPTP · file intake + generated sample documents —
   ported from VelaPTP/js/samples.js (near-verbatim).
   ================================================================ */
import { state, makePage, emit, toast } from './state';
import { autoDetectQuad } from './lib/imaging';

/* ---------- decode (EXIF-correct, capped at 4000px) ---------- */
export const decodeFile = async (file) => {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    bmp = await new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        createImageBitmap(c).then(res, rej);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode failed')); };
      img.src = url;
    });
  }
  const long = Math.max(bmp.width, bmp.height);
  if (long > 4000) {
    const s = 4000 / long, w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    try {
      const r = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
      bmp.close(); bmp = r;
    } catch (e) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      bmp.close(); bmp = await createImageBitmap(c);
    }
  }
  return bmp;
};

export const addPageFromBitmap = (bitmap, name) => {
  if (state.pages.length >= 30) { toast('Page limit reached (30)', { type: 'warn' }); return null; }
  const page = makePage({ bitmap, name, width: bitmap.width, height: bitmap.height });
  // best-effort auto frame on import
  const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
  c.getContext('2d').drawImage(bitmap, 0, 0);
  const detected = autoDetectQuad(c);
  if (detected) page.quad = detected;
  state.pages.push(page);
  state.activeId = page.id;
  emit('pages');
  return page;
};

export const importFiles = async (files) => {
  const imgs = Array.from(files).filter((f: any) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
  if (!imgs.length) { toast('No supported images in that drop', { type: 'warn' }); return; }
  let added = 0;
  for (const f of imgs) {
    if (state.pages.length >= 30) { toast('Page limit reached (30)', { type: 'warn' }); break; }
    try {
      const bmp = await decodeFile(f);
      if (addPageFromBitmap(bmp, f.name.replace(/\.[^.]+$/, ''))) added++;
    } catch (e) { console.error(e); toast('Could not read ' + f.name, { type: 'error' }); }
  }
  if (added) toast(`${added} photo${added > 1 ? 's' : ''} added — drag the nodes to frame`);
};

/* ---------- sample document drawing ---------- */
function paperBase(fill) {
  const c = document.createElement('canvas'); c.width = 620; c.height = 880;
  const ctx = c.getContext('2d');
  ctx.fillStyle = fill; ctx.fillRect(0, 0, 620, 880);
  ctx.fillStyle = 'rgba(160,150,120,.18)';
  [[90, 210], [540, 90], [300, 820], [480, 500], [150, 640]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); });
  return { c, ctx };
}
function line(ctx, x1, y1, x2, y2, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function bar(ctx, x, y, w, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, 9); }

function drawInvoice() {
  const { c, ctx } = paperBase('#f7f3ea');
  ctx.fillStyle = '#8a8172'; ctx.font = '14px Georgia'; ctx.fillText('L U M E N   &   C O.', 42, 66);
  ctx.fillStyle = '#2f2b26'; ctx.font = 'bold 46px Georgia'; ctx.fillText('INVOICE', 42, 120);
  ctx.fillStyle = '#6d6557'; ctx.font = '13px monospace'; ctx.textAlign = 'right';
  ctx.fillText('No. 2041', 578, 70); ctx.fillText('07 Nov 2026', 578, 90); ctx.textAlign = 'left';
  line(ctx, 42, 148, 578, 148, '#2f2b26', 2);
  ctx.fillStyle = '#8a8172'; ctx.font = '11px monospace'; ctx.fillText('BILL TO', 42, 184);
  bar(ctx, 42, 198, 190, '#b3a992'); bar(ctx, 42, 216, 150, '#c4bba6'); bar(ctx, 42, 234, 172, '#c4bba6');
  ctx.fillText('DUE DATE', 420, 184); ctx.fillStyle = '#4a443b'; ctx.font = '17px Georgia'; ctx.fillText('21 Nov 2026', 420, 212);
  ctx.fillStyle = '#8a8172'; ctx.font = '11px monospace';
  ctx.fillText('DESCRIPTION', 42, 292); ctx.fillText('QTY', 420, 292);
  ctx.textAlign = 'right'; ctx.fillText('AMOUNT', 578, 292); ctx.textAlign = 'left';
  line(ctx, 42, 304, 578, 304, '#d8cfba', 1.4);
  const rows = [['Brand identity design', '1', '$1,800.00'], ['Print production — 250 units', '250', '$1,150.00'], ['Art direction, day rate', '2', '$960.00'], ['Revisions & retouch', '1', '$350.00']];
  ctx.font = '15px Georgia';
  rows.forEach((r, i) => {
    const y = 336 + i * 42; ctx.fillStyle = '#4a443b';
    ctx.fillText(r[0], 42, y); ctx.fillText(r[1], 428, y);
    ctx.textAlign = 'right'; ctx.fillText(r[2], 578, y); ctx.textAlign = 'left';
    line(ctx, 42, y + 14, 578, y + 14, '#e2dac9', 1);
  });
  line(ctx, 330, 520, 578, 520, '#2f2b26', 1.6);
  ctx.fillStyle = '#8a8172'; ctx.font = '12px monospace'; ctx.fillText('TOTAL DUE', 330, 552);
  ctx.fillStyle = '#2f2b26'; ctx.font = 'bold 27px Georgia'; ctx.textAlign = 'right'; ctx.fillText('$4,260.00', 578, 556); ctx.textAlign = 'left';
  ctx.fillStyle = '#8a8172'; ctx.font = '11px monospace'; ctx.fillText('NOTES', 42, 620);
  bar(ctx, 42, 634, 300, '#c4bba6'); bar(ctx, 42, 650, 240, '#d0c7b2');
  ctx.save(); ctx.translate(150, 746); ctx.rotate(-0.21); ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#b34a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 44, 0, 7); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 36, 0, 7); ctx.stroke();
  ctx.fillStyle = '#b34a4a'; ctx.font = 'bold 21px Georgia'; ctx.textAlign = 'center'; ctx.fillText('PAID', 0, 8); ctx.restore();
  ctx.textAlign = 'left'; ctx.strokeStyle = '#3f5a8a'; ctx.lineWidth = 2.2; ctx.beginPath();
  ctx.moveTo(380, 768); ctx.bezierCurveTo(398, 742, 410, 760, 424, 748); ctx.bezierCurveTo(440, 762, 456, 750, 470, 762); ctx.stroke();
  line(ctx, 372, 784, 578, 784, '#b3a992', 1);
  ctx.fillStyle = '#8a8172'; ctx.font = '10px monospace'; ctx.fillText('AUTHORIZED SIGNATURE', 372, 802);
  return c;
}

function drawLetter() {
  const { c, ctx } = paperBase('#f8f5ee');
  ctx.fillStyle = '#2f2b26'; ctx.font = 'bold 22px Georgia'; ctx.fillText('Meridian Studio', 42, 78);
  bar(ctx, 42, 94, 220, '#c4bba6');
  ctx.fillStyle = '#6d6557'; ctx.font = '12px monospace'; ctx.textAlign = 'right'; ctx.fillText('07 Nov 2026', 578, 78); ctx.textAlign = 'left';
  line(ctx, 42, 126, 578, 126, '#d8cfba', 1.4);
  ctx.fillStyle = '#3a352e'; ctx.font = '17px Georgia'; ctx.fillText('Dear Mr. Halim,', 42, 182);
  const widths = [536, 536, 480, 536, 300, 0, 536, 536, 420, 536, 250, 0, 536, 360];
  let y = 214; widths.forEach((w) => { if (w) bar(ctx, 42, y, w, '#b9b09b'); y += 20; });
  ctx.fillStyle = '#3a352e'; ctx.font = '16px Georgia'; ctx.fillText('Warm regards,', 42, 560);
  ctx.strokeStyle = '#3f5a8a'; ctx.lineWidth = 2.4; ctx.beginPath();
  ctx.moveTo(44, 612); ctx.bezierCurveTo(66, 582, 80, 606, 96, 590); ctx.bezierCurveTo(112, 606, 128, 592, 146, 606); ctx.stroke();
  ctx.fillStyle = '#4a443b'; ctx.font = '15px Georgia'; ctx.fillText('Daryl Tan', 42, 656);
  bar(ctx, 42, 668, 140, '#c4bba6');
  return c;
}

function drawNotes() {
  const { c, ctx } = paperBase('#f6f1e4');
  for (let y = 150; y <= 590; y += 40) line(ctx, 0, y, 620, y, '#ddd3bc', 1);
  line(ctx, 70, 0, 70, 880, '#e8b8b0', 1.4);
  ctx.fillStyle = '#33302a'; ctx.font = 'bold 26px Georgia'; ctx.fillText('Field Notes — 07 Nov', 94, 104);
  ctx.fillStyle = 'rgba(245,215,110,.45)'; ctx.fillRect(92, 176, 330, 22);
  ctx.strokeStyle = '#4c463c'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const scribble = (x, y, len) => { ctx.beginPath(); ctx.moveTo(x, y); for (let i = 0; i < len; i += 40) ctx.quadraticCurveTo(x + i + 20, y - 11, x + i + 40, y); ctx.stroke(); };
  scribble(96, 186, 240); scribble(96, 226, 200); scribble(96, 266, 280); scribble(96, 306, 160);
  scribble(96, 386, 200); scribble(96, 426, 280); scribble(96, 466, 160);
  ctx.beginPath(); ctx.arc(118, 546, 5, 0, 7); ctx.stroke(); scribble(140, 546, 160);
  ctx.strokeStyle = 'rgba(90,122,74,.7)'; ctx.lineWidth = 5; ctx.beginPath();
  ctx.moveTo(420, 640); ctx.lineTo(480, 700); ctx.lineTo(580, 590); ctx.stroke();
  return c;
}

function photograph(paper, tilt) {
  const W = 800, H = 1000;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2b2620'); g.addColorStop(0.55, '#201c18'); g.addColorStop(1, '#171412');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate((tilt * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
  ctx.drawImage(paper, -310, -440, 620, 880);
  ctx.restore();
  const lg = ctx.createLinearGradient(0, 0, W * 0.7, H);
  lg.addColorStop(0, 'rgba(255,255,255,.10)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.2, W / 2, H * 0.45, W * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  return c;
}

export const generateSamples = async () => {
  const defs = [[drawInvoice, -2.2, 'Invoice'], [drawLetter, 1.8, 'Letter'], [drawNotes, -1.4, 'Notes']];
  for (const [draw, tilt, name] of defs as any) {
    const photo = photograph((draw as any)(), tilt as number);
    const bmp = await createImageBitmap(photo);
    addPageFromBitmap(bmp, name as string);
  }
  toast('Sample documents loaded — try the corner nodes');
};
