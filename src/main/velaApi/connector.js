/**
 * Vela API connector — port of D:/ai-and-code/Vela/pc-app/src/auth-connector.ts
 * to main-process JS. Verifies/stores/uses the 90-day connection token.
 */

class AuthExpiredError extends Error {
  constructor(message = 'Connection token is no longer valid. Reconnect via the Vela web app.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

class VelaApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'VelaApiError';
    this.status = status;
  }
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = decodeURIComponent(
      atob(part.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

class VelaConnector {
  constructor({ baseUrl, store, onAuthExpired }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.store = store;
    this.onAuthExpired = onAuthExpired;
    this.cachedToken = null;
  }

  setBaseUrl(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async connect(token) {
    const trimmed = token.trim();
    if (!trimmed) throw new AuthExpiredError('No token provided.');
    const prevToken = this.cachedToken;
    this.cachedToken = trimmed;
    try {
      const identity = await this.whoami();
      await this.store.set(trimmed);
      return identity;
    } catch (e) {
      // Keep any previously stored token on transient failures; only a
      // rejected token is not persisted (never stored in the first place).
      this.cachedToken = e instanceof AuthExpiredError ? null : prevToken;
      throw e;
    }
  }

  async restore() {
    const token = await this.store.get();
    if (!token) return null;
    this.cachedToken = token;
    try {
      return await this.whoami();
    } catch (e) {
      if (e instanceof AuthExpiredError) {
        await this.store.clear();
        this.cachedToken = null;
      }
      throw e;
    }
  }

  whoami() {
    return this.apiFetch('/api/pc-app-token?action=me');
  }

  async disconnect() {
    const tokenId = await this.decodeTokenId();
    try {
      if (tokenId) {
        await this.apiFetch(`/api/pc-app-token?id=${encodeURIComponent(tokenId)}`, { method: 'DELETE' });
      }
    } catch {
      // Revocation is best-effort — the token can also be revoked from the web.
    } finally {
      this.cachedToken = null;
      await this.store.clear();
    }
  }

  async expiresAt() {
    const token = this.cachedToken ?? (await this.store.get());
    const exp = token ? decodeJwtPayload(token)?.exp : undefined;
    return exp ? new Date(exp * 1000) : null;
  }

  async daysRemaining() {
    const expires = await this.expiresAt();
    if (!expires) return null;
    return Math.floor((expires.getTime() - Date.now()) / 86_400_000);
  }

  async apiFetch(path, init = {}) {
    const token = this.cachedToken ?? (await this.store.get());
    if (!token) throw new AuthExpiredError();

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401) {
      this.cachedToken = null;
      await this.store.clear();
      this.onAuthExpired?.();
      throw new AuthExpiredError();
    }

    const text = await res.text();
    if (/^\s*</.test(text)) {
      // HTML body where JSON was expected: the deployed site is missing the
      // /api/pc-app-token function (SPA fallback) — surface that clearly.
      throw new VelaApiError(
        res.status,
        `The Vela site at ${this.baseUrl} hasn't been updated — this endpoint is not deployed yet.`,
      );
    }
    const body = text.trim() ? safeParse(text) : null;
    if (!res.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : `Request failed (${res.status})`;
      throw new VelaApiError(res.status, message);
    }
    return body;
  }

  async decodeTokenId() {
    const token = this.cachedToken ?? (await this.store.get());
    const payload = token ? decodeJwtPayload(token) : null;
    return payload && typeof payload.token_id === 'string' ? payload.token_id : null;
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

module.exports = { VelaConnector, AuthExpiredError, VelaApiError };
