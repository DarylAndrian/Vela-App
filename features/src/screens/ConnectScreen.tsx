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
    }).catch(() => {
      setError('Could not check your connection.');
      setState('disconnected');
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
    try {
      const s = await vela().connect(token.trim());
      if (s.connected) {
        setStatus(s);
        setState('connected');
        setToken('');
        setNotice(null);
      } else {
        setError(s.error || 'Connection failed.');
      }
    } catch {
      setError('Could not connect to Vela.');
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await vela().disconnect();
      setStatus(null);
      setState('disconnected');
      setNotice('Disconnected. The token was revoked.');
    } catch {
      setError('Could not disconnect from Vela.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page desktop-workspace account-workspace" aria-label="Vela account">
      <section className="card-panel account-panel">
        {state === 'loading' && <p role="status">Checking connection…</p>}
        {notice && <p className="account-message" role="status">{notice}</p>}
        {error && <p className="account-message" role="alert">{error}</p>}

        {state === 'disconnected' && (
          <form onSubmit={(event) => { event.preventDefault(); if (token.trim() && !busy) void onConnect(); }}>
            <h2>Connect your account</h2>
            <p className="workspace-hint">In Vela on the web, open the user menu and choose Connect PC App to generate a token.</p>
            <div className="field">
              <label htmlFor="connectionToken">Connection token</label>
              <textarea id="connectionToken" rows={3} value={token}
                onChange={(event) => setToken(event.target.value)} spellCheck={false} />
            </div>
            <div className="workspace-toolbar">
              <button className="btn primary" type="submit" disabled={busy || !token.trim()}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
              <button className="btn" type="button" onClick={() => void vela().openSite()}>Get a token in Vela</button>
            </div>
          </form>
        )}

        {state === 'connected' && status?.identity && (
          <>
            <h2>{status.identity.username}</h2>
            <p className="workspace-hint">Connected{status.daysRemaining !== null ? ` · token expires in ${status.daysRemaining} days` : ''}</p>
            <div className="workspace-toolbar">
              <button className="btn primary" type="button"
                onClick={() => (window as any).launcher.openService('chart-code')}>Open Chart Code</button>
              <button className="btn danger" type="button" disabled={busy}
                onClick={() => void onDisconnect()}>Disconnect</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
