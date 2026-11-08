const { WebContentsView, shell, session, app } = require('electron');
const path = require('path');
const fs = require('fs');

const TOOLBAR_HEIGHT = 70;

let win = null;
let send = () => {};
let view = null;
let currentId = null;

function uniqueDownloadPath(dir, filename) {
  const safeName = path.basename(filename);
  let candidate = path.join(dir, safeName);
  if (!fs.existsSync(candidate)) return candidate;
  const dot = safeName.lastIndexOf('.');
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot) : '';
  for (let i = 1; i < 1000; i += 1) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

function attach(browserWindow, sender) {
  win = browserWindow;
  send = sender;
  // Local tools download blobs/ZIPs via anchor clicks; save them straight to
  // Downloads (no dialog) to match the web app's click-to-download UX.
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSavePath(uniqueDownloadPath(app.getPath('downloads'), item.getFilename()));
  });
}

function layout() {
  if (!view || !win || win.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
}

function closeView() {
  if (!view) return;
  try {
    win.contentView.removeChildView(view);
    view.webContents.close();
  } catch {}
  view = null;
  currentId = null;
}

function fail(message) {
  const id = currentId;
  closeView();
  send('service:state', { type: 'failed', id, message });
}

function open(id, url, useVelaSession) {
  closeView();
  currentId = id;
  view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      ...(useVelaSession ? { partition: 'persist:vela' } : {}),
    },
  });
  win.contentView.addChildView(view);
  layout();

  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  wc.on('did-start-loading', () => send('service:state', { type: 'loading', id }));
  wc.on('did-finish-load', () => send('service:state', { type: 'loaded', id }));
  wc.on('did-fail-load', (_e, errorCode, errorDescription, _url, isMainFrame) => {
    if (errorCode === -3 || !isMainFrame) return;
    fail(`Couldn't load the page (${errorDescription}).`);
  });
  wc.on('render-process-gone', () => fail('The page crashed.'));

  send('service:state', { type: 'opened', id, url });
  wc.loadURL(url);
}

function openLocal(id, url) {
  closeView();
  currentId = id;
  view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    },
  });
  win.contentView.addChildView(view);
  layout();

  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  wc.on('did-start-loading', () => send('service:state', { type: 'loading', id }));
  wc.on('did-finish-load', () => send('service:state', { type: 'loaded', id }));
  wc.on('did-fail-load', (_e, errorCode, errorDescription, _url, isMainFrame) => {
    if (errorCode === -3 || !isMainFrame) return;
    fail(`Couldn't load the page (${errorDescription}).`);
  });
  wc.on('render-process-gone', () => fail('The page crashed.'));

  send('service:state', { type: 'opened', id, url: 'native' });
  wc.loadURL(url);
}

function navBack() {
  if (!view) return;
  const wc = view.webContents;
  if (wc.canGoBack()) wc.goBack();
  else goHome();
}

function goHome() {
  const wasOpen = !!view;
  closeView();
  if (wasOpen) send('service:state', { type: 'home' });
}

function isOpen() {
  return !!view;
}

function getView() {
  return view;
}

module.exports = { TOOLBAR_HEIGHT, attach, layout, open, openLocal, navBack, goHome, closeView, isOpen, getView };
