/* Stage surfaces — ported from the stage/editor section of VelaPTP/js/app.js. */
import { useEffect, useRef } from 'react';
import { active, emit, quadOutputSize, toast } from '../state';
import { getRotated, autoDetectQuad } from '../lib/imaging';
import { rotateQuad90, defaultQuad } from '../lib/velaCore';
import { createQuadEditor } from '../quadEditor';
import { renderPageEl, wirePageDrag } from '../lib/pageRender';
import { importFiles } from '../samples';
import { Icon } from './icons';

/** Shared access to the mounted quad editor (used by the orchestrator). */
export const editorApi: { current: ReturnType<typeof createQuadEditor> | null } = { current: null };

export function StageUpload({ step, onBrowse }: { step: number; onBrowse: () => void }) {
  return (
    <div className={'stage' + (step === 1 ? '' : ' hidden')} id="stageUpload">
      <div className="stage-grid" />
      <div className="scanline" id="scanline1" />
      <div
        className="dropzone"
        id="dropzone"
        onClick={onBrowse}
        onDragEnter={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('over'); }}
        onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('over'); }}
        onDragLeave={(e) => (e.currentTarget as HTMLElement).classList.remove('over')}
        onDrop={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).classList.remove('over');
          if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
        }}
      >
        <button className="vp-btn btn-primary" type="button">Add photos</button>
        <p>Drop images here or paste with Ctrl+V.</p>
        <span className="fmt">Up to 30 photos</span>
      </div>
    </div>
  );
}

export function StageCrop({ version, step }: { version: number; step: number }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLCanvasElement>(null);
  const nodeRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ed = createQuadEditor(wrapRef.current!, photoRef.current!, nodeRef.current!, stageRef.current!);
    ed.init();
    editorApi.current = ed;
    const onResize = () => ed.render();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      ed.destroy();
      editorApi.current = null;
    };
  }, []);

  const page = active();
  const showWrap = step === 2 && !!page;
  const rot = page ? getRotated(page) : null;
  const size = page && rot ? quadOutputSize(page.quad, rot.width, rot.height) : null;

  useEffect(() => {
    const ed = editorApi.current;
    if (!ed || !showWrap) return;
    // fit() (via render) is needed whenever the stage was hidden — the canvas
    // has no layout size until it is visible again.
    if (!wrapRef.current?.clientWidth) ed.render();
    else ed.redraw();
  }, [version, showWrap]);

  return (
    <div className={'stage' + (step === 2 ? '' : ' hidden')} id="stageCrop" ref={stageRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files); }}
    >
      <div className="stage-grid" />
      <div className="scanline" id="scanline2" />
      <div className="photo-wrap" id="photoWrap" ref={wrapRef} style={{ display: showWrap ? '' : 'none' }}>
        <canvas id="photoCanvas" ref={photoRef} />
        <canvas id="nodeLayer" className="node-layer" ref={nodeRef} />
        <div className="crop-readout" id="cropReadout">{size ? `${size.w} × ${size.h} PX` : '— × — PX'}</div>
      </div>
      <div className="stage-hint" id="cropHint" style={{ display: showWrap ? '' : 'none' }}>
        Drag the corner nodes to frame your document
      </div>
    </div>
  );
}

export function StagePreview({ version, step }: { version: number; step: number }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pageRef.current) wirePageDrag(pageRef.current);
  }, []);

  const page = active();
  useEffect(() => {
    if (!pageRef.current) return;
    if (page && step === 3) {
      const stage = stageRef.current!;
      renderPageEl(pageRef.current, page, true, stage.clientWidth - 90, stage.clientHeight - 80);
    }
  }, [version, step, page]);

  return (
    <div className={'stage' + (step === 3 ? '' : ' hidden')} id="stagePreview" ref={stageRef}>
      <div className="stage-grid" />
      <div className="scanline" id="scanline3" />
      <div className="vp-page draggable" id="pageBig" ref={pageRef}>
        <span className="vp-page-tag" id="pageBigTag" />
        <div className="vp-page-content" />
      </div>
    </div>
  );
}

/* ---------- crop tool actions (shared with the panels) ---------- */
export function rotateActive() {
  const p = active(); if (!p) return;
  p.rotation = (p.rotation + 90) % 360;
  p.quad = rotateQuad90(p.quad);
  emit('rotate');
}
export function resetCrop() {
  const p = active(); if (!p) return;
  p.quad = defaultQuad();
  emit('quad');
  editorApi.current?.redraw();
  toast('Corners reset');
}
export function autoDetect() {
  const p = active(); if (!p) return;
  const q = autoDetectQuad(getRotated(p));
  if (q) {
    p.quad = q;
    emit('quad');
    editorApi.current?.redraw();
    toast('Document edges detected');
  } else toast('No clear edges found — drag the nodes manually', { type: 'warn' });
}
