const TOKEN_PATTERN = /^vela-vault\.([A-Za-z0-9_-]{1,350})\.[A-Za-z0-9_-]{43}$/;
const CONNECTION_ERRORS = new Set([
  'ENETDOWN', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET',
  'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
]);

function vaultOrigin(url, allowLoopback = false) {
  const parsed = new URL(url);
  const loopback = allowLoopback && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) || parsed.username || parsed.password) {
    throw new Error('Set an HTTPS Vela server in Settings before using Vault.');
  }
  return parsed.origin;
}

function envelope(value) {
  const { version, salt, entries, createdAt, updatedAt } = value ?? {};
  if (![1, 2].includes(version) || typeof salt !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(salt)
    || typeof entries !== 'string' || entries.length < 40 || entries.length > 4_000_000
    || entries.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(entries)
    || typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))
    || typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) return null;
  return { version, salt, entries, createdAt, updatedAt };
}

function snapshot(value) {
  if (value?.kind === 'empty' && value.revision === 0) return { kind: 'empty', revision: 0 };
  if (!Number.isSafeInteger(value?.revision) || value.revision < 1) throw new Error('Unexpected Vault response.');
  if (value.kind === 'legacy') return { kind: 'legacy', revision: value.revision };
  const vault = envelope(value.vault);
  if (value.kind !== 'ready' || !vault) throw new Error('Unexpected Vault response.');
  return { kind: 'ready', revision: value.revision, vault };
}

class VaultRequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

class VaultClient {
  constructor({ store, getOrigin, isOnline, onInvalidated, request = fetch, now = Date.now }) {
    Object.assign(this, { store, getOrigin, isOnline, onInvalidated, request, now });
    this.epoch = 0;
    this.pending = Promise.resolve();
    this.online = false;
    this.record = undefined;
  }

  run(operation) {
    const epoch = this.epoch;
    const result = this.pending.then(() => { this.assertCurrent(epoch); return operation(epoch); });
    this.pending = result.catch(() => {});
    return result;
  }

  assertCurrent(epoch) {
    if (epoch !== this.epoch) throw new Error('The Vault connection changed. Try again.');
  }

  invalidate(message) {
    this.epoch++;
    this.online = false;
    this.record = null;
    clearTimeout(this.expiryTimer);
    this.onInvalidated(message);
    this.store.clear();
  }

  put(record) {
    this.store.write(record);
    this.record = record;
    this.watchExpiry(record);
  }

  watchExpiry(record) {
    clearTimeout(this.expiryTimer);
    const untilExpiry = Date.parse(record.identity.expiresAt) - this.now();
    this.expiryTimer = setTimeout(() => {
      if (untilExpiry > 2_147_483_647) this.watchExpiry(record);
      else this.invalidate('Vault connection expired. Connect desktop again.');
    }, Math.max(0, Math.min(untilExpiry, 2_147_483_647)));
    this.expiryTimer.unref?.();
  }

  getRecord() {
    if (this.record === undefined) {
      this.record = this.store.read();
      if (this.record) this.watchExpiry(this.record);
    }
    if (this.record && (this.record.origin !== this.getOrigin() || Date.parse(this.record.identity.expiresAt) <= this.now())) {
      this.invalidate('Vault connection expired or the Vela server changed. Connect desktop again.');
    }
    return this.record;
  }

