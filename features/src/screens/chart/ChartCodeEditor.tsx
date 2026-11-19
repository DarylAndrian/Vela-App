import { RevealOutput } from '../../components/RevealOutput';
import { useEffect, useMemo, useRef, useState } from 'react';
import { organizeMermaid } from '../../lib/mermaidOrganizer';
import { serializeNodeStyle, type NodeStyle } from '../../lib/chartCodeStyles';
import type { ChartChanges, ChartCode, Product } from '../../lib/ipc';
import { MermaidViewer } from './MermaidViewer';
import { copyPngToClipboard, exportRaster, exportSvg } from './export';
import { Spinner } from './Spinner';

export function ChartCodeEditor({ chart, products, saving, onSave, onBack, isDark }: {
  chart: ChartCode;
  products: Product[];
  saving: boolean;
  onSave: (changes: ChartChanges) => void;
  onBack: () => void;
  isDark: boolean;
}) {
  const [title, setTitle] = useState(chart.title);
  const [code, setCode] = useState(chart.mmd_code);
  const [productId, setProductId] = useState(chart.product_id ?? '');
  // Only send product fields once the user picks one, so legacy name-only links survive a save.
  const [productTouched, setProductTouched] = useState(false);
  const [layout, setLayout] = useState<'elk' | 'dagre'>('elk');
  const [renderKey, setRenderKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copying, setCopying] = useState(false);
  const savingRef = useRef(saving);

  const submit = () => {
    const changes: ChartChanges = { title, mmd_code: code };
    if (productTouched) {
      changes.product_id = productId || null;
      changes.product_name = products.find((p) => p.id === productId)?.name ?? null;
    }
    onSave(changes);
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (productTouched || productId || !chart.product_name) return;
    const match = products.find((p) => p.name === chart.product_name);
    if (match) setProductId(match.id);
  }, [products, chart.product_name, productId, productTouched]);

  useEffect(() => {
    if (savingRef.current && !saving) setDirty(false);
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const gutterLines = useMemo(() => code.split('\n').length, [code]);

  const onStyleChange = (nodeId: string, style: NodeStyle) => {
    const styleStr = serializeNodeStyle(style);
    const lines = code.split('\n');
    const styleLinePrefix = `  style ${nodeId} `;
    const existingIndex = lines.findIndex((l) => l.trim().startsWith(`style ${nodeId} `));
    if (existingIndex !== -1) {
      if (styleStr) lines[existingIndex] = `${styleLinePrefix}${styleStr}`;
      else lines.splice(existingIndex, 1);
    } else if (styleStr) {
      lines.push(`${styleLinePrefix}${styleStr}`);
    }
    setCode(lines.join('\n'));
    setDirty(true);
    setRenderKey((k) => k + 1);
  };

  const doOrganize = () => {
    try {
      const organized = code.includes('graph ') || code.includes('flowchart')
        ? organizeMermaid(code)
        : `graph TD\n${code}`;
      setCode(organized);
      setDirty(true);
      setRenderKey((k) => k + 1);
      say('Code organized.');
    } catch {
      setError('Could not organize this code — check the syntax.');
    }
  };

  const doExport = async (format: 'png' | 'jpeg' | 'svg') => {
    if (exporting) return;
    setShowExport(false);
    setExporting(true);
    try {
      const saved = format === 'svg'
        ? await exportSvg(isDark, title, chart.id)
        : await exportRaster(format, isDark, title, chart.id);
      setSavedPath(saved);
    } catch (e) {
      if (e instanceof Error && e.message === 'SAVE_CANCELLED') return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const doCopy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      await copyPngToClipboard(isDark);
      say('Image copied to clipboard.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCopying(false);
    }
  };

  return (
    <div>
      <div className="card-panel" style={{ padding: '13px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 11, marginBottom: 13 }}>
        <button className="btn" type="button" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Back to library
        </button>
        <input
          aria-label="Chart title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          style={{
            flex: 1, minWidth: 180, height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid transparent',
            background: 'transparent', color: 'var(--text)', padding: '0 10px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
        />
        <select
          title="Product"
          value={productId}
          onChange={(e) => { setProductId(e.target.value); setProductTouched(true); setDirty(true); }}
          style={{
            height: 34, maxWidth: 180, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: productId ? 'var(--text)' : 'var(--text-3)',
            padding: '0 10px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
          }}
        >
          <option value="">No product</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className={`badge ${saving ? 'blue' : dirty ? 'amber' : 'gray'}`}>
          {saving && <Spinner size={10} />}
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button className="btn" onClick={doOrganize} title="Rewrite the code into a clean structure">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h12M3 18h18" /><path d="M17 10l4 4-4 4" /></svg>
          Organize
        </button>
        <button className="btn" disabled={copying} onClick={() => void doCopy()} title="Copy the chart as a PNG image">
          {copying ? <Spinner size={14} /> : (
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
          )}
          {copying ? 'Copying…' : 'Copy'}
        </button>
        <div style={{ position: 'relative' }}>
          <button className="btn" disabled={exporting} onClick={() => setShowExport((v) => !v)}>
            {exporting ? <Spinner size={14} /> : (
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
            )}
            {exporting ? 'Exporting…' : 'Export'}
            {!exporting && <svg viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path d="M6 9l6 6 6-6" /></svg>}
          </button>
          {showExport && !exporting && (
            <div className="card-panel" style={{ position: 'absolute', right: 0, top: 42, zIndex: 30, padding: 6, width: 130 }}>
              {(['png', 'jpeg', 'svg'] as const).map((f) => (
                <button key={f} type="button" className="chart-format"
                  onClick={() => void doExport(f)}
                  style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {f === 'jpeg' ? 'JPEG' : f.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn primary" disabled={saving} onClick={submit}>
          {saving ? <Spinner size={14} /> : (
            <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
          )}
          {saving ? 'Saving…' : <>Save <span style={{ opacity: .7, fontWeight: 500 }}>Ctrl+S</span></>}
        </button>
      </div>

      {savedPath && <p className="workspace-result chart-export-result" role="status">
        Chart saved. <RevealOutput path={savedPath} />
      </p>}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 12,
          color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--red) 32%, transparent)',
        }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(285px, 42%) minmax(0, 1fr)', gap: 13, height: 'calc(100vh - 250px)', minHeight: 360 }}>
        <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '9px 15px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, letterSpacing: '.7px', color: 'var(--text-3)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Mermaid source
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>mmd</span>
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{
              width: 38, flex: 'none', padding: '13px 0', background: 'var(--surface-2)', borderRight: '1px solid var(--border)',
              fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.75, overflow: 'hidden',
            }}>
              {Array.from({ length: gutterLines }, (_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <textarea
              aria-label="Mermaid source"
              spellCheck={false}
              value={code}
              onChange={(e) => { setCode(e.target.value); setDirty(true); }}
              style={{
                flex: 1, border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: 'var(--text)',
                fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.75, padding: '13px 15px',
              }}
            />
          </div>
        </div>

        <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {code.trim() ? (
            <MermaidViewer
              source={code}
              layout={layout}
              renderKey={renderKey}
              onStyleChange={onStyleChange}
              onToggleLayout={() => { setLayout((l) => (l === 'elk' ? 'dagre' : 'elk')); setRenderKey((k) => k + 1); }}
            />
          ) : (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              Enter Mermaid code to see preview
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast visible">{toast}</div>}
    </div>
  );
}
