const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { app, BrowserWindow, clipboard, powerMonitor, safeStorage, session } = require('electron');
const features = require('../src/main/featuresProtocol');
const workspace = require('../src/main/velaApi/vaultWorkspace');
const views = require('../src/main/viewManager');
const config = require('../src/main/config');
const { encryptVault, decryptVault } = require('../features/src/lib/vault/crypto.ts');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-vault-smoke-'));
app.setPath('userData', root);
features.registerPrivileged();

async function startServer(handler, port = 0) {
  const server = http.createServer(handler);
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

const closeServer = server => new Promise(resolve => {
  server.close(resolve);
  server.closeAllConnections();
});

async function run() {
  let token;
  let snapshot = { kind: 'empty', revision: 0 };
  const writes = [];
  const master = 'smoke-test-only master password';
  let conflict = false;
  const identity = { sub: 'vault-smoke', username: 'Vault Smoke', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  let server = await startServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return; }
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      writes.push(body);
      const value = JSON.parse(body);
      if (conflict && snapshot.kind === 'ready') {
        conflict = false;
        const date = new Date().toISOString();
        const remote = [{ id: 'remote', name: 'Concurrent web edit', url: '', tags: [], accounts: [], createdAt: date, updatedAt: date }];
        snapshot = { kind: 'ready', revision: snapshot.revision + 1, vault: await encryptVault(remote, master, snapshot.vault.salt) };
      }
      if (snapshot.revision !== value.revision) { res.writeHead(409).end('{}'); return; }
      snapshot = { kind: 'ready', revision: value.revision + 1, vault: value.vault };
    }
    res.end(JSON.stringify({ identity, snapshot }));
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  token = `vela-vault.${Buffer.from(origin).toString('base64url')}.${'a'.repeat(43)}`;
  config.save({ velaBaseUrl: origin });

  features.serve(session.fromPartition('vela-vault').protocol, true);
  workspace.register();
  const window = new BrowserWindow({ show: false, width: 1100, height: 700, webPreferences: {
    preload: path.join(__dirname, '..', 'src', 'preload', 'vault.js'),
  } });
  views.attach(window, () => {}, id => { if (id === 'vault') workspace.clearClipboard(); });

  async function open() {
    views.openLocal('vault', workspace.URL);
    const contents = views.getView('vault').webContents;
    await once(contents, 'did-finish-load');
    return contents;
  }
  const automate = (contents, body) => contents.executeJavaScript(`(async () => {
    const wait = async (callback) => {
      for (let i = 0; i < 200; i++) { const result = callback(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 25)); }
      throw new Error('Vault screen timed out: ' + document.body.innerText.slice(0, 600));
    };
    const button = text => [...document.querySelectorAll('button')].find(item => item.textContent === text && !item.disabled);
    const click = async text => (await wait(() => button(text))).click();
    const fill = async (label, value) => {
      const input = await wait(() => [...document.querySelectorAll('label')].find(item => item.firstChild?.textContent === label)?.querySelector('input'));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    ${body}
  })()`);

  const userClipboard = await clipboard.readText();
  try {
    await window.loadURL('about:blank');
    assert.equal((await window.webContents.executeJavaScript('window.vault.load()')).ok, false);
    let contents = await open();
    conflict = true;
    assert.equal(await automate(contents, `
      await fill('Vault connection token', ${JSON.stringify(token)});
      await click('Connect');
      await fill('Master password', ${JSON.stringify(master)});
      await fill('Confirm master password', ${JSON.stringify(master)});
      await click('Create Vault');
      await click('Add product');
      await fill('Product name', 'Smoke fixture product');
      await click('Save');
      await wait(() => document.querySelector('dialog [role="alert"]')?.textContent.includes('Review your draft'));
      const keptDraft = document.querySelector('dialog input').value === 'Smoke fixture product';
      await click('Save');
      await wait(() => !document.querySelector('dialog') && document.body.innerText.includes('Smoke fixture product'));
      return keptDraft && window.launcher === undefined && window.vela === undefined && window.require === undefined;
    `), true);
    assert.equal(snapshot.revision, 3);
    assert.equal(writes.length, 3);
    assert.deepEqual((await decryptVault(snapshot.vault, master)).map(product => product.name), ['Concurrent web edit', 'Smoke fixture product']);
    for (const write of writes) assert.doesNotMatch(write, /Smoke fixture product|smoke-test-only master password/);
    const bytes = fs.readFileSync(path.join(root, 'vault-session.bin'));
    assert.equal(bytes.includes(Buffer.from(token)), false);
    const stored = JSON.parse(safeStorage.decryptString(bytes));
    assert.equal(stored.cache.snapshot.revision, 3);
    assert.doesNotMatch(JSON.stringify(stored), /Smoke fixture product|smoke-test-only master password/);

    // Vault clears its copied secret, but leaves anything the user copied since.
    const secret = `vault-smoke-secret-${Date.now()}`;
    const copy = value => contents.executeJavaScript(`window.vault.copy(${JSON.stringify(value)})`);
    assert.equal((await copy(secret)).ok, true);
    assert.equal(await clipboard.readText(), secret);
    assert.equal((await contents.executeJavaScript('window.vault.clearClipboard()')).ok, true);
    assert.equal(await clipboard.readText(), '');
    assert.equal((await copy(secret)).ok, true);
    await clipboard.writeText('copied by the user');
    await workspace.clearClipboard();
    assert.equal(await clipboard.readText(), 'copied by the user');
    assert.equal((await copy(secret)).ok, true);

    powerMonitor.emit('lock-screen');
    await automate(contents, `await wait(() => button('Unlock Vault'));`);
    await workspace.clearClipboard();
    assert.equal(await clipboard.readText(), '', 'Locking Vault leaves its copied secret on the clipboard.');
    const destroyed = once(contents, 'destroyed');
    views.showShell();
    await destroyed;
    await closeServer(server);
    contents = await open();
    assert.equal(await automate(contents, `
      await fill('Master password', ${JSON.stringify(master)});
      await click('Unlock Vault');
      await wait(() => document.body.innerText.includes('Smoke fixture product'));
      return document.body.innerText.includes('Offline · read only') && !button('Add product');
    `), true);

    server = await startServer((_req, res) => res.writeHead(401).end('{}'), port);
    await automate(contents, `await click('Check connection'); await wait(() => document.body.innerText.includes('Connect your Vault'));`);
    assert.equal(fs.existsSync(path.join(root, 'vault-session.bin')), false);
    views.showShell();
    window.destroy();
  } finally {
    if (server.listening) await closeServer(server);
    await clipboard.writeText(userClipboard).catch(() => {});
  }
}

app.whenReady().then(run).then(() => {
  console.log('Vault Electron smoke passed.');
  app.exit(0);
}, error => {
  console.error(error);
  app.exit(1);
});
