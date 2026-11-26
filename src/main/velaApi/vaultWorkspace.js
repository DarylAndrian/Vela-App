const { app, clipboard, ipcMain, net, powerMonitor, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const config = require('../config');
const viewManager = require('../viewManager');
const { VaultClient, vaultOrigin } = require('./vaultClient');

const URL = 'app://features/vault.html';
const file = () => path.join(app.getPath('userData'), 'vault-session.bin');
const origin = base => vaultOrigin(base, !app.isPackaged);
let clipboardTimer;
let copiedText;
let clipboardQueue = Promise.resolve();

// Electron 45 made clipboard reads and writes async. Run Vault's clipboard
// steps one at a time so a lock that fires during a copy still clears it.
function serial(task) {
  const result = clipboardQueue.then(task);
  clipboardQueue = result.catch(() => {});
  return result;
}

async function forgetCopiedText() {
  clearTimeout(clipboardTimer);
  const expected = copiedText;
  copiedText = undefined;
  if (expected === undefined) return;
  try { if (await clipboard.readText() === expected) clipboard.clear(); }
  catch { /* Clipboard access may be unavailable when Windows locks. */ }
}

const clearClipboard = () => serial(forgetCopiedText);

function copyText(text) {
  return serial(async () => {
    await forgetCopiedText();
    await clipboard.writeText(text);
    copiedText = text;
    clipboardTimer = setTimeout(clearClipboard, 30_000);
  });
}

function message(channel, value) {
  const contents = viewManager.getView('vault')?.webContents;
  if (contents && !contents.isDestroyed()) contents.send(channel, value);
}

function lock() {
  clearClipboard();
  message('vault:lock');
}

const store = {
  read() {
    try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(file()))); }
    catch (error) {
      if (error.code !== 'ENOENT') this.clear();
      return null;
    }
  },
  write(record) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows protected storage is unavailable.');
    const target = file();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(record)), { flag: 'wx' });
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, { force: true }); }
  },
  clear() { fs.rmSync(file(), { force: true }); },
};

const client = new VaultClient({
  store,
  getOrigin: () => origin(config.load().velaBaseUrl),
  isOnline: () => net.isOnline(),
  onInvalidated: reason => { lock(); message('vault:invalidated', reason); },
});

function register() {
  const handlers = {
    load: () => client.load(),
    connect: token => client.connect(token),
    save: (revision, vault) => client.save(revision, vault),
    disconnect: () => client.disconnect(),
    'open-web': () => shell.openExternal(`${origin(config.load().velaBaseUrl)}/private/vault`),
    theme: () => config.load().theme,
    copy: text => {
      if (typeof text !== 'string' || text.length > 3_000_000) throw new Error('This value is too large to copy.');
      return copyText(text);
    },
    'clear-clipboard': () => clearClipboard(),
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(`vault:${channel}`, async (event, ...args) => {
      const contents = viewManager.getView('vault')?.webContents;
      if (!contents || event.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame
        || event.senderFrame.url !== URL || viewManager.getViewId() !== 'vault') {
        return { ok: false, error: 'Vault workspace access required.' };
      }
      try { return { ok: true, data: await handler(...args) }; }
      catch (error) { return { ok: false, error: error.message, status: error.status }; }
    });
  }
  for (const event of ['lock-screen', 'unlock-screen', 'suspend', 'resume']) powerMonitor.on(event, lock);
  try { client.getRecord(); } catch { /* The workspace can report storage and configuration errors. */ }
}

function serverChanged(previous, next) {
  let same = previous === next;
  try { same = origin(previous) === origin(next); } catch { /* Clear when an invalid setting replaces the old server. */ }
  if (!same) client.invalidate('Vela server changed. Connect desktop again.');
}

function accountChanged(identity, reason) {
  if (reason === 'disconnect') { client.invalidate(); return; }
  let record;
  try { record = client.getRecord(); } catch { return; }
  if (!record) return;
  if (identity && (identity.sub !== record.identity.sub || identity.username !== record.identity.username)) {
    client.invalidate('Vela account changed. Connect desktop again.');
  }
}

module.exports = { register, serverChanged, accountChanged, clearClipboard, URL };
