/* Inspector panels — ported from the inspector section of VelaPTP/index.html
   and the control wiring of VelaPTP/js/app.js. */
import { useEffect, useRef, useState } from 'react';
import { state, active, emit, toast, clone, lastLayout, fmtBytes } from '../state';
import { getPreview, getRotated } from '../lib/imaging';
import { SIZES, pageDims, quadOutputSize, applyAdjustments } from '../lib/velaCore';
import { renderPageEl, wirePageDrag } from '../lib/pageRender';
import { generateSamples } from '../samples';
import { autoDetect, rotateActive, resetCrop } from './stages';
import { Icon } from './icons';
import type { Page } from '../types';

const signed = (v: number) => (v > 0 ? '+' + v : '' + v);
const fill = (v: number, min: number, max: number) => ({ ['--fill' as any]: ((v - min) / (max - min)) * 100 + '%' });

export function TipsPanel() {
  return (
    <div className="insp-sec" data-steps="1">
      <div className="insp-head"><h2>How it works</h2></div>
      <ol className="how-list">
        <li><span className="how-num">1</span><div><b>Upload photos</b><p>Add one or more images of documents, receipts, or notes.</p></div></li>
        <li><span className="how-num">2</span><div><b>Frame &amp; flatten</b><p>Drag the corner nodes around each page — it stretches flat and clean.</p></div></li>
        <li><span className="how-num">3</span><div><b>Enhance &amp; export</b><p>Apply scan filters, set the page layout, and save a tidy PDF.</p></div></li>
      </ol>
      <button className="vp-btn btn-soft btn-full" id="sampleBtn" style={{ marginTop: 20 }} onClick={() => generateSamples()}>
        <Icon name="spark" />Try sample photos
      </button>
    </div>
  );
}

export function CropPanel() {
  const page = active();
  return (
    <div className="insp-sec" data-steps="2">
      <div className="insp-head"><h2>Frame</h2></div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="vp-btn btn-soft" id="autoBtn" style={{ flex: 1 }} disabled={!page} onClick={autoDetect}>
          <Icon name="spark" />Auto-detect
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button className="vp-btn btn-ghost" id="rotateBtn" style={{ flex: 1 }} disabled={!page} onClick={rotateActive}>
          <Icon name="rotate" />Rotate
        </button>
        <button className="vp-btn btn-ghost" id="resetCrop" style={{ flex: 1 }} disabled={!page} onClick={resetCrop}>
          <Icon name="reset" />Reset
        </button>
      </div>
      <div className="summary" style={{ marginTop: 18 }}>
        <div className="stat-line"><span>CROP</span><b id="cropSize">{page ? cropSizeText(page) : '— × —'}</b></div>
        <div className="stat-line"><span>PHOTO</span><b id="cropPos">{activeIndexText()}</b></div>
      </div>
      <p className="align-note" style={{ marginTop: 14 }}>
        Tip: pull the four corner nodes to the page edges. Vela straightens the perspective automatically.
      </p>
    </div>
  );
}

function cropSizeText(page: Page) {
  const rot = getRotated(page);
  const s = quadOutputSize(page.quad, rot.width, rot.height);
  return `${s.w} × ${s.h}`;
}
function activeIndexText() {
  const i = state.pages.findIndex((p) => p.id === state.activeId);
  return `${i + 1} / ${state.pages.length}`;
}
const FILTERS: { id: string; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'auto', label: 'Auto' },
  { id: 'gray', label: 'Grayscale' },
  { id: 'bw', label: 'B&W Doc' },
];

