import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole, Search } from 'lucide-react';
import { createVaultKey, sealVault, unsealVault, type VaultField, type VaultKey, type VaultProduct } from '../../lib/vault/crypto';
import { unwrap, VaultFailure, type VaultConnection } from '../../lib/vault/bridge';
import { VaultEditor, VaultGroup, type EditData, type VaultEdit } from './VaultEditors';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Vault request failed. Try again.';

function updatedProducts(products: VaultProduct[], edit: VaultEdit, data: EditData) {
  const now = new Date().toISOString();
  if (edit.kind === 'product' && data && 'name' in data) {
    if (!edit.product) return [...products, { ...data, id: crypto.randomUUID(), accounts: [], createdAt: now, updatedAt: now }];
    if (!products.some(product => product.id === edit.product?.id)) throw new Error('This product was removed. Copy your draft before closing.');
    return products.map(product => product.id === edit.product?.id ? { ...product, ...data, updatedAt: now } : product);
  }
  if (edit.kind === 'delete') {
    if (!edit.account) return products.filter(product => product.id !== edit.product.id);
    return products.map(product => product.id === edit.product.id ? {
      ...product, updatedAt: now, accounts: product.accounts.filter(account => account.id !== edit.account?.id),
    } : product);
  }
  if (edit.kind !== 'account' || !data || !('label' in data)) throw new Error('Invalid Vault draft.');
  const product = products.find(item => item.id === edit.productId);
  if (!product || (edit.account && !product.accounts.some(account => account.id === edit.account?.id))) {
    throw new Error('The selected product or account was removed. Copy your draft before closing.');
  }
  const accounts = edit.account ? product.accounts.map(account => account.id === edit.account?.id ? { ...account, ...data, updatedAt: now } : account)
    : [...product.accounts, { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }];
  return products.map(item => item.id === product.id ? { ...item, accounts, updatedAt: now } : item);
}

