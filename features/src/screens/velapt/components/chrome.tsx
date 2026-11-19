/* Wizard chrome — stepper / action bar / toasts / progress (ported from
   VelaPTP/index.html + updateFlowUI + toast stack of VelaPTP/js/app.js). */
import { useEffect, useState } from 'react';
import { state, subscribeToasts, type ToastItem } from '../state';
import { Icon } from './icons';

const STEP_META: Record<number, { kicker: string; title: string; primary: string }> = {
  1: { kicker: 'Step 1 of 3', title: 'Add photos', primary: 'Continue' },
  2: { kicker: 'Step 2 of 3', title: 'Frame & flatten each page', primary: 'Confirm & next' },
  3: { kicker: 'Step 3 of 3', title: 'Enhance, lay out & export', primary: 'Export PDF' },
};

export function Stepper({ step, onStep, inspectorOpen, onInspect }: {
  step: number;
  onStep: (n: number) => void;
  inspectorOpen: boolean;
  onInspect: () => void;
}) {
  const total = state.pages.length;
  return (
    <nav className="stepbar" aria-label="Progress">
      <ol className="stepper" id="stepper">
        {[1, 2, 3].map((s) => (
          <li
            key={s}
            className={'step' + (s === step ? ' current' : s < step ? ' done' : '') + (s > step && total === 0 ? ' disabled' : '')}
            data-step={s}
          >
            <button type="button" disabled={s > 1 && total === 0}
              aria-current={s === step ? 'step' : undefined} onClick={() => onStep(s)}>
              <span className="dot" aria-hidden="true">{s < step ? <Icon name="check" /> : String(s)}</span>
              <span className="lbl">{s === 1 ? 'Import' : s === 2 ? 'Crop' : 'Enhance & export'}</span>
            </button>
            {s < 3 && <span className={'link' + (s < step ? ' done' : '')} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <button className="vp-btn btn-ghost vp-inspector-toggle" type="button"
        aria-controls="inspector" aria-expanded={inspectorOpen} onClick={onInspect}>
        Inspector
      </button>
    </nav>
  );
}

export function ActionBar({ step, onBack, onPrimary, onAdd, busy }: {
  step: number;
  onBack: () => void;
  onPrimary: () => void;
  onAdd: () => void;
  busy: boolean;
}) {
  const total = state.pages.length;
  const meta = STEP_META[step];
  const activeIdx = state.pages.findIndex((p) => p.id === state.activeId);
  const anyUnconfirmed = state.pages.some((p) => !p.confirmed);
  const title = step === 2 && total ? `Photo ${activeIdx + 1} of ${total}` : meta.title;
  const primary = step === 2 ? (anyUnconfirmed ? 'Confirm & next' : 'Continue to enhance') : meta.primary;
  const disabled = total === 0 || (step === 3 && busy);
  return (
    <footer className="actionbar">
      <div className="side">
        <button className="vp-btn btn-ghost" id="backBtn" style={{ visibility: step === 1 ? 'hidden' : 'visible' }} onClick={onBack}>
          <Icon name="left" />Back
        </button>
      </div>
      <div className="center">
        <div className="kicker" id="barKicker">{meta.kicker}</div>
        <div className="title" id="barTitle">{title}</div>
      </div>
      <div className="side">
        <button className="vp-btn btn-ghost" id="addMoreBtn" style={{ display: step === 3 ? 'none' : '' }} onClick={onAdd}>
          <Icon name="plus" />Add photos
        </button>
        <div className="file-field" id="fileField" style={{ display: step === 3 ? '' : 'none' }}>
          <input
            id="filename"
            defaultValue={state.export.filename}
            spellCheck={false}
            aria-label="PDF filename"
            onChange={(e) => { state.export.filename = e.target.value; }}
          />
          <span>.pdf</span>
        </div>
        <button className="vp-btn btn-primary btn-lg" id="primaryBtn" disabled={disabled} onClick={onPrimary}>
          {primary}
          <Icon name={step === 3 ? 'download' : 'right'} />
        </button>
      </div>
    </footer>
  );
}

export function ToastStack() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <div className="toast-stack" id="toastStack">
      {items.map((t) => (
        <div key={t.id} className={'vp-toast' + (t.type ? ' ' + t.type : '')}>
          <span className="dot" />
          <span>{t.msg}</span>
          {t.undo && (
            <button className="undo" onClick={() => { t.undo!(); }}>
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ProgressOverlay({ visible, msg, pct }: { visible: boolean; msg: string; pct: number }) {
  return (
    <div className={'overlay' + (visible ? '' : ' hidden')} id="progressOverlay">
      <div className="progress-card">
        <div className="ring" />
        <h3 id="progressTitle">Rendering your PDF</h3>
        <p id="progressMsg">{msg}</p>
        <div className="progress-bar"><i id="progressBar" style={{ width: pct + '%' }} /></div>
      </div>
    </div>
  );
}
