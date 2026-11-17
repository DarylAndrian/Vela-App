const { ipcMain, dialog, shell, clipboard, nativeImage, app } = require('electron');
const fs = require('fs');
const config = require('../config');
const viewManager = require('../viewManager');
const { SafeTokenStore } = require('./tokenStore');
const { VelaConnector, AuthExpiredError, VelaApiError } = require('./connector');
const { ChartCodesApi } = require('./chartCodes');

let connector = null;
let chartsApi = null;
let notify = () => {};

function getConnector() {
  if (!connector) {
    connector = new VelaConnector({
      baseUrl: config.load().velaBaseUrl,
      store: new SafeTokenStore(),
      onAuthExpired: () => notify('vela:auth-expired'),
    });
    chartsApi = new ChartCodesApi(connector);
  }
  return connector;
}

function syncBaseUrl() {
  if (connector) connector.setBaseUrl(config.load().velaBaseUrl);
}

async function status() {
  const c = getConnector();
  const baseUrl = c.baseUrl;
  const token = await c.store.get();
  if (!token) return { connected: false, identity: null, daysRemaining: null, baseUrl };
  try {
    const identity = await c.restore();
    return { connected: true, identity, daysRemaining: await c.daysRemaining(), baseUrl };
  } catch (err) {
    return { connected: false, identity: null, daysRemaining: null, baseUrl, error: err.message };
  }
}

function registerIpc({ notify: notifyFn }) {
  notify = notifyFn;

  ipcMain.handle('vela:status', () => status());

  ipcMain.handle('vela:connect', async (_e, token) => {
    try {
      const identity = await getConnector().connect(token);
      return { connected: true, identity, daysRemaining: await connector.daysRemaining(), baseUrl: connector.baseUrl };
    } catch (err) {
      return { connected: false, identity: null, daysRemaining: null, baseUrl: getConnector().baseUrl, error: err.message };
    }
  });

  ipcMain.handle('vela:disconnect', async () => {
    await getConnector().disconnect();
  });

  ipcMain.handle('vela:open-site', () => shell.openExternal(config.load().velaBaseUrl));

  ipcMain.handle('app:open-external', (_e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  const wrap = (fn) => async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message, authExpired: err instanceof AuthExpiredError, status: err instanceof VelaApiError ? err.status : undefined };
    }
  };

  ipcMain.handle('charts:list', wrap(() => chartsApiAfter().list()));
  ipcMain.handle('charts:get', wrap((id) => chartsApiAfter().get(id)));
  ipcMain.handle('charts:create', wrap((title, mmd_code) => chartsApiAfter().create(title, mmd_code)));
  ipcMain.handle('charts:update', wrap((id, changes) => chartsApiAfter().update(id, changes)));
  ipcMain.handle('charts:delete', wrap((id) => chartsApiAfter().delete(id)));
  ipcMain.handle('products:list', wrap(() => chartsApiAfter().listProducts()));

  ipcMain.handle('files:save', async (_e, { defaultName, filters, dataBase64 }) => {
    const win = viewManager.getView() || undefined;
    const result = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, Buffer.from(dataBase64, 'base64'));
    return result.filePath;
  });

  ipcMain.handle('files:open-images', async () => {
    const win = viewManager.getView() || undefined;
    const result = await dialog.showOpenDialog(win, {
      title: 'Select images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    });
    if (result.canceled) return [];
    return result.filePaths.map((p) => ({
      name: require('path').basename(p),
      dataBase64: fs.readFileSync(p).toString('base64'),
    }));
  });

  ipcMain.handle('clipboard:write-image', (_e, pngBase64) => {
    clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64')));
  });

  ipcMain.handle('clipboard:write-text', (_e, text) => clipboard.writeText(text));
}

function chartsApiAfter() {
  getConnector();
  return chartsApi;
}

module.exports = { registerIpc, syncBaseUrl, status };
