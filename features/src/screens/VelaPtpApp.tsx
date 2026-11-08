/* ================================================================
   VelaPtpApp — wizard orchestrator. Ported from the flow machine,
   wiring and store subscription of VelaPTP/js/app.js.
   Extra native integration: History-based Back stepping, native
   open/save dialogs, launcher theme via initTheme().
   ================================================================ */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  state, active, emit, subscribe, toast, clamp, debounce, releasePage,
} from './velapt/state';
import { importFiles } from './velapt/samples';
import { thumbImg, PhotoRail } from './velapt/components/PhotoRail';
import { StageUpload, StageCrop, StagePreview, editorApi, rotateActive } from './velapt/components/stages';
import { TipsPanel, CropPanel, EnhancePanel, LayoutPanel, ExportPanel } from './velapt/components/panels';
import { Stepper, ActionBar, ToastStack, ProgressOverlay } from './velapt/components/chrome';
import { IconSprite } from './velapt/components/icons';
import { exportPDF } from './velapt/lib/pdfExport';
import { vela } from '../lib/ipc';
import { base64ToFile } from './picture/helpers';
import './velapt/velapt.css';

function firstUnconfirmed() {
  return state.pages.find((p) => !p.confirmed) || null;
}

function runScan(id: string) {
  const s = document.getElementById(id);
  if (!s) return;
  s.classList.remove('run');
  void (s as HTMLElement).offsetWidth;
  s.classList.add('run');
}

let deleteStash: { page: any; index: number } | null = null;
let deleteTimer: any = null;