export function VaultScreen() {
  const [connection, setConnection] = useState<VaultConnection | null>(null);
  const [products, setProducts] = useState<VaultProduct[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [query, setQuery] = useState('');
  const [selected, select] = useState<string | null>(null);
  const [edit, setEdit] = useState<VaultEdit | null>(null);
  const key = useRef<VaultKey | null>(null);
  const revision = useRef(0);
  const epoch = useRef(0);
  const operation = useRef(false);
  const editorOpen = useRef(false);

  function openEditor(value: VaultEdit | null) { editorOpen.current = !!value; setEdit(value); }

  const lock = useCallback(() => {
    epoch.current++;
    key.current = null;
    revision.current = 0;
    editorOpen.current = false;
    setProducts(null);
    setPassword('');
    setConfirmation('');
    setToken('');
    setQuery('');
    setEdit(null);
    setNotice('');
    select(null);
    void window.vault.clearClipboard();
  }, []);

  const applyConnection = useCallback(async (next: VaultConnection, attempt: number, reloadDraft = false) => {
    if (attempt !== epoch.current) return;
    setConnection(next);
    if (next.mode === 'unlinked') { lock(); if (next.message) setError(next.message); return; }
    const currentKey = key.current;
    if (!currentKey || (editorOpen.current && !reloadDraft)) return;
    const latest = next.snapshot;
    if (latest?.kind !== 'ready') { lock(); return; }
    if (latest.revision === revision.current) return;
    if (latest.vault.salt !== currentKey.salt) {
      lock(); setError('Vault encryption changed. Unlock the current Vault again.'); return;
    }
    const contents = await unsealVault(latest.vault, currentKey);
    if (attempt !== epoch.current) return;
    revision.current = latest.revision;
    setProducts(contents);
  }, [lock]);

  const refresh = useCallback(async () => {
    if (operation.current) return;
    const attempt = epoch.current;
    operation.current = true;
    try {
      const next = await unwrap(window.vault.load());
      if (attempt !== epoch.current) return;
      setError('');
      await applyConnection(next, attempt);
    } catch (reason) {
      if (attempt !== epoch.current) return;
      // Keep an in-memory editor draft on transient service errors. Refresh before editing again.
      setError(errorText(reason));
    } finally { operation.current = false; }
  }, [applyConnection]);

  useEffect(() => {
    void refresh();
    const revalidate = () => { void refresh(); };
    const timer = setInterval(revalidate, 30_000);
    window.addEventListener('online', revalidate);
    window.addEventListener('offline', revalidate);
    window.addEventListener('focus', revalidate);
    const stopLock = window.vault.onLock(lock);
    const stopInvalidated = window.vault.onInvalidated(reason => {
      lock();
      setConnection({ mode: 'unlinked' });
      setError(reason || '');
    });
    return () => {
      epoch.current++;
      clearInterval(timer);
      stopLock(); stopInvalidated();
      window.removeEventListener('online', revalidate);
      window.removeEventListener('offline', revalidate);
      window.removeEventListener('focus', revalidate);
    };
  }, [lock, refresh]);

  const unlocked = products !== null;
  useEffect(() => {
    if (!unlocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(lock, 5 * 60_000); };
    const events = ['keydown', 'pointerdown', 'scroll'] as const;
    reset();
    events.forEach(event => window.addEventListener(event, reset, true));
    return () => { clearTimeout(timer); events.forEach(event => window.removeEventListener(event, reset, true)); };
  }, [unlocked, lock]);

  const current = connection && connection.mode !== 'unlinked' ? connection.snapshot : null;
  const creating = connection?.mode === 'online' && current?.kind === 'empty';
  const canEdit = connection?.mode === 'online' && !error;

  async function task(action: () => Promise<void>) {
    if (operation.current) return;
    const attempt = epoch.current;
    operation.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (reason) { if (attempt === epoch.current) setError(errorText(reason)); }
    finally { operation.current = false; setBusy(false); }
  }

  function connect(event: FormEvent) {
    event.preventDefault();
    const attempt = epoch.current;
    void task(async () => {
      try { await applyConnection(await unwrap(window.vault.connect(token)), attempt); }
      finally { setToken(''); }
    });
  }

  function unlock(event: FormEvent) {
    event.preventDefault();
    if (creating && password !== confirmation) { setError('The master passwords must match.'); return; }
    const attempt = epoch.current;
    void task(async () => {
      try {
        const next = await unwrap(window.vault.load());
        if (attempt !== epoch.current) return;
        await applyConnection(next, attempt);
        if (next.mode === 'unlinked' || attempt !== epoch.current) return;
        const latest = next.snapshot;
        if (!latest || latest.kind === 'legacy') throw new Error('Open Vela web to recover or sync this Vault.');
        if (latest.kind === 'empty' && (!creating || next.mode !== 'online')) throw new Error('Connect to Vela and confirm a master password to create a Vault.');
        const nextKey = await createVaultKey(password, latest.kind === 'ready' ? latest.vault.salt : undefined);
        let contents: VaultProduct[] = [];
        let currentRevision = latest.revision;
        if (latest.kind === 'ready') {
          try { contents = await unsealVault(latest.vault, nextKey); }
          catch { throw new Error('Could not unlock. Check the master password and try again.'); }
        } else {
          const vault = await sealVault([], nextKey);
          if (attempt !== epoch.current) return;
          const saved = await unwrap(window.vault.save(0, vault));
          if (attempt !== epoch.current || saved.mode !== 'online') return;
          setConnection(saved);
          currentRevision = saved.snapshot.revision;
        }
        if (attempt !== epoch.current) return;
        key.current = nextKey;
        revision.current = currentRevision;
        setProducts(contents);
      } finally { setPassword(''); setConfirmation(''); }
    });
  }

  function disconnect() {
    void task(async () => {
      const result = await unwrap(window.vault.disconnect());
      if (!result.revoked) setNotice('Disconnected on this PC. Revoke the token in Vela web to end its server access.');
    });
  }

  async function save(data: EditData) {
    if (!products || !edit || !key.current || !canEdit || operation.current) throw new Error('Vault is busy or offline. Try again.');
    const attempt = epoch.current;
    operation.current = true;
    try {
      const contents = updatedProducts(products, edit, data);
      const encrypted = await sealVault(contents, key.current);
      if (attempt !== epoch.current) return;
      const saved = await unwrap(window.vault.save(revision.current, encrypted));
      if (attempt !== epoch.current || saved.mode !== 'online') return;
      revision.current = saved.snapshot.revision;
      setConnection(saved);
      setProducts(contents);
      openEditor(null);
    } catch (reason) {
      if (attempt !== epoch.current) return;
      if (reason instanceof VaultFailure && (reason.status === 409 || reason.status === 0)) {
        await applyConnection(await unwrap(window.vault.load()), attempt, reason.status === 409);
        if (reason.status === 409) throw new Error('Vault changed elsewhere. The current version is loaded. Review your draft and save again to apply it.');
      }
      throw reason;
    } finally { operation.current = false; }
  }

  function openWeb() { void unwrap(window.vault.openWeb()).catch(reason => setError(errorText(reason))); }

  const matching = products?.filter(product => {
    const term = query.trim().toLowerCase();
    return !term || [product.name, product.url, ...product.tags, ...product.accounts.flatMap(account => [account.label, ...account.fields.map(field => field.label)])]
      .some(value => value.toLowerCase().includes(term));
  }) ?? [];
  const product = matching.find(item => item.id === selected) ?? matching[0];

  return <main className="vault-page">
    <header className="vault-heading">
      <div><h1 className="page-title"><LockKeyhole size={22} aria-hidden="true" /> Vault</h1>
        {connection && connection.mode !== 'unlinked' && <p className="caption">{connection.identity.username} · {connection.mode === 'offline' ? 'Offline · read only' : error && unlocked ? 'Sync needs attention' : 'Connected to Vela'}</p>}</div>
      <div className="vault-actions">
        {unlocked && <button type="button" onClick={lock}>Lock Vault</button>}
        {connection && connection.mode !== 'unlinked' && <button type="button" onClick={disconnect} disabled={busy}>Disconnect</button>}
      </div>
    </header>

    {error && <p role="alert" className="vault-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {connection?.mode === 'offline' && connection.syncedAt && <p className="caption">Last synced {new Date(connection.syncedAt).toLocaleString()}</p>}
    {!connection && <section className="vault-panel vault-access">{error ? <button type="button" onClick={() => void refresh()}>Retry</button> : <p role="status">Checking Vault…</p>}</section>}
    {connection?.mode === 'unlinked' && <section className="vault-panel vault-access vault-stack">
      <h2 className="section-title">Connect your Vault</h2>
      <p>Open Private → Vault in Vela web, choose Connect desktop, then paste the connection token here.</p>
      <form className="vault-stack" onSubmit={connect}>
        <label>Vault connection token<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} disabled={busy} required /></label>
        <div className="vault-actions"><button className="vault-primary" type="submit" disabled={busy || !token.trim()}>{busy ? 'Connecting…' : 'Connect'}</button><button type="button" onClick={openWeb}>Open Vela web</button></div>
      </form>
    </section>}
    {connection && connection.mode !== 'unlinked' && !unlocked && <section className="vault-panel vault-access vault-stack">
      {current?.kind === 'legacy' ? <><p>This Vault needs recovery in the browser that holds its matching encrypted copy.</p><button type="button" onClick={openWeb}>Open Vela web</button></>
        : !current ? <><p>Connect to Vela to download your Vault before using it offline.</p><button type="button" onClick={() => void refresh()}>Retry</button></>
        : <form className="vault-stack" onSubmit={unlock}>
          <h2 className="section-title">{creating ? 'Create your Vault' : 'Unlock your Vault'}</h2>
          {creating && <p>Choose a strong, unique master password. Losing it means losing access to your Vault.</p>}
          <label>Master password<input type="password" autoComplete={creating ? 'new-password' : 'off'} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></label>
          {creating && <label>Confirm master password<input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy} /></label>}
          <button className="vault-primary" type="submit" disabled={busy}>{creating ? 'Create Vault' : 'Unlock Vault'}</button>
        </form>}
    </section>}

    {unlocked && <div className="vault-layout">
      <section className="vault-panel vault-stack" aria-label="Vault products">
        <div className="vault-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search Vault" placeholder="Search Vault" value={query} onChange={event => setQuery(event.target.value)} /></div>
        {canEdit && <button className="vault-primary" type="button" onClick={() => openEditor({ kind: 'product' })}>Add product</button>}
        {(connection?.mode === 'offline' || error) && <button type="button" onClick={() => void refresh()}>Check connection</button>}
        {!matching.length && <p>{query ? 'No matching products.' : 'Your Vault is empty.'}</p>}
        {matching.map(item => <button type="button" key={item.id} className="vault-product" aria-pressed={item.id === product?.id} onClick={() => select(item.id)}>
          <strong>{item.name}</strong><span className="caption">{item.accounts.length} {item.accounts.length === 1 ? 'account' : 'accounts'}</span>
        </button>)}
      </section>
      {product && <section className="vault-panel vault-stack" key={product.id} aria-label="Selected product">
        <div className="vault-heading"><div><h2 className="section-title">{product.name}</h2>{product.url && <p className="caption vault-value">{product.url}</p>}</div>
          {canEdit && <div className="vault-actions"><button type="button" onClick={() => openEditor({ kind: 'product', product })}>Edit product</button><button type="button" onClick={() => openEditor({ kind: 'delete', product })}>Delete product</button></div>}
        </div>
        {product.tags.length > 0 && <p className="caption">{product.tags.join(' · ')}</p>}
        {product.accounts.map(account => <VaultGroup label={account.label} key={account.id}>
          {account.fields.map(field => <SecretField field={field} key={field.id} />)}
          {canEdit && <div className="vault-actions"><button type="button" onClick={() => openEditor({ kind: 'account', productId: product.id, account })}>Edit account</button><button type="button" onClick={() => openEditor({ kind: 'delete', product, account })}>Delete account</button></div>}
        </VaultGroup>)}
        {canEdit && <button type="button" onClick={() => openEditor({ kind: 'account', productId: product.id })}>Add account</button>}
      </section>}
    </div>}
    {edit && <VaultEditor edit={edit} readOnly={!canEdit} close={() => openEditor(null)} save={save} refresh={() => void refresh()} />}
  </main>;
}

function SecretField({ field }: { field: VaultField }) {
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState('');
  const masked = ['password', 'pin', 'notes'].includes(field.type);
  async function copy() {
    try { await unwrap(window.vault.copy(field.value)); setNotice('Copied'); }
    catch (reason) { setNotice(errorText(reason)); }
  }
  return <div className="vault-secret">
    <div><strong>{field.label}</strong><div className="vault-value">{!masked || visible ? field.value : '••••••••'}</div></div>
    <div className="vault-actions">
      {masked && <button type="button" aria-label={`${visible ? 'Hide' : 'Reveal'} ${field.label}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Reveal'}</button>}
      <button type="button" aria-label={`Copy ${field.label}`} onClick={() => void copy()}>Copy</button>
    </div>
    {notice && <p className="caption" role="status">{notice}</p>}
  </div>;
}
