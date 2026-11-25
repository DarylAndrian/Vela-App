const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, session } = require('electron');
const path = require('path');
const config = require('./config');
const services = require('./services');
const viewManager = require('./viewManager');
const externalApps = require('./externalApps');
const featuresProtocol = require('./featuresProtocol');
const velaApi = require('./velaApi/ipc');
const vaultWorkspace = require('./velaApi/vaultWorkspace');
const mediaEngine = require('./mediaEngine');
const imageEngine = require('./imageEngine');
const modelCache = require('./modelCache');
const installer = require('./installer');
const macroEngine = require('./macroEngine');

featuresProtocol.registerPrivileged();
const FEATURES_DEV = process.argv.includes('--features-dev') || process.env.VELA_FEATURES_DEV === '1';
const FEATURES_BASE = FEATURES_DEV ? 'http://localhost:5174' : 'app://features';

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) app.setPath('userData', path.join(app.getPath('temp'), 'vela-smoke'));
if (process.argv.includes('--shots')) app.disableHardwareAcceleration();
const gotLock = app.requestSingleInstanceLock();
let win = null;
let navigation = 0;
let chartAfterConnect = false;

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  function send(channel, payload) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 960,
      minHeight: 640,
      title: 'Vela',
      autoHideMenuBar: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0d' : '#f7f7f8',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    viewManager.attach(win, send, id => { if (id === 'vault') vaultWorkspace.clearClipboard(); });
    win.on('resize', () => viewManager.layout());
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  async function openService(id) {
    const cfg = config.load();
    const svc = services.byId(id);
    if (!svc) return;
    switch (svc.kind) {
      case 'coming-soon':
        return;
      case 'native': {
        const request = ++navigation;
        chartAfterConnect = false;
        const connected = !svc.needsAuth || (await velaApi.status()).connected;
        if (request !== navigation) return;
        if (!connected) {
          chartAfterConnect = true;
          viewManager.openLocal('connect', `${FEATURES_BASE}/connect.html`);
          return;
        }
        viewManager.openLocal(id, id === 'vault' ? vaultWorkspace.URL : `${FEATURES_BASE}/${svc.page}`);
        return;
      }
      case 'external': {
        try {
          const args = svc.buildArgs ? svc.buildArgs(cfg) : [];
          const result = await externalApps.launch(svc, cfg, args);
          send('service:state', { type: result.alreadyRunning ? 'already-running' : 'running', id });
        } catch (err) {
          send('service:state', { type: 'not-found', id, message: err.message || String(err) });
        }
        return;
      }
    }
  }

  function notify(channel, payload) {
    send(channel, payload);
    viewManager.notifyViews(channel, payload);
  }

  function applyAppearance(theme) {
    nativeTheme.themeSource = theme === 'dark' || theme === 'light' ? theme : 'system';
  }

  function accountChanged(connected, identity, reason) {
    if (identity || reason === 'disconnect') vaultWorkspace.accountChanged(identity, reason);
    send('service:state', { type: 'account-changed' });
    if (connected) {
      if (chartAfterConnect) {
        ++navigation;
        chartAfterConnect = false;
        viewManager.openLocal('chart-code', `${FEATURES_BASE}/chart-code.html`);
      }
      return;
    }
    const activeChart = viewManager.getViewId() === 'chart-code';
    viewManager.discard('chart-code');
    if (activeChart) {
      ++navigation;
      chartAfterConnect = true;
      viewManager.openLocal('connect', `${FEATURES_BASE}/connect.html`);
    }
  }

  function registerIpc() {
    ipcMain.handle('services:list', () => services.listWithStates(config.load()));
    ipcMain.handle('config:get', () => ({ ...config.load(), configPath: config.configPath() }));
    ipcMain.handle('config:save', (_e, cfg) => {
      const previous = config.load().velaBaseUrl;
      const saved = config.save(cfg);
      vaultWorkspace.serverChanged(previous, saved.velaBaseUrl);
      applyAppearance(saved.theme);
      velaApi.syncBaseUrl();
      notify('service:state', { type: 'theme:changed', theme: saved.theme });
      send('services:refresh');
      return saved;
    });
    ipcMain.handle('service:open', (_e, id) => openService(id));
    ipcMain.handle('workspace:show', (_e, destination) => {
      if (!['home', 'settings', 'account'].includes(destination)) return;
      ++navigation;
      chartAfterConnect = false;
      if (destination === 'account') viewManager.openLocal('connect', `${FEATURES_BASE}/connect.html`);
      else viewManager.showShell(destination);
    });
    ipcMain.on('workspace:bounds', (event, bounds) => {
      if (event.sender === win.webContents) viewManager.setWorkspace(bounds);
    });
    ipcMain.handle('config:reveal', () => shell.showItemInFolder(config.configPath()));
    ipcMain.handle('dialog:locate', async () => {
      const result = await dialog.showOpenDialog(win, {
        title: 'Select the executable',
        properties: ['openFile'],
        filters: [{ name: 'Executable', extensions: ['exe'] }],
      });
      return result.canceled ? null : result.filePaths[0];
    });
    velaApi.registerIpc({ notify, getWindow: () => win, accountChanged });
    vaultWorkspace.register();
    mediaEngine.registerIpc({ notify, getWindow: () => win });
    imageEngine.registerIpc();
    modelCache.registerIpc({ notify });
    installer.registerIpc({ notify });
    macroEngine.registerIpc({
      getWindow: () => win,
      getContents: () => viewManager.getView('macro')?.webContents,
      isActive: () => viewManager.getViewId() === 'macro',
      workspaceUrl: `${FEATURES_BASE}/macro.html`,
      send,
    });
  }

  async function runSmoke() {
    const results = [];
    const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    try {
      const cfg = config.load();
      const list = services.listWithStates(cfg);
      check('services:list reports unique service IDs', new Set(list.map((service) => service.id)).size === list.length);
      check('coming-soon states correct', list.filter((s) => s.state === 'coming-soon').length === 0);
      check('native cards available', list.find((s) => s.id === 'chart-code').state === 'available'
        && list.find((s) => s.id === 'picture-connector').state === 'available');
      check('media-converter card available', list.find((s) => s.id === 'media-converter').state === 'available');
      check('velapt card available', list.find((s) => s.id === 'velapt').state === 'available');
      check('taiwan-year card available', list.find((s) => s.id === 'taiwan-year').state === 'available');
      check('macro recorder card available', list.find((s) => s.id === 'macro').state === 'available');
      const nativeCount = list.filter((s) => s.kind === 'native').length;
      check('config round-trip', !!config.save(config.load()).velaBaseUrl);
      const homeState = await win.webContents.executeJavaScript(`(async () => {
        const waitFor = async (ready) => {
          for (let i = 0; i < 40 && !ready(); i++) await new Promise((resolve) => setTimeout(resolve, 25));
          return ready();
        };
        await waitFor(() => document.querySelectorAll('#toolNav button').length === ${nativeCount});
        await window.launcher.showWorkspace('settings');
        const settings = await waitFor(() => !document.getElementById('settingsPanel').hidden);
        const account = document.getElementById('accountBtn').textContent;
        await window.launcher.showWorkspace('home');
        const home = await waitFor(() => !document.getElementById('homeScroll').hidden);
        return {
          destinations: document.querySelectorAll('#toolNav button').length,
          launches: document.querySelectorAll('#cardGrid [data-id]').length,
          settings, account, home,
        };
      })()`);
      check('persistent rail, Settings and launcher render', homeState.destinations === nativeCount &&
        homeState.launches === list.length && homeState.settings && homeState.account && homeState.home, JSON.stringify(homeState));
      check('tasklist probe works (explorer.exe running)', await externalApps.isRunning('explorer.exe'));
      const wc = await new Promise((resolve) => {
        viewManager.openLocal('smoke-native', `${FEATURES_BASE}/chart-code.html`);
        const webContents = viewManager.getView().webContents;
        webContents.once('did-finish-load', () => resolve(webContents));
        setTimeout(() => resolve(webContents), 5000);
      });
      const nativeLoaded = await wc.executeJavaScript(`!!document.querySelector('[aria-label="Chart Code"]')`);
      check('native chart-code page loads', nativeLoaded);
      check('local workspace is visible beside the rail', viewManager.getView().getBounds().x > 0);
      viewManager.showShell();
      check('Home deactivates the embedded workspace', viewManager.getView() === null && !wc.isDestroyed());
      viewManager.openLocal('smoke-native', `${FEATURES_BASE}/chart-code.html`);
      check('returning to a workspace reuses its renderer', viewManager.getView().webContents === wc);
      viewManager.showShell();
      const pcWc = await new Promise((resolve) => {
        viewManager.openLocal('smoke-pc', `${FEATURES_BASE}/picture-connector.html`);
        const webContents = viewManager.getView().webContents;
        webContents.once('did-finish-load', () => resolve(webContents));
        setTimeout(() => resolve(webContents), 5000);
      });
      const pcResult = await pcWc.executeJavaScript(`(async () => {
        const makeFile = async (color, name) => {
          const c = document.createElement('canvas'); c.width = 120; c.height = 80;
          const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 120, 80);
          const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
          return new File([blob], name, { type: 'image/png' });
        };
        const files = [await makeFile('#ff0000', 'a.png'), await makeFile('#00ff00', 'b.png')];
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        const ev = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'clipboardData', { value: dt });
        window.dispatchEvent(ev);
        await new Promise((r) => setTimeout(r, 3000));
        const canvas = document.querySelector('canvas');
        return {
          hasCanvas: !!canvas,
          w: canvas ? canvas.width : 0,
          h: canvas ? canvas.height : 0,
          thumbs: document.querySelectorAll('img[src^="blob:"]').length,
        };
      })()`);
      check('picture-connector composites pasted images', pcResult.hasCanvas && pcResult.w > 0 && pcResult.thumbs === 2, JSON.stringify(pcResult));
      viewManager.showShell();

      // Chart Code editor E2E with stubbed storage/IPC (no network needed).
      const stubCalls = [];
      const chart = (id, title, code) => ({ id, title, mmd_code: code, protected: false, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z' });
      const sample = 'flowchart TD\n  A[Start] --> B{Retry?}\n  B -->|Yes| C[Wait]\n  B -->|No| D[Fail]';
      ipcMain.removeHandler('charts:list');
      ipcMain.handle('charts:list', () => ({ ok: true, data: [chart(1, 'Payment Retry Logic', sample)] }));
      ipcMain.removeHandler('products:list');
      ipcMain.handle('products:list', () => ({ ok: true, data: [{ id: 'p1', name: 'Vela', color: '#10b981' }] }));
      ipcMain.removeHandler('charts:update');
      ipcMain.handle('charts:update', (_e, id, changes) => {
        stubCalls.push({ id, ...changes });
        return { ok: true, data: chart(id, changes.title, changes.mmd_code) };
      });
      const fs = require('fs');
      const os = require('os');
      const smokeExports = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-smoke-exports-'));
      const origSaveDialog = dialog.showSaveDialog;
      const recordSave = async (_window, options) => {
        stubCalls.push({ saved: options.defaultPath });
        return { canceled: false, filePath: path.join(smokeExports, options.defaultPath) };
      };
      dialog.showSaveDialog = recordSave;
      const ccWc = await new Promise((resolve) => {
        viewManager.openLocal('smoke-cc', `${FEATURES_BASE}/chart-code.html`);
        const webContents = viewManager.getView().webContents;
        webContents.once('did-finish-load', () => resolve(webContents));
        setTimeout(() => resolve(webContents), 5000);
      });
      const ccResult = await ccWc.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = {};
        await sleep(1500); // let React mount the list
        const card = document.querySelector('.chart-open');
        if (!card) return { error: 'no chart card in list' };
        card.click();
        await sleep(2500); // mermaid render
        out.renderedSvg = !!document.querySelector('.mermaid-host svg');
        const nodes = document.querySelectorAll('.mermaid-host g.node');
        out.nodeCount = nodes.length;
        if (nodes[1]) nodes[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(600);
        out.toolbarShown = !!document.querySelector('.node-style-toolbar');
        const bold = [...document.querySelectorAll('.node-style-toolbar div')].find((d) => d.textContent === 'B' && d.style && d.style.width === '26px');
        if (bold) bold.click();
        await sleep(600);
        out.styleLine = ((document.querySelector('textarea') || {}).value || '').split('\\n').find((l) => l.includes('style B')) || '';
        const buttons = [...document.querySelectorAll('button')];
        const exportBtn = buttons.find((b) => b.textContent.includes('Export'));
        if (exportBtn) exportBtn.click();
        await sleep(400);
        const svgItem = [...document.querySelectorAll('.chart-format')].find((button) => button.textContent === 'SVG');
        if (svgItem) svgItem.click();
        await sleep(1500);
        out.toast = document.querySelector('.chart-export-result')?.textContent || '';
        out.savedNotice = !!document.querySelector('.chart-export-result .reveal-output');
        const saveBtn = buttons.find((b) => b.textContent.includes('Save'));
        if (saveBtn) saveBtn.click();
        await sleep(600);
        out.saveBadge = [...document.querySelectorAll('.badge')].map((b) => b.textContent).join(' | ');
        return out;
      })()`);
      check('chart-code renders mermaid in editor', ccResult.renderedSvg && ccResult.nodeCount >= 3, JSON.stringify(ccResult).slice(0, 120));
      check('chart-code node style write-back', ccResult.toolbarShown && ccResult.styleLine.includes('font-weight:bold'), ccResult.styleLine);
      check('chart-code SVG export saves file', ccResult.savedNotice && stubCalls.some((c) => c.saved?.endsWith('.svg') && fs.existsSync(path.join(smokeExports, c.saved))), ccResult.toast);
      check('chart-code save clears dirty state', (ccResult.saveBadge || '').includes('All changes saved') && stubCalls.some((c) => c.mmd_code !== undefined), ccResult.saveBadge);
      viewManager.showShell();

      // VelaPTP built-in screen E2E: samples -> crop -> export via stubbed files:save.
      const vpWc = await new Promise((resolve) => {
        viewManager.openLocal('smoke-velapt', `${FEATURES_BASE}/velapt.html`);
        const webContents = viewManager.getView().webContents;
        webContents.once('did-finish-load', () => resolve(webContents));
        setTimeout(() => resolve(webContents), 5000);
      });
      const vpStart = await vpWc.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        await sleep(1500); // let React mount
        const out = {};
        const sampleBtn = document.getElementById('sampleBtn');
        if (!sampleBtn) return { error: 'no sample button' };
        sampleBtn.click();
        await sleep(1800);
        out.thumbs = document.querySelectorAll('.thumb').length;
        const cont = document.getElementById('primaryBtn');
        if (cont && !cont.disabled) cont.click(); // Continue -> crop step
        await sleep(700);
        const wrap = document.getElementById('photoWrap');
        out.cropStage = !!wrap && wrap.style.display !== 'none';
        out.wrapW = wrap ? Math.round(wrap.getBoundingClientRect().width) : 0;
        out.canvasW = (document.getElementById('photoCanvas') || {}).width || 0;
        out.uploadHidden = document.getElementById('stageUpload').classList.contains('hidden');
        out.readout = (document.getElementById('cropReadout') || {}).textContent || '';
        const autoBtn = document.getElementById('autoBtn');
        if (autoBtn) autoBtn.click();
        await sleep(500);
        for (let i = 0; i < 2; i++) { // keep the export fast: one page
          const del = document.querySelector('.thumb .tools .del');
          if (del) del.click();
          await sleep(350);
        }
        for (let i = 0; i < 8; i++) {
          const btn = document.getElementById('primaryBtn');
          if (!btn || btn.disabled) break;
          btn.click();
          await sleep(500);
          const bar = document.getElementById('barKicker');
          if (bar && bar.textContent.includes('Step 3')) break;
        }
        out.step3 = (document.getElementById('barKicker') || {}).textContent || '';
        out.filenameVisible = (document.getElementById('fileField') || {}).style.display !== 'none';
        const btn = document.getElementById('primaryBtn');
        if (btn && !btn.disabled) btn.click(); // Export PDF
        return out;
      })()`);
      let pdfSaved = null;
      for (let i = 0; i < 40; i++) {
        pdfSaved = stubCalls.find((c) => c.saved && c.saved.endsWith('.pdf'));
        if (pdfSaved) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      check('velapt samples + crop stage render', vpStart.thumbs === 3 && vpStart.cropStage && vpStart.wrapW > 300 && vpStart.canvasW > 0 && vpStart.uploadHidden && /[0-9]+ × [0-9]+ PX/.test(vpStart.readout), JSON.stringify(vpStart).slice(0, 140));
      check('velapt wizard reaches export step', (vpStart.step3 || '').includes('Step 3') && vpStart.filenameVisible, vpStart.step3);
      check('velapt export saves PDF via native dialog', !!pdfSaved && fs.existsSync(path.join(smokeExports, pdfSaved.saved)), pdfSaved ? pdfSaved.saved : 'no files:save call');
      await vpWc.executeJavaScript('history.back(); true');
      await new Promise((r) => setTimeout(r, 700));
      const backStep = await vpWc.executeJavaScript('((document.getElementById("barKicker") || {}).textContent || "")');
      check('velapt back-button steps wizard back', backStep.includes('Step 2'), backStep);
      viewManager.showShell();

      // Paste intake E2E: a clipboard image loads as a photo.
      const pasteWc = await new Promise((resolve) => {
        viewManager.openLocal('smoke-velapt-paste', `${FEATURES_BASE}/velapt.html`);
        const webContents = viewManager.getView().webContents;
        webContents.once('did-finish-load', () => resolve(webContents));
        setTimeout(() => resolve(webContents), 5000);
      });
      const pasteResult = await pasteWc.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        await sleep(1200); // let React mount
        const c = document.createElement('canvas'); c.width = 200; c.height = 280;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#f7f3ea'; ctx.fillRect(0, 0, 200, 280);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
        const ev = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'clipboardData', { value: dt });
        window.dispatchEvent(ev);
        await sleep(1500);
        return {
          thumbs: document.querySelectorAll('.thumb').length,
          count: (document.querySelector('.rail-count') || {}).textContent || '',
          img: (document.querySelector('.thumb img') || {}).src ? 'yes' : 'no',
        };
      })()`);
      check('velapt paste loads image from clipboard', pasteResult.thumbs === 1 && pasteResult.count === '01' && pasteResult.img === 'yes', JSON.stringify(pasteResult));
      viewManager.showShell();

      // Taiwan Year Calculator E2E: both conversion directions.
      const tyWc = await new Promise((resolve) => {
        viewManager.openLocal('smoke-taiwan', `${FEATURES_BASE}/taiwan-year.html`);
        const webContents = viewManager.getView().webContents;
        webContents.once('did-finish-load', () => resolve(webContents));
        setTimeout(() => resolve(webContents), 5000);
      });
      const tyResult = await tyWc.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        await sleep(1200); // let React mount
        const setVal = (el, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const out = {};
        const greg = document.getElementById('gregorianInput');
        const mng = document.getElementById('minguoInput');
        if (!greg || !mng) return { error: 'inputs missing' };
        setVal(greg, '2025');
        await sleep(300);
        out.toMinguo = (document.getElementById('minguoResult') || {}).textContent || '';
        setVal(greg, '');
        await sleep(150);
        setVal(mng, '114');
        await sleep(300);
        out.toGregorian = (document.getElementById('gregorianResult') || {}).textContent || '';
        out.clearedGregorian = greg.value === '';
        return out;
      })()`);
      check('taiwan-year converts Gregorian to Minguo', tyResult.toMinguo.includes('Year 114'), JSON.stringify(tyResult).slice(0, 120));
      check('taiwan-year converts Minguo to Gregorian', tyResult.toGregorian.includes('Year 2025') && tyResult.clearedGregorian, JSON.stringify(tyResult).slice(0, 120));
      viewManager.showShell();

      // Exercise the real Windows helper without sending input to the desktop.
      if (process.platform === 'win32') {
        const rejected = await win.webContents.executeJavaScript("window.vela.macro.command('record')");
        check('macro controls are restricted to their workspace', rejected.ok === false);
        const fixture = path.join(smokeExports, 'legacy-macro.json');
        const actions = [
          { type: 'key_press', t: 3600, key: { kind: 'special', name: 'ctrl_r' } },
          { type: 'key_release', t: 0, key: { kind: 'special', name: 'ctrl_r' } },
          { type: 'scroll', t: 0, x: -30, y: 20, dx: 1, dy: -2 },
        ];
        fs.writeFileSync(fixture, JSON.stringify({ version: 1, events: actions }));
        const openDialog = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
        try {
          await openService('macro');
          const macroContents = viewManager.getView().webContents;
          if (macroContents.isLoading()) await new Promise((resolve) => macroContents.once('did-stop-loading', resolve));
          const macroResult = await macroContents.executeJavaScript(`(async () => {
            const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const ready = () => [...document.querySelectorAll('button')].some((button) =>
              button.textContent.trim() === 'Record' && !button.disabled);
            for (let i = 0; i < 40 && !ready(); i++) await pause(25);
            if (!ready()) return { rendered: false, error: document.querySelector('[role="alert"]')?.textContent };
            const { macro } = window.vela;
            const opened = await macro.command('load');
            const saved = await macro.command('save');
            const played = await macro.command('play', { repetitions: 2 });
            const starting = (await macro.status()).state;
            await macro.command('stop');
            let stopped = (await macro.status()).state;
            for (let i = 0; i < 40 && stopped.phase !== 'idle'; i++) {
              await pause(25);
              stopped = (await macro.status()).state;
            }
            return { rendered: true, opened, saved, played, starting, stopped };
          })()`);
          check('macro workspace imports and exports a VelaClicker recording', macroResult.rendered &&
            macroResult.opened.ok && macroResult.saved.ok && macroResult.starting.actionCount === actions.length &&
            JSON.parse(fs.readFileSync(fixture, 'utf8')).event_count === actions.length, JSON.stringify(macroResult).slice(0, 180));
          check('macro playback countdown cancels before sending input', macroResult.played?.ok &&
            macroResult.starting.phase === 'countdown' && macroResult.stopped.phase === 'idle' &&
            macroResult.stopped.cycles === 0, macroResult.stopped?.notice);
        } finally {
          dialog.showOpenDialog = openDialog;
          viewManager.discard('macro');
          viewManager.showShell();
        }
      }

      // Media Converter native engine E2E: real ffmpeg through the preload IPC.
      const { spawn } = require('child_process');
      const mediaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-media-smoke-'));
      const ffmpegBin = mediaEngine.resolveFfmpeg();
      check('media ffmpeg binary resolves', !!ffmpegBin && fs.existsSync(ffmpegBin), ffmpegBin || 'missing');
      const runFf = (args) => new Promise((resolve) => {
        const proc = spawn(ffmpegBin, args, { windowsHide: true });
        proc.on('close', (code) => resolve(code));
        proc.on('error', () => resolve(-1));
      });
      const clipA = path.join(mediaTmp, 'clip-a.mp4');
      const clipB = path.join(mediaTmp, 'clip-b.webm');
      const clipLong = path.join(mediaTmp, 'clip-long.mp4');
      await runFf(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', clipA]);
      await runFf(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-c:v', 'libvpx', '-b:v', '300k', '-c:a', 'libvorbis', '-shortest', clipB]);
      await runFf(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=15:duration=30', '-c:v', 'libx264', '-preset', 'ultrafast', '-an', clipLong]);
      check('media fixtures generated', fs.existsSync(clipA) && fs.existsSync(clipB) && fs.existsSync(clipLong));

      const mcWc = await new Promise((resolve) => {
        viewManager.openLocal('media-converter', `${FEATURES_BASE}/media-converter.html`);
        const webContents = viewManager.getView().webContents;
        webContents.once('did-finish-load', () => resolve(webContents));
        setTimeout(() => resolve(webContents), 5000);
      });
      await new Promise((r) => setTimeout(r, 1500));
      const mcHome = await mcWc.executeJavaScript(`({
        modes: document.querySelectorAll('[role="tab"]').length,
        active: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(),
        addFiles: !!document.querySelector('.mc-add-files'),
        bridge: !!window.launcher?.media,
      })`);
      check('media converter opens directly to image conversion', mcHome.modes === 6 && mcHome.active === 'Convert images' && mcHome.addFiles && mcHome.bridge, JSON.stringify(mcHome));
      const [wideWidth, wideHeight] = win.getSize();
      win.setSize(960, 640);
      for (let attempt = 0; attempt < 40 && viewManager.getView().getBounds().x !== 64; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const compactBounds = viewManager.getView().getBounds();
      const compactControls = await mcWc.executeJavaScript(`(() => {
        const visible = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom <= innerHeight;
        };
        return visible('.mc-add-files') && visible('.mc-actionbar .mc-actions button');
      })()`);
      check('minimum window size keeps Media Converter actions visible', compactBounds.x === 64 && compactControls,
        JSON.stringify(compactBounds));
      win.setSize(wideWidth, wideHeight);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const probe = await mcWc.executeJavaScript('window.launcher.media.ffmpegProbe()');
      check('media ffmpeg probe via preload', probe.ok && /ffmpeg version/.test(probe.version || ''), probe.version || probe.error);

      const engineOut = await mcWc.executeJavaScript(`(async () => {
        const media = window.launcher.media;
        const dir = ${JSON.stringify(mediaTmp)};
        const log = [];
        const unsub = media.onJobProgress((p) => log.push(p));
        const out = {};
        out.remux = await media.convert({ jobId: 'smoke-remux', outputDir: dir, jobs: [
          { inputPath: ${JSON.stringify(clipA)}, outputName: 'out-remux.mov', kind: 'video', format: 'mov', mode: 'remux' },
        ] });
        out.fallback = await media.convert({ jobId: 'smoke-fallback', outputDir: dir, jobs: [
          { inputPath: ${JSON.stringify(clipB)}, outputName: 'out-fallback.mp4', kind: 'video', format: 'mp4', mode: 'remux' },
        ] });
        out.audio = await media.convert({ jobId: 'smoke-audio', outputDir: dir, jobs: [
          { inputPath: ${JSON.stringify(clipA)}, outputName: 'out-a.mp3', kind: 'audio', format: 'mp3', mode: 'extract' },
          { inputPath: ${JSON.stringify(clipB)}, outputName: 'out-b.mp3', kind: 'audio', format: 'mp3', mode: 'extract' },
        ] });
        unsub();
        const ratios = (id) => log.filter((p) => p.jobId === id).map((p) => p.ratio);
        out.remuxRatios = ratios('smoke-remux');
        out.fallbackRatios = ratios('smoke-fallback');
        return out;
      })()`);
      const brand = (file) => { try { return fs.readFileSync(file).slice(8, 12).toString('latin1'); } catch { return ''; } };
      check('video remux mp4->mov succeeds', engineOut.remux.ok === true && brand(path.join(mediaTmp, 'out-remux.mov')) === 'qt  ', JSON.stringify(engineOut.remux).slice(0, 100));
      check('remux emits start + end progress', engineOut.remuxRatios.includes(-1) && engineOut.remuxRatios.includes(1), JSON.stringify(engineOut.remuxRatios));
      check('incompatible remux falls back to re-encode', engineOut.fallback.ok === true && brand(path.join(mediaTmp, 'out-fallback.mp4')) === 'isom', JSON.stringify(engineOut.fallback).slice(0, 100));
      check('re-encode emits fractional progress', engineOut.fallbackRatios.some((r) => r > 0 && r < 1) && engineOut.fallbackRatios.includes(1), JSON.stringify(engineOut.fallbackRatios).slice(0, 100));
      check('batch audio extraction saves mp3s', engineOut.audio.ok === true && fs.existsSync(path.join(mediaTmp, 'out-a.mp3')) && fs.existsSync(path.join(mediaTmp, 'out-b.mp3')), JSON.stringify(engineOut.audio).slice(0, 100));

      const priorAudio = fs.readFileSync(path.join(mediaTmp, 'out-a.mp3'));
      const partial = await mcWc.executeJavaScript(`window.launcher.media.convert({
        jobId: 'smoke-partial', outputDir: ${JSON.stringify(mediaTmp)}, jobs: [
          { inputPath: ${JSON.stringify(clipA)}, outputName: 'out-a.mp3', kind: 'audio', format: 'mp3', mode: 'extract' },
          { inputPath: ${JSON.stringify(path.join(mediaTmp, 'missing.mp4'))}, outputName: 'out-b.mp3', kind: 'audio', format: 'mp3', mode: 'extract' },
        ],
      })`);
      check('batch collisions and partial failures preserve existing outputs', !partial.ok &&
        partial.results[0].outputName === 'out-a (1).mp3' && !partial.results[1].ok &&
        fs.existsSync(path.join(mediaTmp, 'out-b.mp3')) && priorAudio.equals(fs.readFileSync(path.join(mediaTmp, 'out-a.mp3'))));

      await mcWc.executeJavaScript(`window.smokePendingJob = window.launcher.media.convert({
        jobId: 'smoke-cancel', outputDir: ${JSON.stringify(mediaTmp)}, jobs: [
          { inputPath: ${JSON.stringify(clipLong)}, outputName: 'out-cancel.webm', kind: 'video', format: 'webm', mode: 'reencode' },
        ],
      }); true`);
      await win.webContents.executeJavaScript(`window.launcher.showWorkspace('settings')`);
      const activityVisible = await win.webContents.executeJavaScript(`(async () => {
        const indicator = document.querySelector('[data-destination="media-converter"] .nav-activity');
        for (let i = 0; i < 20 && indicator.hidden; i++) await new Promise((resolve) => setTimeout(resolve, 20));
        return !indicator.hidden;
      })()`);
      check('running conversion stays visible from Settings', activityVisible && viewManager.getView() === null);
      await win.webContents.executeJavaScript(`window.launcher.openService('media-converter')`);
      check('Media Converter resumes its active renderer', viewManager.getView()?.webContents === mcWc);
      const cancelOut = await mcWc.executeJavaScript(`(async () => {
        const ack = await window.launcher.media.cancelJob('smoke-cancel');
        const result = await window.smokePendingJob;
        return { ack, result };
      })()`);
      check('cancel stops job and cleans output', cancelOut.ack.ok === true && cancelOut.result.canceled === true &&
        cancelOut.result.ok === false && !fs.existsSync(path.join(mediaTmp, 'out-cancel.webm')) &&
        !fs.readdirSync(mediaTmp).some((name) => name.startsWith('.vela-')), JSON.stringify(cancelOut.result).slice(0, 120));

      // Video tool UI: engine-ready state, then a real drag-drop via CDP if supported.
      await mcWc.executeJavaScript(`location.hash = '#/video'; true`);
      await new Promise((r) => setTimeout(r, 900));
      const videoUi = await mcWc.executeJavaScript(`({
        ready: [...document.querySelectorAll('#media-panel-2 .mc-actions button')].some((b) => b.textContent.trim() === 'Convert and save'),
        formats: [...document.getElementById('video-output-format').options].map((o) => o.value).join(','),
      })`);
      check('video tool mounts engine-ready', videoUi.ready && videoUi.formats === 'mp4,mov,avi,mkv,webm', JSON.stringify(videoUi));

      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(mediaTmp, 'ui-out.mov') });
      await mcWc.executeJavaScript(`window.__droppedFiles = [];
        document.addEventListener('drop', (e) => { window.__droppedFiles = [...(e.dataTransfer?.files || [])]; }, { capture: true, once: true });
        true`);
      let uiDropWorked = false;
      const dbg = mcWc.debugger;
      try {
        dbg.attach('1.3');
        await dbg.sendCommand('Input.setInterceptDrags', { enabled: true });
        const rect = await mcWc.executeJavaScript(`(() => {
          const el = document.querySelector('[role="tabpanel"]:not([hidden]) input[type="file"]').parentElement;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`);
        const dragData = { items: [{ mimeType: 'video/mp4', data: '' }], files: [clipA], dragOperationsMask: 1 };
        await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x: rect.x, y: rect.y, data: dragData });
        await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x: rect.x, y: rect.y, data: dragData });
        await dbg.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: rect.x, y: rect.y, data: dragData });
      } catch {
        // CDP drag injection unsupported in this build; synthetic-drop fallback below.
      } finally {
        try { dbg.detach(); } catch { /* not attached */ }
      }
      await new Promise((r) => setTimeout(r, 800));
      uiDropWorked = await mcWc.executeJavaScript(`document.body.innerText.includes('clip-a.mp4')`);

      if (uiDropWorked) {
        const dropPath = await mcWc.executeJavaScript(`window.__droppedFiles.length ? window.launcher.media.getPathForFile(window.__droppedFiles[0]) : 'no-file'`);
        check('CDP drop exposes native file path', dropPath === clipA, dropPath);
        const uiResult = await mcWc.executeJavaScript(`(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const select = document.getElementById('video-output-format');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          setter.call(select, 'mov');
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(200);
          const progressSeen = [];
          const unsub = window.launcher.media.onJobProgress((p) => progressSeen.push(p.ratio));
          const btn = [...document.querySelectorAll('#media-panel-2 .mc-actions button')].find((b) => b.textContent.trim() === 'Convert and save');
          btn.click();
          let saved = false;
          for (let i = 0; i < 40; i++) {
            await sleep(500);
            if (document.body.innerText.includes('Saved ui-out.mov.')) { saved = true; break; }
          }
          unsub();
          return {
            saved,
            progressSeen,
            revealBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Show in File Explorer')),
            alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map((a) => a.textContent).join(' | '),
          };
        })()`);
        check('video UI drag-drop -> save round-trip', uiResult.saved && fs.existsSync(path.join(mediaTmp, 'ui-out.mov')) && uiResult.revealBtn, JSON.stringify({ alerts: uiResult.alerts, saved: uiResult.saved, progress: uiResult.progressSeen.length }).slice(0, 220));
        check('video UI receives job progress', uiResult.progressSeen.length > 0, JSON.stringify(uiResult.progressSeen));
      } else {
        const fallbackUi = await mcWc.executeJavaScript(`(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const dt = new DataTransfer();
          dt.items.add(new File([new Uint8Array(16)], 'clip-a.mp4', { type: 'video/mp4' }));
          const zone = document.querySelector('[role="tabpanel"]:not([hidden]) input[type="file"]').parentElement;
          zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
          await sleep(600);
          const listed = document.body.innerText.includes('clip-a.mp4');
          const btn = [...document.querySelectorAll('#media-panel-2 .mc-actions button')].find((b) => b.textContent.trim() === 'Convert and save');
          if (btn && !btn.disabled) btn.click();
          await sleep(800);
          return { listed, pathError: document.body.innerText.includes('read the file path') };
        })()`);
        check('video UI drop lists file (synthetic)', fallbackUi.listed, JSON.stringify(fallbackUi));
        check('video UI reports missing native path gracefully', fallbackUi.pathError, JSON.stringify(fallbackUi));
      }
      dialog.showSaveDialog = origSaveDialog;
      await win.webContents.executeJavaScript(`window.launcher.showWorkspace('home')`);
      await win.webContents.executeJavaScript(`window.launcher.openService('media-converter')`);
      const retainedVideo = await mcWc.executeJavaScript(`!document.getElementById('media-panel-2').hidden &&
        document.getElementById('media-panel-2').innerText.includes('clip-a.mp4')`);
      check('Media Converter remembers the active mode and file on return', retainedVideo);

      await mcWc.executeJavaScript(`location.hash = '#/video-to-audio'; true`);
      await new Promise((r) => setTimeout(r, 700));
      const audioUi = await mcWc.executeJavaScript(`({
        ready: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Extract and save'),
        formats: [...document.getElementById('audio-output-format').options].map((o) => o.value).join(','),
      })`);
      check('video-to-audio tool mounts', audioUi.ready && audioUi.formats === 'mp3,wav,m4a,ogg,flac,opus', JSON.stringify(audioUi));

      dialog.showSaveDialog = async () => ({ canceled: true });
      const canceledSave = await mcWc.executeJavaScript(`window.vela.files.save('cancel.png', [], 'eA==')`);
      check('dismissing Save As returns without writing an output', canceledSave === null);

      // Image engine E2E: sharp convert/compress through the preload IPC, plus
      // the Windows save path (dialog -> saved to disk).
      const sharp = require('sharp');
      const imgSrc = await sharp({ create: { width: 480, height: 320, channels: 3, background: '#3a7bd5' } }).jpeg({ quality: 95 }).toBuffer();
      const tiffBuf = await sharp(imgSrc).tiff().toBuffer();
      const pngBuf = await sharp(imgSrc).png().toBuffer();
      const srcGifPath = path.join(mediaTmp, 'src.gif');
      const srcBmpPath = path.join(mediaTmp, 'src.bmp');
      await runFf(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=480x320:rate=10:duration=0.1', '-frames:v', 1, srcGifPath]);
      await runFf(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=10:duration=0.1', '-frames:v', 1, srcBmpPath]);
      const gifBuf = fs.readFileSync(srcGifPath);
      const bmpBuf = fs.readFileSync(srcBmpPath);
      const heicBuf = fs.readFileSync(process.env.VELA_HEIC_FIXTURE || path.join(__dirname, '..', '..', 'scripts', 'fixtures', 'sample.heic'));

      const imgOut = await mcWc.executeJavaScript(`(async () => {
        const media = window.launcher.media;
        const out = {};
        out.tiffToJpg = await media.imageConvert({ inputBase64: '${tiffBuf.toString('base64')}', inputFormat: 'tiff', outputFormat: 'jpg' });
        out.heicToWebp = await media.imageConvert({ inputBase64: '${heicBuf.toString('base64')}', inputFormat: 'heic', outputFormat: 'webp' });
        out.pngToGif = await media.imageConvert({ inputBase64: '${pngBuf.toString('base64')}', inputFormat: 'png', outputFormat: 'gif' });
        out.bmpToPng = await media.imageConvert({ inputBase64: '${bmpBuf.toString('base64')}', inputFormat: 'bmp', outputFormat: 'png' });
        out.compressGif = await media.imageCompress({ inputBase64: '${gifBuf.toString('base64')}', inputFormat: 'gif', targetBytes: 20000, format: 'gif' });
        out.compressHeic = await media.imageCompress({ inputBase64: '${heicBuf.toString('base64')}', inputFormat: 'heic', targetBytes: 100000, format: 'keep' });
        return out;
      })()`);
      const magic = (b64, start, len) => Buffer.from(b64 || '', 'base64').slice(start, start + len).toString('latin1');
      const byteLen = (b64) => Buffer.from(b64 || '', 'base64').length;
      const jpgMeta = imgOut.tiffToJpg.ok ? await sharp(Buffer.from(imgOut.tiffToJpg.dataBase64, 'base64')).metadata() : {};
      check('image convert TIFF -> JPG keeps dimensions', imgOut.tiffToJpg.ok && magic(imgOut.tiffToJpg.dataBase64, 0, 2) === '\xff\xd8' && jpgMeta.width === 480 && jpgMeta.height === 320, JSON.stringify({ ok: imgOut.tiffToJpg.ok, err: imgOut.tiffToJpg.error, w: jpgMeta.width }));
      const webpMeta = imgOut.heicToWebp.ok ? await sharp(Buffer.from(imgOut.heicToWebp.dataBase64, 'base64')).metadata() : {};
      check('image convert HEIC -> WebP (heic-convert)', imgOut.heicToWebp.ok && magic(imgOut.heicToWebp.dataBase64, 0, 4) === 'RIFF' && magic(imgOut.heicToWebp.dataBase64, 8, 4) === 'WEBP' && webpMeta.width === 1440, JSON.stringify({ ok: imgOut.heicToWebp.ok, err: imgOut.heicToWebp.error, w: webpMeta.width }));
      check('image convert PNG -> GIF', imgOut.pngToGif.ok && magic(imgOut.pngToGif.dataBase64, 0, 4) === 'GIF8', JSON.stringify({ ok: imgOut.pngToGif.ok, err: imgOut.pngToGif.error }));
      check('image convert BMP -> PNG', imgOut.bmpToPng.ok && magic(imgOut.bmpToPng.dataBase64, 1, 3) === 'PNG', JSON.stringify({ ok: imgOut.bmpToPng.ok, err: imgOut.bmpToPng.error }));
      check('image compress GIF hits byte target as GIF', imgOut.compressGif.ok && imgOut.compressGif.extension === 'gif' && byteLen(imgOut.compressGif.dataBase64) < 20000 && magic(imgOut.compressGif.dataBase64, 0, 4) === 'GIF8', JSON.stringify({ ok: imgOut.compressGif.ok, ext: imgOut.compressGif.extension, bytes: byteLen(imgOut.compressGif.dataBase64), err: imgOut.compressGif.error }));
      check('image compress HEIC keep -> JPG under target', imgOut.compressHeic.ok && imgOut.compressHeic.extension === 'jpg' && byteLen(imgOut.compressHeic.dataBase64) < 100000, JSON.stringify({ ok: imgOut.compressHeic.ok, ext: imgOut.compressHeic.extension, bytes: byteLen(imgOut.compressHeic.dataBase64), err: imgOut.compressHeic.error }));

      dialog.showSaveDialog = async (_window, { defaultPath }) => ({
        canceled: false, filePath: path.join(mediaTmp, defaultPath),
      });

      await mcWc.executeJavaScript(`location.hash = '#/convert'; true`);
      await new Promise((r) => setTimeout(r, 700));
      const convUi = await mcWc.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const bytes = Uint8Array.from(atob('${tiffBuf.toString('base64')}'), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'fixture.tiff', { type: 'image/tiff' }));
        const zone = document.querySelector('[role="tabpanel"]:not([hidden]) input[type="file"]').parentElement;
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await sleep(600);
        const select = document.getElementById('output-format');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, 'jpg');
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200);
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Convert and save');
        btn.click();
        let done = false;
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          if (document.body.innerText.includes('Saved fixture.jpg.')) { done = true; break; }
        }
        return { done, alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map((a) => a.textContent).join(' | ') };
      })()`);
      check('convert UI TIFF -> JPG saves via main engine', convUi.done && fs.existsSync(path.join(mediaTmp, 'fixture.jpg')), JSON.stringify(convUi).slice(0, 180));
      const revealInExplorer = shell.showItemInFolder;
      const fixturePath = path.join(mediaTmp, 'fixture.jpg');
      let revealedPath;
      try {
        shell.showItemInFolder = (target) => { revealedPath = target; };
        const revealed = await mcWc.executeJavaScript(`window.vela.files.reveal(${JSON.stringify(fixturePath)})`);
        check('show in File Explorer resolves the saved file', revealed.ok && revealedPath === fixturePath);
      } finally {
        shell.showItemInFolder = revealInExplorer;
      }

      await mcWc.executeJavaScript(`location.hash = '#/compress'; true`);
      await new Promise((r) => setTimeout(r, 700));
      const compUi = await mcWc.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const bytes = Uint8Array.from(atob('${gifBuf.toString('base64')}'), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'fixture.gif', { type: 'image/gif' }));
        const zone = document.querySelector('[role="tabpanel"]:not([hidden]) input[type="file"]').parentElement;
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await sleep(600);
        const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        const formatSelect = document.getElementById('compress-output-format');
        selectSetter.call(formatSelect, 'gif');
        formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
        const unitSelect = document.querySelector('select[aria-label="Size unit"]');
        selectSetter.call(unitSelect, 'kb');
        unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200);
        const sizeInput = document.getElementById('compress-target-size');
        const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        inputSetter.call(sizeInput, '5');
        sizeInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(200);
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Compress and save');
        btn.click();
        let done = false;
        for (let i = 0; i < 60; i++) {
          await sleep(500);
          if (document.body.innerText.includes('Saved fixture.gif')) { done = true; break; }
        }
        return { done, alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map((a) => a.textContent).join(' | ') };
      })()`);
      const compressedGifOk = fs.existsSync(path.join(mediaTmp, 'fixture.gif')) && fs.statSync(path.join(mediaTmp, 'fixture.gif')).size < 5120;
      check('compress UI GIF -> GIF hits 5 KB target', compUi.done && compressedGifOk, JSON.stringify(compUi).slice(0, 180));

      // Background removal: tier-1 model download into userData, app://models
      // serving, then real ONNX inference through the tool UI (fast mode).
      const modelsRun = await mcWc.executeJavaScript(`(async () => {
        const media = window.launcher.media;
        const events = [];
        const unsub = media.onModelsProgress((s) => events.push({ dl: s.downloading, ready: s.baseReady, d: s.downloaded }));
        const status = await media.ensureModels('base');
        await new Promise((r) => setTimeout(r, 300));
        unsub();
        return { status, count: events.length, sawDownloading: events.some((e) => e.dl), sawReady: events.some((e) => e.ready) };
      })()`);
      check('tier-1 models download + cache', modelsRun.status.baseReady === true && !modelsRun.status.error, JSON.stringify(modelsRun.status).slice(0, 160));
      check('models progress events emitted', modelsRun.count > 0 && modelsRun.sawDownloading && modelsRun.sawReady, JSON.stringify({ count: modelsRun.count, dl: modelsRun.sawDownloading, ready: modelsRun.sawReady }));
      const modelDir = path.join(app.getPath('userData'), 'models', 'background-removal');
      const cachedBytes = fs.readdirSync(modelDir).reduce((sum, name) => {
        try { return sum + fs.statSync(path.join(modelDir, name)).size; } catch { return sum; }
      }, 0);
      check('model cache mirrored to userData', fs.existsSync(path.join(modelDir, 'resources.json')) && cachedBytes > 56e6, `${(cachedBytes / 1e6).toFixed(1)} MB`);
      const servedModels = await mcWc.executeJavaScript(`(async () => {
        const res = await fetch('app://models/background-removal/resources.json');
        const map = await res.json();
        const guard = await fetch('app://models/%2e%2e/config.json');
        const guardBody = await guard.text();
        return { ok: res.ok, hasModel: !!map['/models/isnet_quint8'], guardStatus: guard.status, leaked: guardBody.includes('velaBaseUrl') };
      })()`);
      check('app://models serves manifest + blocks traversal', servedModels.ok && servedModels.hasModel && (servedModels.guardStatus === 403 || servedModels.guardStatus === 404) && !servedModels.leaked, JSON.stringify(servedModels));
      const revalidateT0 = Date.now();
      const revalidated = await mcWc.executeJavaScript(`window.launcher.media.ensureModels('base')`);
      check('cached models re-validate without download', revalidated.baseReady === true && Date.now() - revalidateT0 < 3000, `${Date.now() - revalidateT0} ms`);

      await mcWc.executeJavaScript(`location.hash = '#/remove-background'; true`);
      await new Promise((r) => setTimeout(r, 900));
      const rbMount = await mcWc.executeJavaScript(`({
        ready: document.body.innerText.includes('Models ready'),
        dropzone: document.body.innerText.includes('Drag and drop an image here'),
      })`);
      check('remove-background tool mounts models-ready', rbMount.ready && rbMount.dropzone, JSON.stringify(rbMount));
      const rbResult = await mcWc.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#d94f30'; ctx.fillRect(68, 68, 120, 120);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'subject.png', { type: 'image/png' }));
        const zone = document.querySelector('[role="tabpanel"]:not([hidden]) input[type="file"]').parentElement;
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await sleep(600);
        const quality = document.getElementById('bg-quality');
        const setQuality = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setQuality.call(quality, 'fast');
        quality.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200);
        const runBtn = [...document.querySelectorAll('#media-panel-4 .mc-actions button')]
          .find((b) => b.textContent.trim() === 'Remove background');
        if (!runBtn || runBtn.disabled) return { error: 'run button missing or gated', listed: document.body.innerText.includes('subject.png') };
        runBtn.click();
        let done = false;
        for (let i = 0; i < 150; i++) {
          await sleep(1000);
          if ([...document.querySelectorAll('button')].some((b) => b.textContent.includes('Save PNG…'))) { done = true; break; }
        }
        if (!done) return { error: 'inference timed out', text: document.body.innerText.slice(-300) };
        const img = document.querySelector('img[alt="Background removed"]');
        const rc = document.createElement('canvas'); rc.width = img.naturalWidth; rc.height = img.naturalHeight;
        const rctx = rc.getContext('2d'); rctx.drawImage(img, 0, 0);
        const corner = rctx.getImageData(2, 2, 1, 1).data[3];
        const center = rctx.getImageData(128, 128, 1, 1).data[3];
        const dlBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Save PNG…'));
        dlBtn.click();
        await sleep(800);
        return { done, w: img.naturalWidth, h: img.naturalHeight, corner, center, note: document.body.innerText.includes('Saved subject-nobg.png.') };
      })()`);
      const nobgPath = path.join(mediaTmp, 'subject-nobg.png');
      let nobgCorner = -1;
      let nobgCenter = -1;
      let nobgAlpha = false;
      if (fs.existsSync(nobgPath)) {
        const meta = await sharp(nobgPath).metadata();
        nobgAlpha = meta.hasAlpha === true;
        const { data } = await sharp(nobgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        nobgCorner = data[3];
        nobgCenter = data[(128 * meta.width + 128) * 4 + 3];
      }
      check('remove-background ONNX inference via UI', rbResult.done === true && rbResult.w === 256 && rbResult.corner < 32 && rbResult.center > 224, JSON.stringify(rbResult).slice(0, 200));
      check('transparent PNG saved with clean alpha', fs.existsSync(nobgPath) && nobgAlpha && nobgCorner < 32 && nobgCenter > 224 && rbResult.note === true, JSON.stringify({ alpha: nobgAlpha, corner: nobgCorner, center: nobgCenter }));

      if (process.env.VELA_SMOKE_HIGH === '1') {
        const highRun = await mcWc.executeJavaScript(`(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const status = await window.launcher.media.ensureModels('high');
          if (!status.highReady) return { error: status.error || 'high tier failed' };
          const quality = document.getElementById('bg-quality');
          const setQuality = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          setQuality.call(quality, 'high');
          quality.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(200);
          const runBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reprocess');
          runBtn.click();
          for (let i = 0; i < 180; i++) {
            await sleep(1000);
            if (document.querySelector('img[alt="Background removed"]')) return { ok: true };
          }
          return { error: 'high inference timed out' };
        })()`);
        const isnetSize = (() => { try { return fs.statSync(path.join(modelDir, 'resources.json')).size > 0 ? JSON.parse(fs.readFileSync(path.join(modelDir, 'resources.json'), 'utf8'))['/models/isnet'].size : 0; } catch { return 0; } })();
        check('tier-2 high model + inference (VELA_SMOKE_HIGH)', highRun.ok === true && isnetSize === 176149806, JSON.stringify(highRun).slice(0, 160));
      }

      dialog.showSaveDialog = origSaveDialog;

      const statusBeforeSmoke = velaApi.status;
      velaApi.status = async () => ({ connected: false });
      await win.webContents.executeJavaScript(`window.launcher.openService('chart-code')`);
      check('Chart Code prompts for sign-in when disconnected', viewManager.getViewId() === 'connect');
      accountChanged(true);
      check('sign-in resumes Chart Code', viewManager.getViewId() === 'chart-code');
      notify('vela:auth-expired');
      accountChanged(false);
      check('expired Chart Code session returns to account', viewManager.getViewId() === 'connect');
      viewManager.showShell();
      velaApi.status = statusBeforeSmoke;

      // VelaIsland buildArgs CLI mapping.
      const islandSvc = services.byId('velaisland');
      const defaultArgs = islandSvc.buildArgs({});
      check('velaisland buildArgs defaults', defaultArgs.includes('--widget-media=on') && defaultArgs.includes('--widget-todos=on')
        && defaultArgs.includes('--opacity=90') && defaultArgs.includes('--position=top-right') && defaultArgs.includes('--hotkey=Ctrl+Alt+I'), defaultArgs.join(' '));
      const customArgs = islandSvc.buildArgs({ velaIslandSettings: { widgets: { todos: false }, opacity: 60, position: 'bottom-left', hotkey: 'Ctrl+Shift+I' } });
      check('velaisland buildArgs maps overrides', customArgs.includes('--widget-todos=off') && customArgs.includes('--widget-media=on')
        && customArgs.includes('--opacity=60') && customArgs.includes('--position=bottom-left') && customArgs.includes('--hotkey=Ctrl+Shift+I')
        && !customArgs.includes('--widget-todos=on'), customArgs.join(' '));
      check('listWithStates hides private fields', list.every((s) => s.installer === undefined && s.buildArgs === undefined && s.candidates === undefined));
      const originalOpenDialog = dialog.showOpenDialog;
      const originalLaunch = externalApps.launch;
      try {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [process.execPath] });
        const located = await win.webContents.executeJavaScript(`window.launcher.locate('velaZoomPath')`);
        check('companion Locate returns the selected executable', located === process.execPath);
        let launched;
        externalApps.launch = async (service) => { launched = service.id; return {}; };
        await win.webContents.executeJavaScript(`window.launcher.openService('velazoom')`);
        check('companion Open delegates to the Windows launcher', launched === 'velazoom');
      } finally {
        dialog.showOpenDialog = originalOpenDialog;
        externalApps.launch = originalLaunch;
      }

      // Installer downloadFile against an in-process HTTP server.
      const http = require('http');
      const installerTmp = path.join(app.getPath('userData'), 'installer-test');
      fs.mkdirSync(installerTmp, { recursive: true });
      const payload = Buffer.alloc(262144, 7);
      const goodServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Length': payload.length });
        let offset = 0;
        const push = () => {
          if (offset >= payload.length) { res.end(); return; }
          res.write(payload.subarray(offset, offset + 16384));
          offset += 16384;
          setTimeout(push, 5);
        };
        push();
      });
      await new Promise((r) => goodServer.listen(0, '127.0.0.1', r));
      const goodDest = path.join(installerTmp, 'good.exe');
      const progCalls = [];
      let goodErr = null;
      try {
        await installer.downloadFile(`http://127.0.0.1:${goodServer.address().port}/setup.exe`, goodDest, (got, total) => progCalls.push({ got, total }));
      } catch (err) {
        goodErr = err;
      }
      goodServer.close();
      const monotonic = progCalls.every((p, i) => i === 0 || p.got > progCalls[i - 1].got);
      check('installer downloadFile streams + atomic rename', !goodErr && fs.existsSync(goodDest) && fs.statSync(goodDest).size === 262144
        && progCalls.length > 3 && monotonic && !fs.existsSync(`${goodDest}.part`),
        JSON.stringify({ err: goodErr && goodErr.message, calls: progCalls.length }));

      const badServer = http.createServer((_req, res) => { res.writeHead(500); res.end('nope'); });
      await new Promise((r) => badServer.listen(0, '127.0.0.1', r));
      const badDest = path.join(installerTmp, 'bad.exe');
      let badRejected = false;
      try {
        await installer.downloadFile(`http://127.0.0.1:${badServer.address().port}/setup.exe`, badDest, () => {});
      } catch {
        badRejected = true;
      }
      badServer.close();
      check('installer downloadFile failure cleans .part', badRejected && !fs.existsSync(badDest) && !fs.existsSync(`${badDest}.part`));
      fs.rmSync(installerTmp, { recursive: true, force: true });

      // Launcher UI: guide modal, island settings round-trip, install modal.
      const guideState = await win.webContents.executeJavaScript(`(() => {
        openGuide('velazoom');
        const out = {
          visible: document.getElementById('guideModal').classList.contains('visible'),
          steps: document.querySelectorAll('#guideSteps .guide-step').length,
          title: document.getElementById('guideTitle').textContent,
        };
        closeGuide();
        out.closed = !document.getElementById('guideModal').classList.contains('visible');
        return out;
      })()`);
      check('guide modal renders 5 VelaZoom steps', guideState.visible && guideState.closed && guideState.steps === 5 && guideState.title.includes('VelaZoom'), JSON.stringify(guideState));

      const islandUi = await win.webContents.executeJavaScript(`(async () => {
        openIslandSettings(false);
        const visible = document.getElementById('islandModal').classList.contains('visible');
        document.getElementById('islWidgetMedia').setAttribute('aria-pressed', 'false');
        document.getElementById('islOpacity').value = 60;
        document.getElementById('islHotkey').value = 'Ctrl+Shift+I';
        const collected = collectIslandSettings();
        closeIslandSettings();
        await window.launcher.saveConfig({ ...cfg, velaIslandSettings: collected });
        const read = await window.launcher.getConfig();
        await window.launcher.saveConfig({ ...cfg, velaIslandSettings: ISLAND_DEFAULTS });
        const reset = await window.launcher.getConfig();
        return { visible, collected, stored: read.velaIslandSettings, restored: reset.velaIslandSettings };
      })()`);
      check('island settings round-trip to config.json', islandUi.visible
        && islandUi.collected.widgets.media === false && islandUi.collected.opacity === 60 && islandUi.collected.hotkey === 'Ctrl+Shift+I'
        && islandUi.stored.widgets.media === false && islandUi.stored.opacity === 60 && islandUi.stored.hotkey === 'Ctrl+Shift+I'
        && islandUi.restored.widgets.media === true && islandUi.restored.opacity === 90, JSON.stringify(islandUi).slice(0, 200));

      const installUi = await win.webContents.executeJavaScript(`(async () => {
        startInstall({ id: 'smoke', name: 'Smoke App' });
        const out = {
          visible: document.getElementById('installModal').classList.contains('visible'),
          retryHidden: document.getElementById('installRetry').hidden,
        };
        const cancel = await window.launcher.installer.cancel('smoke');
        out.idleCancelOk = cancel.ok === false;
        closeInstall();
        return out;
      })()`);
      check('install modal renders + idle cancel is a no-op', installUi.visible && installUi.retryHidden && installUi.idleCancelOk, JSON.stringify(installUi));
      viewManager.showShell();
    } catch (err) {
      check('smoke crashed', false, err.message);
    }
    const failed = results.some((l) => l.startsWith('FAIL'));
    const out = (msg) => require('fs').writeSync(1, `${msg}\n`);
    out('\n=== SMOKE RESULTS ===');
    for (const line of results) out(line);
    out(failed ? 'SMOKE: FAIL' : 'SMOKE: PASS');
    app.exit(failed ? 1 : 0);
  }

  app.whenReady().then(() => {
    featuresProtocol.serve();
    const vaultSession = session.fromPartition('vela-vault');
    featuresProtocol.serve(vaultSession.protocol, true);
    vaultSession.setPermissionCheckHandler(() => false);
    vaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    registerIpc();
    applyAppearance(config.load().theme);
    createWindow();
    if (SMOKE) {
      win.webContents.on('did-finish-load', () => runSmoke());
    }
    if (process.argv.includes('--shots')) {
      win.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          require('../../scripts/shots').run(win)
            .catch((err) => { console.error(err); return 1; })
            .then((code) => {
              app.exit(code || 0);
            });
        }, 400);
      });
    }
  });

  app.on('window-all-closed', () => {
    if (!SMOKE) app.quit();
  });
}