export function VelaPtpApp() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ msg: '', pct: 0 });
  const pageMiniRef = useRef<HTMLDivElement>(null);
  const step = state.flow.step;

  /* ---------- store subscription (ported subscribe() switch) ---------- */
  useEffect(() => {
    const refreshThumbs = debounce(() => {
      state.pages.forEach((p) => thumbImg(p));
      force();
    }, 250);
    return subscribe((tag) => {
      if (tag === 'rotate') editorApi.current?.render();
      if (tag === 'quad' || tag === 'image' || tag === 'rotate') refreshThumbs();
      if (tag === 'active' && state.flow.step === 2) runScan('scanline2');
      force();
    });
  }, []);

  /* ---------- flow machine ---------- */
  const goStep = useCallback((n: number, fromHistory = false) => {
    const next = clamp(n, 1, 3);
    if (next === state.flow.step && !fromHistory) return;
    state.flow.step = next;
    if (next === 2) {
      const target = firstUnconfirmed() || active() || state.pages[0];
      if (target) state.activeId = target.id;
    } else if (next === 3) {
      if (!active() && state.pages[0]) state.activeId = state.pages[0].id;
    }
    if (!fromHistory) history.pushState({ velaptStep: next }, '');
    emit('flow');
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => goStep((e.state && e.state.velaptStep) || 1, true);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [goStep]);

  /* ---------- export (native save dialog) ---------- */
  const doExport = async () => {
    if (busy || !state.pages.length) return;
    setBusy(true);
    state.busy = true;
    setProgress({ msg: `Page 1 of ${state.pages.length}`, pct: 0 });
    runScan('scanline3');
    const res = await exportPDF({
      filename: state.export.filename,
      quality: state.export.quality,
      onProgress: (i: number, n: number) => setProgress({ msg: `Page ${Math.min(i + 1, n)} of ${n}`, pct: (i / n) * 100 }),
    });
    setBusy(false);
    state.busy = false;
    if (res.ok) toast(`PDF exported — ${res.pages} page${res.pages > 1 ? 's' : ''}`);
    else if (!res.cancelled) toast('Export failed: ' + res.error, { type: 'error' });
  };

  const primaryAction = () => {
    if (step === 1) {
      if (!state.pages.length) return;
      goStep(2);
      runScan('scanline2');
      return;
    }
    if (step === 2) {
      const p = active();
      if (p && !p.confirmed) {
        p.confirmed = true;
        const next = firstUnconfirmed();
        if (next) {
          state.activeId = next.id;
          emit('active');
          runScan('scanline2');
          toast('Crop confirmed', { undo: () => { p.confirmed = false; emit('pages'); } });
        } else {
          emit('pages');
          runScan('scanline2');
          toast('All pages framed — ready to enhance');
        }
      } else {
        goStep(3);
        runScan('scanline3');
      }
      return;
    }
    doExport();
  };

  /* ---------- photo management ---------- */
  const removePage = (id: string) => {
    const i = state.pages.findIndex((p) => p.id === id);
    if (i < 0) return;
    if (state.pages.length === 1) { toast('Keep at least one photo — add more first', { type: 'warn' }); return; }
    const [page] = state.pages.splice(i, 1);
    if (state.activeId === id) state.activeId = state.pages[Math.min(i, state.pages.length - 1)].id;
    deleteStash = { page, index: i };
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => { releasePage(deleteStash?.page); deleteStash = null; }, 6500);
    emit('pages');
    toast(`Removed “${page.name}”`, { undo: undoDelete });
  };

  const undoDelete = () => {
    if (!deleteStash) return;
    clearTimeout(deleteTimer);
    const { page, index } = deleteStash;
    deleteStash = null;
    state.pages.splice(Math.min(index, state.pages.length), 0, page);
    state.activeId = page.id;
    emit('pages');
    toast('Photo restored');
  };

  /* ---------- native file dialog ---------- */
  const addPhotos = async () => {
    try {
      const files = await vela().files.openImages();
      if (files && files.length) {
        await importFiles(files.map((f) => base64ToFile(f.name, f.dataBase64)));
      }
    } catch (e) {
      console.error(e);
      toast('Could not open images', { type: 'error' });
    }
  };

  /* ---------- keyboard shortcuts (ported) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches('input,select,textarea')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && active()) { e.preventDefault(); removePage(state.activeId); }
      else if (e.key.toLowerCase() === 'r' && active() && state.flow.step === 2) { rotateActive(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoDelete(); }
      else if (e.key === 'Enter' && state.flow.step === 2) { e.preventDefault(); primaryAction(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- clipboard paste intake ---------- */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && t.matches && t.matches('input,select,textarea')) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      importFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  /* ---------- window drag suppression + resize ---------- */
  useEffect(() => {
    const over = (e: Event) => e.preventDefault();
    const onResize = debounce(() => force(), 120);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', over);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', over);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  /* ---------- inspector visibility (ported updateFlowUI) ---------- */
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.insp-sec').forEach((sec) => {
      const steps = (sec.dataset.steps || '1,2,3').split(',').map(Number);
      sec.style.display = steps.includes(step) ? '' : 'none';
    });
  });

  return (
    <div className="vp-root">
      <IconSprite />
      <Stepper step={step} onStep={(s) => {
        if (s > 1 && !state.pages.length) { toast('Add at least one photo first', { type: 'warn' }); return; }
        goStep(s);
      }} />
      <main className="workspace">
        <PhotoRail
          onAdd={addPhotos}
          onSelect={(id) => { if (state.activeId !== id) { state.activeId = id; emit('active'); } }}
          onRemove={removePage}
        />
        <section className="stage-col">
          <StageUpload step={step} onBrowse={addPhotos} />
          <StageCrop version={state.version} step={step} />
          <StagePreview version={state.version} step={step} />
        </section>
        <aside className="inspector" id="inspector">
          <TipsPanel />
          <CropPanel />
          <EnhancePanel version={state.version} />
          <LayoutPanel />
          <ExportPanel version={state.version} pageMiniRef={pageMiniRef} />
        </aside>
      </main>
      <ActionBar
        step={step}
        busy={busy}
        onBack={() => history.back()}
        onPrimary={primaryAction}
        onAdd={addPhotos}
      />
      <ToastStack />
      <ProgressOverlay visible={busy} msg={progress.msg} pct={progress.pct} />
    </div>
  );
}
