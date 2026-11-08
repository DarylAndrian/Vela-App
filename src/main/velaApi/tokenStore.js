const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const TOKEN_FILE = () => path.join(app.getPath('userData'), 'token.bin');

class SafeTokenStore {
  async get() {
    try {
      const enc = fs.readFileSync(TOKEN_FILE());
      return safeStorage.decryptString(enc);
    } catch {
      return null;
    }
  }
  async set(token) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS encryption (safeStorage) is not available — refusing to store the token.');
    }
    fs.mkdirSync(path.dirname(TOKEN_FILE()), { recursive: true });
    fs.writeFileSync(TOKEN_FILE(), safeStorage.encryptString(token));
  }
  async clear() {
    try {
      fs.unlinkSync(TOKEN_FILE());
    } catch { /* already gone */ }
  }
}

module.exports = { SafeTokenStore };
