import { useState } from 'react';
import type { ChartCode } from '../../lib/ipc';
import { Spinner } from './Spinner';

export function ChartCodeList({ charts, loading, creating, deleting, onOpen, onCreate, onDelete }: {
  charts: ChartCode[];
  loading: boolean;
  creating: boolean;
  deleting: boolean;
  onOpen: (chart: ChartCode) => void;
  onCreate: (title: string) => Promise<void>;
  onDelete: (chart: ChartCode) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [confirm, setConfirm] = useState<ChartCode | null>(null);

  const filtered = charts.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  const submitNew = () => {
    if (creating || !newTitle.trim()) return;
    void onCreate(newTitle.trim());
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 17 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: 'var(--text-3)', strokeWidth: 1.8, position: 'absolute', left: 12, top: 11 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            placeholder="Search charts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 12px 0 35px', fontSize: 12, fontFamily: 'var(--font)' }}
          />
        </div>
        <button className="btn primary" disabled={loading || creating} onClick={() => setShowNew(true)}>
          {creating ? <Spinner size={14} /> : <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>}
          {creating ? 'Creating…' : 'New chart'}
        </button>
      </div>

      {showNew && (
        <div className="card-panel" style={{ padding: 18, marginBottom: 15, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            autoFocus
            placeholder="Chart title"
            value={newTitle}
            disabled={creating}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
              if (e.key === 'Escape' && !creating) setShowNew(false);
            }}
            style={{ flex: 1, height: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', padding: '0 12px', fontSize: 12, fontFamily: 'var(--font)' }}
          />
          <button className="btn primary" disabled={creating || !newTitle.trim()} onClick={submitNew}>
            {creating && <Spinner size={13} />}
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button className="btn" disabled={creating} onClick={() => setShowNew(false)}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="card-panel" style={{ padding: '46px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13 }}>
          <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Spinner size={26} /></span>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>Loading your charts…</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Syncing with your Vela account</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.7 }}>
          {charts.length === 0 ? (
            <>No charts in your account yet.<br />Click <b style={{ color: 'var(--text-2)' }}>New chart</b> to create your first one.</>
          ) : (
            <>No charts match “{search}”.</>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 15 }}>
          {filtered.map((c) => (
            <div key={c.id} className="card" style={{ '--cat': 'var(--accent)' } as React.CSSProperties} onClick={() => onOpen(c)}>
              <div style={{
                height: 96, borderRadius: 'var(--radius-md)', marginBottom: 12, overflow: 'hidden',
                background: 'linear-gradient(135deg, var(--surface-2), color-mix(in srgb, var(--accent) 14%, transparent))',
                border: '1px solid var(--border)', display: 'grid', placeItems: 'center',
              }}>
                <svg viewBox="0 0 200 96" style={{ width: '100%', height: '100%' }}>
                  <rect x="24" y="20" width="52" height="18" rx="5" fill="var(--accent)" opacity=".8" />
                  <rect x="122" y="56" width="52" height="18" rx="5" fill="var(--accent)" opacity=".8" />
                  <rect x="80" y="38" width="42" height="18" rx="5" fill="none" stroke="var(--accent)" strokeWidth="1.4" opacity=".9" />
                  <path d="M76 29 C100 29 90 47 80 47" stroke="var(--accent)" strokeWidth="1.3" fill="none" opacity=".6" />
                  <path d="M122 47 C140 47 136 65 122 65" stroke="var(--accent)" strokeWidth="1.3" fill="none" opacity=".6" />
                </svg>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h2 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</h2>
                {c.protected ? (
                  <span className="badge gray" style={{ fontSize: 9.5, padding: '3px 8px' }}>Protected</span>
                ) : (
                  <svg viewBox="0 0 24 24"
                    style={{ width: 15, height: 15, fill: 'none', stroke: 'var(--text-3)', strokeWidth: 1.7, cursor: 'pointer', flex: 'none' }}
                    onClick={(e) => { e.stopPropagation(); if (!deleting) setConfirm(c); }}
                  ><title>Delete</title><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 5 }}>
                {new Date(c.updated_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(9,9,11,.55)', backdropFilter: 'blur(4px)',
          zIndex: 50, display: 'grid', placeItems: 'center',
        }}>
          <div className="card-panel" style={{ padding: 26, width: 'min(420px, calc(100vw - 40px))' }}>
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>Delete “{confirm.title}”?</h2>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 18 }}>
              This removes the chart from your account on all devices. It cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" disabled={deleting} onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn danger" disabled={deleting}
                onClick={() => { void onDelete(confirm).then(() => setConfirm(null)); }}>
                {deleting && <Spinner size={13} />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
