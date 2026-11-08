// @ts-nocheck
/* ================================================================
   PDF export — ported from VelaPTP/js/app.js:401-447, with the
   <a download> replaced by the native save dialog (vela.files.save).
   ================================================================ */
import { jsPDF } from 'jspdf';
import { state } from '../state';
import { processPage } from './imaging';
import { pageDims, computePlacement, SIZES } from './velaCore';
import { fillCrop } from './pageRender';
import { vela } from '../../../lib/ipc';
import { blobToBase64 } from '../../picture/helpers';

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function exportPDF({ filename, quality, onProgress }) {
  const pages = state.pages;
  if (!pages.length) return { ok: false, error: 'no pages' };
  const maxSide = quality >= 0.9 ? 3200 : 2500;
  const name = (filename.trim() || 'vela-scan').replace(/\.pdf$/i, '');
  let doc = null;
  try {
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const page = pages[i];
      const full = processPage(page, maxSide);
      const { portrait } = pageDims(page, full.width, full.height);
      const orientation = portrait ? 'portrait' : 'landscape';
      let baseW, baseH;
      if (page.layout.size === 'match') {
        const { wmm, hmm } = pageDims(page, full.width, full.height);
        baseW = Math.min(wmm, hmm); baseH = Math.max(wmm, hmm);
      } else {
        const s = SIZES[page.layout.size];
        baseW = Math.min(s.w, s.h); baseH = Math.max(s.w, s.h);
      }
      const fmt = [baseW, baseH];
      if (!doc) doc = new jsPDF({ unit: 'mm', format: fmt, orientation, compress: true });
      else doc.addPage(fmt, orientation);
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      let imgCanvas = full, pl;
      if (page.layout.fit === 'fill') {
        const m = page.layout.marginMM, cw = pw - 2 * m, ch = ph - 2 * m;
        imgCanvas = fillCrop(full, cw / ch, page.layout.align);
        pl = { x: m, y: m, w: cw, h: ch };
      } else pl = computePlacement(page, full.width, full.height, pw, ph);
      const url = imgCanvas.toDataURL('image/jpeg', quality);
      doc.addImage(url, 'JPEG', pl.x, pl.y, pl.w, pl.h, 'p' + page.id, 'FAST');
      await tick();
    }
    onProgress?.(pages.length, pages.length);
    doc.setProperties({ title: name, subject: 'Scanned with VelaPTP', creator: 'VelaPTP' });
    const blob = doc.output('blob');
    const saved = await vela().files.save(
      name + '.pdf',
      [{ name: 'PDF document', extensions: ['pdf'] }],
      await blobToBase64(blob)
    );
    return saved ? { ok: true, saved, pages: pages.length } : { ok: false, cancelled: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: (e as Error).message };
  }
}