  async api(origin, token, { method = 'GET', body, suffix = '' } = {}) {
    if (!this.isOnline()) throw new VaultRequestError(0, 'Vault is offline.');
    let response;
    try {
      response = await this.request(`${origin}/api/vault${suffix}`, {
        method, body, redirect: 'manual', signal: AbortSignal.timeout(7000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch (reason) {
      if (reason.name === 'TimeoutError' || CONNECTION_ERRORS.has(reason.cause?.code) || !this.isOnline()) {
        throw new VaultRequestError(0, 'Vault is offline.');
      }
      throw new VaultRequestError(502, 'Could not verify the connection to Vela.');
    }
    if (!response.ok) {
      const messages = {
        401: 'Vault connection expired or was revoked.', 403: 'Vault access was denied.',
        404: 'This Vela server does not have the Windows Vault sync API.',
        405: 'This Vela server does not support Windows Vault sync yet.',
        409: 'Vault changed elsewhere. Reload and reapply your edit.',
        422: 'Open Vela web to recover this Vault.', 429: 'Too many Vault requests. Try again shortly.',
      };
      throw new VaultRequestError(response.status, messages[response.status] || 'Vault server is unavailable.');
    }
    return response.json().catch(() => { throw new Error('This Vela server does not have the Windows Vault sync API.'); });
  }

  confirmed(origin, token, result, previous) {
    const { sub, username, expiresAt } = result?.identity ?? {};
    if (typeof sub !== 'string' || !sub || typeof username !== 'string' || !username
      || typeof expiresAt !== 'string' || !(Date.parse(expiresAt) > this.now())) {
      throw new VaultRequestError(401, 'Vault connection expired or is invalid.');
    }
    if (previous && (previous.identity.sub !== sub || previous.identity.username !== username)) {
      throw new VaultRequestError(403, 'The Vault account changed. Connect desktop again.');
    }
    const current = snapshot(result.snapshot);
    const identity = { sub, username, expiresAt };
    const cache = current.kind === 'ready' ? { snapshot: current, syncedAt: new Date(this.now()).toISOString() } : null;
    this.put({ origin, token, identity, cache });
    this.online = true;
    return { mode: 'online', identity, snapshot: current };
  }

  connect(value) {
    return this.run(async epoch => {
      const origin = this.getOrigin();
      const token = typeof value === 'string' && value.length <= 420 ? value.trim() : '';
      const match = TOKEN_PATTERN.exec(token);
      if (!match || Buffer.from(match[1], 'base64url').toString() !== origin) {
        throw new Error('Paste a Vault token generated on the configured Vela server.');
      }
      const result = await this.api(origin, token);
      this.assertCurrent(epoch);
      return this.confirmed(origin, token, result);
    });
  }

  load() {
    return this.run(async epoch => {
      const record = this.getRecord();
      if (!record) return { mode: 'unlinked' };
      try {
        const result = await this.api(record.origin, record.token);
        this.assertCurrent(epoch);
        return this.confirmed(record.origin, record.token, result, record);
      } catch (error) {
        this.assertCurrent(epoch);
        this.online = false;
        if (error.status === 0) return { mode: 'offline', identity: record.identity, ...record.cache };
        if (error.status === 401 || error.status === 403) {
          this.invalidate(error.message);
          return { mode: 'unlinked', message: error.message };
        }
        throw error;
      }
    });
  }

  save(revision, value) {
    return this.run(async epoch => {
      const record = this.getRecord();
      if (!record || !this.online) throw new VaultRequestError(0, 'Reconnect to Vela before editing.');
      const vault = envelope(value);
      if (!Number.isSafeInteger(revision) || revision < 0 || !vault) throw new Error('Invalid encrypted Vault.');
      try {
        const result = await this.api(record.origin, record.token, { method: 'POST', body: JSON.stringify({ revision, vault }) });
        this.assertCurrent(epoch);
        return this.confirmed(record.origin, record.token, result, record);
      } catch (error) {
        this.assertCurrent(epoch);
        if (error.status === 401 || error.status === 403) this.invalidate(error.message);
        if (error.status !== 409) this.online = false;
        throw error;
      }
    });
  }

  async disconnect() {
    const record = this.getRecord();
    this.invalidate();
    if (!record) return { revoked: true };
    try {
      await this.api(record.origin, record.token, { method: 'DELETE', suffix: '?action=devices' });
      return { revoked: true };
    } catch (error) {
      return { revoked: error.status === 401 || error.status === 403 };
    }
  }
}

module.exports = { VaultClient, vaultOrigin };