export function EnhancePanel({ version }: { version: number }) {
  const chipRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const page = active();

  useEffect(() => {
    FILTERS.forEach((f, i) => {
      const cv = chipRefs.current[i];
      if (!cv) return;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!page) { ctx.fillStyle = '#d8dee8'; ctx.fillRect(0, 0, cv.width, cv.height); return; }
      const pv = getPreview(page);
      ctx.drawImage(pv, 0, 0, cv.width, cv.height);
      if (f.id !== 'original') {
        const img = ctx.getImageData(0, 0, cv.width, cv.height);
        applyAdjustments(img, { filter: f.id, brightness: page.brightness, contrast: page.contrast });
        ctx.putImageData(img, 0, 0);
      }
    });
  }, [version, page]);

  return (
    <div className="insp-sec" data-steps="3">
      <div className="insp-head"><h2>Enhance</h2><div className="spacer" />
        <button className="text-btn" id="resetEnhance" onClick={() => {
          const p = active(); if (!p) return;
          p.filter = 'original'; p.brightness = 0; p.contrast = 0;
          emit('image'); toast('Enhancement reset');
        }}>Reset</button>
      </div>
      <div className="filters" id="filters">
        {FILTERS.map((f, i) => (
          <button
            key={f.id}
            className={'vp-chip' + (page?.filter === f.id ? ' active' : '')}
            data-f={f.id}
            onClick={() => {
              const p = active(); if (!p) return;
              p.filter = f.id as any;
              emit('image');
            }}
          >
            <span className="chip-img">
              <canvas width={60} height={80} ref={(el) => { chipRefs.current[i] = el; }} />
            </span>
            <span>{f.label}</span>
          </button>
        ))}
      </div>
      <div className="slider-row">
        <div className="slider-label"><label>Brightness</label><output id="brightnessVal">{signed(page?.brightness ?? 0)}</output></div>
        <input type="range" id="brightness" min={-100} max={100} value={page?.brightness ?? 0} style={fill(page?.brightness ?? 0, -100, 100)}
          onChange={(e) => { const p = active(); if (!p) return; p.brightness = +e.target.value; emit('image'); }} />
      </div>
      <div className="slider-row">
        <div className="slider-label"><label>Contrast</label><output id="contrastVal">{signed(page?.contrast ?? 0)}</output></div>
        <input type="range" id="contrast" min={-100} max={100} value={page?.contrast ?? 0} style={fill(page?.contrast ?? 0, -100, 100)}
          onChange={(e) => { const p = active(); if (!p) return; p.contrast = +e.target.value; emit('image'); }} />
      </div>
    </div>
  );
}

