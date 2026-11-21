const { WebContentsView, shell } = require('electron');
const path = require('path');

let win;
let send;
let workspace;
let activeId;
const views = new Map();

function attach(browserWindow, sender) {
  win = browserWindow;
  send = sender;
  workspace = null;
  win.webContents.on('before-input-event', focusWorkspace);
  win.on('close', () => {
    for (const id of views.keys()) discard(id);
  });
}

function layout() {
  const view = getView();
  if (!view || !win || win.isDestroyed()) return;
  const size = win.getContentBounds();
  const { x, y } = workspace || { x: 64, y: 52 };
  view.setBounds({ x, y, width: Math.max(0, size.width - x), height: Math.max(0, size.height - y) });
}

function setWorkspace(bounds) {
  if (!Number.isInteger(bounds?.x) || !Number.isInteger(bounds?.y) || bounds.x < 0 || bounds.y < 0) return;
  workspace = bounds;
  layout();
}

function focusWorkspace(event, input) {
  if (input.type !== 'keyDown' || input.key !== 'F6' || !getView()) return;
  event.preventDefault();
  getView().webContents.focus();
}

function discard(id) {
  const entry = views.get(id);
  if (!entry) return;
  views.delete(id);
  if (activeId === id) activeId = null;
  win.contentView.removeChildView(entry.view);
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
}

function deactivate() {
  const previous = activeId;
  getView()?.setVisible(false);
  activeId = null;
  if (previous === 'connect') discard(previous);
}

function openLocal(id, url) {
  if (id !== activeId) deactivate();
  activeId = id;
  let entry = views.get(id);
  send('service:state', { type: 'opened', id, loading: !entry?.ready });

  if (!entry) {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      },
    });
    entry = { view, ready: false };
    views.set(id, entry);
    view.setVisible(false);
    win.contentView.addChildView(view);
    const wc = view.webContents;
    wc.on('will-navigate', (event, target) => {
      if ((event.url || target)?.split('#')[0] !== url.split('#')[0]) event.preventDefault();
    });
    wc.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
      return { action: 'deny' };
    });
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'F6' || activeId !== id) return;
      event.preventDefault();
      win.webContents.focus();
      send('service:state', { type: 'focus-navigation' });
    });
    wc.once('did-finish-load', () => {
      entry.ready = true;
      if (activeId !== id) return;
      view.setVisible(true);
      send('service:state', { type: 'loaded', id });
    });
    const fail = (message) => {
      if (views.get(id) !== entry) return;
      const visible = activeId === id;
      discard(id);
      if (visible) send('service:state', { type: 'failed', id, message });
    };
    wc.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (code !== -3 && mainFrame) fail(`Couldn't open this workspace (${description}).`);
    });
    wc.on('render-process-gone', () => fail('This workspace closed unexpectedly.'));
    void wc.loadURL(url).catch((error) => fail(error.message));
  }

  layout();
  entry.view.setVisible(entry.ready);
}

function showShell(destination = 'home') {
  deactivate();
  send('service:state', { type: 'shell', destination });
}

function getView(id = activeId) {
  return views.get(id)?.view || null;
}

function notifyViews(channel, payload) {
  for (const { view } of views.values()) {
    const contents = view.webContents;
    if (contents && !contents.isDestroyed()) contents.send(channel, payload);
  }
}

function getViewId() {
  return activeId;
}

module.exports = { attach, layout, setWorkspace, openLocal, showShell, discard, getView, getViewId, notifyViews };
