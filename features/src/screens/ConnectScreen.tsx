import { useEffect, useState } from 'react';
import { vela, type VelaStatus } from '../lib/ipc';

export function ConnectScreen() {
  const [state, setState] = useState<'loading' | 'disconnected' | 'connected'>('loading');
  const [status, setStatus] = useState<VelaStatus | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    vela().status().then((s) => {
      setStatus(s);
      setState(s.connected ? 'connected' : 'disconnected');
    });
    vela().onAuthExpired(() => {
      setState('disconnected');
      setStatus(null);
      setNotice('Your connection token is no longer valid — generate a new one on the Vela web app.');
    });
  }, []);

  async function onConnect() {
    setBusy(true);
    setError(null);
    const s = await vela().connect(token);
    setBusy(false);
    if (s.connected) {
      setStatus(s);
      setState('connected');
      setToken('');
      setNotice(null);
    } else {
      setError(s.error || 'Connection failed.');
    }
  }

  async function onDisconnect() {
    setBusy(true);
    await vela().disconnect();
    setBusy(false);
    setStatus(null);
    setState('disconnected');
    setNotice('Disconnected. The token was revoked.');
  }

  return (
    <div className="page">
      <p className="page-note">
        <b>Connect your Vela account.</b> The connection token is minted on the Vela web app (user menu → Connect PC
        App), valid for 90 days, and stored OS-encrypted on this PC. Picture Connector works without a connection.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18, alignItems: 'start' }}>
        <div className="card-panel" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>How to connect</h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
            Takes about a minute.
          </p>
          {[
            ['1', 'Open Vela in your browser', 'Sign in to the Vela site'],
            ['2', 'User menu → Connect PC App', 'Click “Generate connection token” and copy it'],
            ['3', 'Paste it here', 'Shown once on the web — keep it safe'],
          ].map(([n, title, sub]) => (
            <div key={n} style={{ display: 'flex', gap: 11, marginBottom: 13 }}>
              <div style={{
                width: 22, height: 22, flex: 'none', borderRadius: 7,
                background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
                color: 'var(--accent-text)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
              }}>{n}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>{sub}</div>
              </div>
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '17px 0' }} />
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => vela().openSite()}>
            Open Vela to get a token
          </button>
        </div>

        {state === 'loading' && (
          <div className="card-panel" style={{ padding: 26, color: 'var(--text-3)', fontSize: 12 }}>
            Checking connection…
          </div>
        )}

        {state === 'disconnected' && (
          <div className="card-panel" style={{ padding: 26 }}>
            <h2 style={{ fontSize: 18, marginBottom: 5 }}>Connect your Vela account</h2>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 19, maxWidth: 520 }}>
              Paste the connection token generated on the Vela web app to sync your Chart Code library.
            </p>
            {notice && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 15, fontSize: 12,
                color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--amber) 32%, transparent)',
              }}>{notice}</div>
            )}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 15, fontSize: 12,
                color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--red) 32%, transparent)',
              }}>{error}</div>
            )}
            <div className="field">
              <label>Connection token</label>
              <textarea
                placeholder="Paste your token here — it starts with eyJ…"
                style={{ minHeight: 96 }}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn primary" disabled={busy || !token.trim()} onClick={onConnect}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Verified against the Vela API before saving</span>
            </div>
          </div>
        )}

        {state === 'connected' && status?.identity && (
          <div className="card-panel" style={{ padding: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 18 }}>
              <div style={{
                width: 52, height: 52, flex: 'none', borderRadius: 15,
                background: 'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
                display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, color: 'var(--on-accent)',
              }}>{status.identity.username.slice(0, 1).toUpperCase()}</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <h2 style={{ fontSize: 18 }}>{status.identity.username}</h2>
                  <span className="badge green"><span className="dot" />Connected</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Role: {status.identity.role} · scope: products · synced with Vela web &amp; mobile
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 19 }}>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '13px 15px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700 }}>Token expires</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                  {status.daysRemaining !== null ? `In ${status.daysRemaining} days` : 'Unknown'}
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '13px 15px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '.6px', textTransform: 'uppercase', fontWeight: 700 }}>Vela site</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{status.baseUrl}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn primary" onClick={() => (window as any).launcher.openService('chart-code')}>
                Open Chart Code
              </button>
              <button className="btn danger" disabled={busy} onClick={onDisconnect}>Disconnect</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
