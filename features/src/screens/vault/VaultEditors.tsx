import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { generatePassword, type VaultAccount, type VaultField, type VaultProduct } from '../../lib/vault/crypto';

type ProductFields = Pick<VaultProduct, 'name' | 'url' | 'tags'>;
type AccountFields = Pick<VaultAccount, 'label' | 'fields'>;
export type VaultEdit =
  | { kind: 'product'; product?: VaultProduct }
  | { kind: 'account'; productId: string; account?: VaultAccount }
  | { kind: 'delete'; product: VaultProduct; account?: VaultAccount };
export type EditData = ProductFields | AccountFields | null;

export function VaultEditor({ edit, readOnly, close, save, refresh }: {
  edit: VaultEdit; readOnly: boolean; close: () => void; save: (data: EditData) => Promise<void>; refresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(edit.kind === 'product' ? edit.product?.name ?? '' : edit.kind === 'account' ? edit.account?.label ?? '' : '');
  const [url, setUrl] = useState(edit.kind === 'product' ? edit.product?.url ?? '' : '');
  const [tags, setTags] = useState(edit.kind === 'product' ? edit.product?.tags.join(', ') ?? '' : '');
  const [fields, setFields] = useState<VaultField[]>(() => edit.kind !== 'account' ? [] : edit.account?.fields ?? [
    { id: crypto.randomUUID(), label: 'Username', type: 'text', value: '' },
    { id: crypto.randomUUID(), label: 'Password', type: 'password', value: '' },
  ]);
  const title = edit.kind === 'product' ? edit.product ? 'Edit product' : 'Add product'
    : edit.kind === 'account' ? edit.account ? 'Edit account' : 'Add account' : `Delete ${edit.account ? 'account' : 'product'}`;
  useEffect(() => { dialog.current?.showModal(); }, []);

  function changeField(id: string, change: Partial<VaultField>) {
    setFields(current => current.map(field => field.id === id ? { ...field, ...change } : field));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (readOnly || saving || (edit.kind !== 'delete' && !name.trim())) return;
    setSaving(true);
    setError('');
    try {
      await save(edit.kind === 'product' ? { name: name.trim(), url: url.trim(), tags: [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))] }
        : edit.kind === 'account' ? { label: name.trim(), fields: fields.filter(field => field.label.trim() && field.value.length) } : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save Vault.'); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} aria-labelledby="vault-editor-title" className="vault-dialog" onCancel={event => { event.preventDefault(); if (!saving) close(); }}>
    <form onSubmit={submit}>
      <h2 className="section-title" id="vault-editor-title">{title}</h2>
      <fieldset disabled={readOnly || saving} className="vault-stack">
        {edit.kind === 'delete' ? <p>Remove {edit.account?.label ?? edit.product.name} from your Vault?</p> : <>
          <label>{edit.kind === 'product' ? 'Product name' : 'Account label'}<input value={name} onChange={event => setName(event.target.value)} autoComplete="off" required /></label>
          {edit.kind === 'product' ? <>
            <label>Website<input value={url} onChange={event => setUrl(event.target.value)} autoComplete="off" /></label>
            <label>Tags <span className="caption">(comma separated)</span><input value={tags} onChange={event => setTags(event.target.value)} autoComplete="off" /></label>
          </> : <>
            {fields.map((field, index) => <fieldset key={field.id} className="vault-field-editor">
              <legend>Field {index + 1}</legend>
              <label>Label<input value={field.label} onChange={event => changeField(field.id, { label: event.target.value })} autoComplete="off" /></label>
              <label>Type<select value={field.type} onChange={event => changeField(field.id, { type: event.target.value as VaultField['type'] })}>
                <option value="text">Text</option><option value="password">Password</option><option value="pin">PIN</option><option value="url">Website</option><option value="notes">Notes</option>
              </select></label>
              <label>Value{field.type === 'notes' ? <textarea value={field.value} onChange={event => changeField(field.id, { value: event.target.value })} />
                : <input type={['password', 'pin'].includes(field.type) ? 'password' : 'text'} value={field.value} autoComplete="off" onChange={event => changeField(field.id, { value: event.target.value })} />}</label>
              <div className="vault-actions">
                {field.type === 'password' && <button type="button" onClick={() => changeField(field.id, { value: generatePassword() })}>Generate password</button>}
                <button type="button" onClick={() => setFields(current => current.filter(item => item.id !== field.id))}>Remove field</button>
              </div>
            </fieldset>)}
            <button type="button" onClick={() => setFields(current => [...current, { id: crypto.randomUUID(), label: '', type: 'text', value: '' }])}>Add field</button>
          </>}
        </>}
      </fieldset>
      {readOnly && <div className="vault-actions"><p role="status">Reconnect to Vela to save this draft.</p><button type="button" onClick={refresh} disabled={saving}>Check connection</button></div>}
      {error && <p role="alert" className="vault-error">{error}</p>}
      <div className="vault-actions vault-dialog-footer">
        <button type="button" onClick={close} disabled={saving} autoFocus={edit.kind === 'delete'}>Cancel</button>
        <button className={edit.kind === 'delete' ? 'vault-danger' : 'vault-primary'} type="submit" disabled={readOnly || saving}>{saving ? 'Saving…' : edit.kind === 'delete' ? 'Delete' : 'Save'}</button>
      </div>
    </form>
  </dialog>;
}

export function VaultGroup({ label, children }: { label: string; children: ReactNode }) {
  return <details className="vault-group"><summary>{label}</summary>{children}</details>;
}
