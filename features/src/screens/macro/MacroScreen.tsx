import { useEffect, useState } from 'react';
import { Circle, FolderOpen, Keyboard, Play, Save, Square, Trash2 } from 'lucide-react';
import { vela, type MacroCommand, type MacroState } from '../../lib/ipc';

const maxRepetitions = 2147483647;
const statuses: Record<MacroState['phase'], { text: string; tone: string }> = {
  idle: { text: 'Ready', tone: 'neutral' },
  recording: { text: 'Recording', tone: 'danger' },
  countdown: { text: 'Starting soon', tone: 'warning' },
  playing: { text: 'Playing', tone: 'success' },
  stopping: { text: 'Stopping', tone: 'warning' },
};

function elapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function MacroScreen() {
  const [state, setState] = useState<MacroState | null>(null);
  const [supported, setSupported] = useState(false);
  const [recordMoves, setRecordMoves] = useState(true);
  const [repeat, setRepeat] = useState('1');
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState<MacroCommand | null>(null);
  const [error, setError] = useState('');
  const macro = vela()?.macro;

  useEffect(() => {
    if (!macro) return;
    let mounted = true;
    const unsubscribe = macro.onState(setState);
    macro.status().then((initial) => {
      if (!mounted) return;
      setState((current) => current ?? initial.state);
      setSupported(initial.supported);
    }).catch((failure: Error) => {
      if (mounted) setError(failure.message);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [macro]);

  const phase = state?.phase ?? 'idle';
  const status = statuses[phase];
  const active = phase !== 'idle';
  const canEdit = supported && !active && !busy;
  const actions = state?.actionCount ?? 0;
  const cycles = state?.cycles ?? 0;
  const total = state?.repetitions;
  const message = error || state?.error;
  const iterations = Number(repeat);
  const invalidRepeat = !/^\d+$/.test(repeat) || iterations < 1 || iterations > maxRepetitions;

  async function run(command: MacroCommand, options?: { recordMoves?: boolean; repetitions?: number }) {
    if (!macro || busy) return;
    setBusy(command);
    setError('');
    try {
      const result = await macro.command(command, options);
      if (!result.ok) setError(result.error);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page desktop-workspace macro-workspace" aria-label="Macro Recorder">
      <div className="macro-heading">
        <h1 className="page-title">Macro Recorder</h1>
        <p>Record clicks, scrolling and keystrokes, then replay them.</p>
      </div>

      <div className="macro-grid">
        <section className="card-panel macro-card" aria-labelledby="macro-session-heading">
          <div className="macro-card-header">
            <h2 id="macro-session-heading">Session</h2>
            <span className={`badge ${status.tone}`} role="status">
              <span className="dot" />
              {phase === 'countdown' ? `Starting in ${state?.countdown}s`
                : state ? supported ? status.text : 'Unavailable' : macro && !error ? 'Loading…' : 'Unavailable'}
            </span>
          </div>
          <dl className="macro-stats">
            <div><dt>Actions</dt><dd>{actions.toLocaleString()}</dd></div>
            <div><dt>Cycles</dt><dd>{cycles.toLocaleString()}{total != null && (
              <span> / {total === 0 ? '∞' : total.toLocaleString()}</span>
            )}</dd></div>
            <div><dt>Elapsed</dt><dd>{elapsed(state?.elapsedMs ?? 0)}</dd></div>
          </dl>
          {total != null && total > 0 && (
            <progress className="macro-progress" aria-label="Playback progress" value={cycles} max={total} />
          )}
          <div className="macro-actions">
            {active ? (
              <button className="btn danger" type="button" disabled={busy !== null || phase === 'stopping'}
                onClick={() => void run('stop')}>
                <Square aria-hidden="true" /> Stop {phase === 'recording' ? 'recording' : 'playback'}
              </button>
            ) : (
              <>
                <button className="btn primary" type="button" disabled={!canEdit}
                  onClick={() => void run('record', { recordMoves })}>
                  <Circle aria-hidden="true" /> Record
                </button>
                <button className="btn" type="button" disabled={!canEdit || !actions || (!loop && invalidRepeat)}
                  onClick={() => void run('play', { repetitions: loop ? 0 : iterations })}>
                  <Play aria-hidden="true" /> Play
                </button>
              </>
            )}
          </div>
          <p className="macro-hint">
            {phase === 'recording' ? 'Use F9 to stop without recording a click on the Stop button.'
              : 'Playback gives you 3 seconds to focus the target window.'}
          </p>
        </section>

        <section className="card-panel macro-card" aria-labelledby="macro-options-heading">
          <h2 id="macro-options-heading">Options</h2>
          <label className="macro-check">
            <input type="checkbox" checked={recordMoves} disabled={!canEdit}
              onChange={(event) => setRecordMoves(event.target.checked)} />
            Record pointer movement
          </label>
          <div className="field macro-repeat">
            <label htmlFor="macro-repetitions">Repetitions</label>
            <input id="macro-repetitions" type="number" inputMode="numeric" min={1} max={maxRepetitions}
              step={1} value={repeat} disabled={!canEdit || loop} aria-invalid={!loop && invalidRepeat}
              aria-describedby={!loop && invalidRepeat ? 'macro-repeat-error' : undefined}
              onChange={(event) => setRepeat(event.target.value)} />
            {!loop && invalidRepeat && (
              <p className="macro-error" id="macro-repeat-error">Enter a whole number from 1 to 2,147,483,647.</p>
            )}
          </div>
          <label className="macro-check">
            <input type="checkbox" checked={loop} disabled={!canEdit}
              onChange={(event) => setLoop(event.target.checked)} />
            Loop until stopped
          </label>
        </section>

        <section className="card-panel macro-card macro-files" aria-labelledby="macro-files-heading">
          <div className="macro-file-info">
            <h2 id="macro-files-heading">Recording file</h2>
            <p className="macro-hint" title={state?.fileName ?? undefined}>
              {state?.fileName ?? (actions ? 'Save this recording to use it again.' : 'Open a VelaClicker or Vela recording (.json).')}
            </p>
          </div>
          <div className="macro-actions">
            <button className="btn" type="button" disabled={!canEdit} onClick={() => void run('load')}>
              <FolderOpen aria-hidden="true" /> Open
            </button>
            <button className="btn" type="button" disabled={!canEdit || !actions} onClick={() => void run('save')}>
              <Save aria-hidden="true" /> Save
            </button>
            <button className="btn ghost" type="button" disabled={!canEdit || !actions} onClick={() => void run('clear')}>
              <Trash2 aria-hidden="true" /> Clear
            </button>
          </div>
        </section>
      </div>

      <div className="macro-shortcuts" aria-label="Global stop shortcuts">
        <Keyboard size={16} aria-hidden="true" />
        <span><kbd>F9</kbd> Stop recording</span>
        <span><kbd>F10</kbd> Cancel or stop playback</span>
      </div>
      {message ? <p className="macro-feedback macro-error" role="alert">{message}</p>
        : state?.notice ? <p className="macro-feedback" role="status">{state.notice}</p>
        : <p className="macro-feedback">{!macro || (state && !supported)
          ? 'Open Macro Recorder in the Vela desktop app for Windows.'
          : 'Recordings can contain typed text. Stop recording before entering sensitive information.'}</p>}
    </main>
  );
}
