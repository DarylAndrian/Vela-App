const { app, dialog, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createInterface } = require('node:readline');

const idle = {
  phase: 'idle', actionCount: 0, cycles: 0, repetitions: null,
  elapsedMs: 0, countdown: 0, fileName: null, notice: null, error: null,
};
const filters = [{ name: 'Macro recordings', extensions: ['json'] }];
const supported = process.platform === 'win32';

function registerIpc({ getWindow, getContents, isActive, workspaceUrl, send }) {
  const tracked = new WeakSet();
  let owner;
  let host;
  let nextId = 0;
  let state = idle;
  let pendingOperation;

  function publish(next) {
    const wasActive = state.phase !== 'idle';
    const active = next.phase !== 'idle';
    state = next;
    if (owner && !owner.isDestroyed()) owner.send('macro:state', state);
    if (wasActive !== active) send('service:state', { type: 'macro:activity', active });
  }

  function authorize(event, requireActive = false) {
    const contents = getContents();
    const frame = event.senderFrame;
    if (event.sender !== contents || !frame || frame !== contents.mainFrame ||
      frame.url.split('#')[0] !== workspaceUrl || (requireActive && !isActive())) {
      throw new Error('Open Macro Recorder to use this control.');
    }
    owner = contents;
    if (!tracked.has(contents)) {
      tracked.add(contents);
      contents.once('destroyed', () => disconnect(contents));
      contents.on('render-process-gone', () => disconnect(contents));
      contents.on('did-start-navigation', (details) => {
        if (details.isMainFrame && !details.isSameDocument) disconnect(contents);
      });
    }
  }

  function disconnect(contents) {
    if (contents !== owner) return;
    owner = null;
    const current = host;
    host = null;
    if (current) {
      for (const { reject } of current.requests.values()) reject(new Error('Macro Recorder closed.'));
      current.requests.clear();
      // EOF asks the host to cancel input and release held keys and buttons.
      current.child.stdin.end();
    }
    publish(idle);
  }

  function connect() {
    if (host) return host;
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'VelaMacroHost.exe')
      : path.join(__dirname, '..', '..', 'native', 'macro', 'dist', 'VelaMacroHost.exe');
    const child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const current = { child, requests: new Map() };
    host = current;

    function unavailable(error) {
      if (host !== current) return;
      host = null;
      const message = error?.code === 'ENOENT'
        ? 'The Windows macro engine is missing. Rebuild or reinstall Vela.'
        : 'The Windows macro engine closed. Start a new recording or reopen a saved macro.';
      for (const { reject } of current.requests.values()) reject(new Error(message));
      current.requests.clear();
      child.stdin.end();
      publish({ ...idle, error: message });
    }

    child.on('error', unavailable);
    child.stdin.on('error', unavailable);
    child.once('close', () => unavailable());
    const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
    reader.on('line', (line) => {
      if (host !== current) return;
      let update;
      try { update = JSON.parse(line); } catch { return; }
      publish(update.state);
      const pending = current.requests.get(update.id);
      if (!pending) return;
      current.requests.delete(update.id);
      if (update.failure) pending.reject(new Error(update.failure));
      else pending.resolve();
    });
    return current;
  }

  function request(command, params) {
    if (!supported) throw new Error('Macro Recorder requires Windows.');
    const { child, requests } = connect();
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      requests.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ id, command, ...params }) + '\n');
    });
  }

  ipcMain.handle('macro:status', (event) => {
    authorize(event);
    return { supported, state };
  });

  ipcMain.handle('macro:command', async (event, command, options) => {
    let token;
    try {
      authorize(event, true);
      if (!supported) throw new Error('Macro Recorder requires Windows.');
      if (pendingOperation) throw new Error('Wait for the current macro command to finish.');
      token = pendingOperation = {};

      switch (command) {
        case 'record':
          await request('record', { recordMoves: options?.recordMoves === true });
          break;
        case 'play': {
          const repetitions = options?.repetitions;
          if (!Number.isInteger(repetitions) || repetitions < 0 || repetitions > 2147483647) {
            throw new Error('Enter a whole number from 1 to 2,147,483,647.');
          }
          await request('play', { repetitions });
          break;
        }
        case 'load':
        case 'save': {
          if (state.phase !== 'idle') throw new Error('Stop the current macro first.');
          const result = command === 'load'
            ? await dialog.showOpenDialog(getWindow(), { title: 'Open macro recording', filters, properties: ['openFile'] })
            : await dialog.showSaveDialog(getWindow(), {
              title: 'Save macro recording', filters, defaultPath: state.fileName || 'Vela-recording.json',
            });
          const file = result.filePath || result.filePaths?.[0];
          if (result.canceled || !file) break;
          authorize(event, true);
          await request(command, { path: file });
          break;
        }
        case 'stop':
        case 'clear':
          await request(command);
          break;
        default:
          throw new Error('Unknown macro command.');
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    } finally {
      if (token && pendingOperation === token) pendingOperation = null;
    }
  });
}

module.exports = { registerIpc };
