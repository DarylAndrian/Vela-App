import type { EncryptedVault, VaultSnapshot } from './crypto';

type Identity = { sub: string; username: string; expiresAt: string };
type Snapshot = Exclude<VaultSnapshot, { kind: 'legacy' }> | { kind: 'legacy'; revision: number };
export type VaultConnection =
  | { mode: 'unlinked'; message?: string }
  | { mode: 'online'; identity: Identity; snapshot: Snapshot }
  | { mode: 'offline'; identity: Identity; snapshot?: Extract<Snapshot, { kind: 'ready' }>; syncedAt?: string };

type Reply<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };
type Appearance = 'system' | 'light' | 'dark';

declare global {
  interface Window {
    vault: {
      load(): Promise<Reply<VaultConnection>>;
      connect(token: string): Promise<Reply<VaultConnection>>;
      save(revision: number, vault: EncryptedVault): Promise<Reply<VaultConnection>>;
      disconnect(): Promise<Reply<{ revoked: boolean }>>;
      copy(value: string): Promise<Reply<void>>;
      clearClipboard(): Promise<Reply<void>>;
      openWeb(): Promise<Reply<void>>;
      theme(): Promise<Reply<Appearance>>;
      onLock(listener: () => void): () => void;
      onInvalidated(listener: (reason?: string) => void): () => void;
      onTheme(listener: (theme: Appearance) => void): () => void;
    };
  }
}

export class VaultFailure extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export async function unwrap<T>(reply: Promise<Reply<T>>) {
  const result = await reply;
  if (!result.ok) throw new VaultFailure(result.error, result.status);
  return result.data;
}