export function LayoutPanel() {
  const page = active();
  const L = page?.layout;
  return (
    <div className="insp-sec" data-steps="3">
      <div className="insp-head"><h2>Page layout</h2><div className="spacer" />
        <button className="text-btn" id="applyAll" onClick={() => {
          const p = active(); if (!p) return;
          state.pages.forEach((x) => (x.layout = clone(p.layout)));
          emit('layout');
          toast(`Layout applied to all ${state.pages.length} pages`);
        }}>Apply to all</button>
      </div>
      <div className="ctl-grid">
        <div className="ctl"><label>Page size</label>
          <select id="pageSize" value={L?.size ?? 'a4'} disabled={!L}
            onChange={(e) => { const p = active(); if (!p) return; p.layout.size = e.target.value; lastLayout.size = e.target.value; emit('layout'); }}>
            <option value="a2">A2 · 420 × 594</option>
            <option value="a3">A3 · 297 × 420</option>
            <option value="a4">A4 · 210 × 297</option>
            <option value="a5">A5 · 148 × 210</option>
            <option value="a6">A6 · 105 × 148</option>
            <option value="f5">F5 · 165 × 210</option>
            <option value="letter">Letter · 8.5 × 11</option>
            <option value="match">Match image</option>
          </select>
        </div>
        <div className="ctl"><label>Orientation</label>
          <div className="seg" id="orientSeg">
            {(['auto', 'portrait', 'landscape'] as const).map((o) => (
              <button key={o} data-o={o} className={L?.orientation === o ? 'active' : ''}
                onClick={() => { const p = active(); if (!p) return; p.layout.orientation = o; lastLayout.orientation = o; emit('layout'); }}>
                {o === 'landscape' ? 'Land.' : o[0].toUpperCase() + o.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="ctl"><label>Image fit</label>
          <div className="seg" id="fitSeg">
            {(['fit', 'fill'] as const).map((f) => (
              <button key={f} data-fit={f} className={L?.fit === f ? 'active' : ''}
                onClick={() => { const p = active(); if (!p) return; p.layout.fit = f; lastLayout.fit = f; emit('layout'); }}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="ctl"><label>Margin · <span className="mono" id="marginVal" style={{ color: 'var(--accent)' }}>{L?.marginMM ?? 10} mm</span></label>
          <input type="range" id="margin" min={0} max={40} value={L?.marginMM ?? 10} style={{ marginTop: 11, ...fill(L?.marginMM ?? 10, 0, 40) }}
            onChange={(e) => {
              const p = active(); if (!p) return;
              p.layout.marginMM = +e.target.value; lastLayout.marginMM = p.layout.marginMM;
              emit('layout');
            }} />
        </div>
      </div>
      <div className="align-wrap">
        <div className="align-grid" id="alignGrid">
          {[0, 0.5, 1].map((y) => [0, 0.5, 1].map((x) => (
            <button key={`${x}-${y}`} data-x={x} data-y={y}
              aria-label={`${y} ${x}`}
              className={L && Math.abs(L.align.x - x) < 0.01 && Math.abs(L.align.y - y) < 0.01 ? 'active' : ''}
              onClick={() => { const p = active(); if (!p) return; p.layout.align = { x, y }; lastLayout.align = p.layout.align; emit('layout'); }} />
          )))}
        </div>
        <p className="align-note">Position the image on the page — or drag it directly on the preview.</p>
      </div>
    </div>
  );
}

export function ExportPanel({ version, pageMiniRef }: { version: number; pageMiniRef: React.RefObject<HTMLDivElement | null> }) {
  const page = active();
  const quality = state.export.quality;
  const [est, setEst] = useState('≈ 0 MB');

  useEffect(() => {
    if (pageMiniRef.current) wirePageDrag(pageMiniRef.current);
  }, [pageMiniRef]);

  useEffect(() => {
    if (pageMiniRef.current && page) renderPageEl(pageMiniRef.current, page, false, 0, 0);
  }, [version, page, pageMiniRef]);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = quality;
      const maxSide = q >= 0.9 ? 3200 : 2500;
      let total = 0;
      for (const p of state.pages) {
        const pv = getPreview(p);
        const bytes = atob(pv.toDataURL('image/jpeg', q).split(',')[1]).length;
        total += bytes * Math.pow(maxSide / Math.max(pv.width, pv.height), 2);
      }
      setEst('≈ ' + fmtBytes(total * 1.03));
    }, 300);
    return () => clearTimeout(t);
  }, [version, quality]);

  let format = '—', dpi = '— DPI';
  if (page) {
    const pv = getPreview(page);
    const { wmm, hmm, portrait } = pageDims(page, pv.width, pv.height);
    const label = SIZES[page.layout.size as keyof typeof SIZES]?.label || 'MATCH';
    const maxSide = quality >= 0.9 ? 3200 : 2500;
    const d = Math.round(maxSide / (Math.max(wmm, hmm) / 25.4));
    format = `${label} · ${portrait ? 'PORTRAIT' : 'LANDSCAPE'}`;
    dpi = `${d} DPI · ${d >= 200 ? 'SHARP' : 'GOOD'}`;
  }

  return (
    <div className="insp-sec" data-steps="3">
      <div className="insp-head"><h2>Page preview</h2></div>
      <div className="page-preview-box">
        <div className="vp-page page-mini draggable" id="pageMini" ref={pageMiniRef}>
          <div className="vp-page-content" />
          <span className="vp-page-tag" id="pageMiniTag" />
        </div>
      </div>
      <div className="slider-row" style={{ marginTop: 2 }}>
        <div className="slider-label"><label>JPEG quality</label><output id="qualityVal">{Math.round(quality * 100)}%</output></div>
        <input type="range" id="quality" min={50} max={95} value={Math.round(quality * 100)} style={fill(Math.round(quality * 100), 50, 95)}
          onChange={(e) => { state.export.quality = +e.target.value / 100; emit('export'); }} />
      </div>
      <div className="summary">
        <div className="stat-line"><span>PAGES</span><b id="expPages">{state.pages.length}</b></div>
        <div className="stat-line"><span>FORMAT</span><b id="expFormat">{format}</b></div>
        <div className="stat-line"><span>EST. SIZE</span><b id="expSize">{est}</b></div>
        <div className="stat-line"><span>CLARITY</span><b className="good" id="expDpi">{dpi}</b></div>
      </div>
    </div>
  );
}
