const { app, net, ipcMain, shell } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const config = require('./config');
const services = require('./services');

let notify = () => {};
const jobs = new Map();

function installerDir() {
  return path.join(app.getPath('temp'), 'vela-installers');
}

function snapshot(svcId) {
  const job = jobs.get(svcId);
  if (!job) return { id: svcId, phase: 'idle', downloaded: 0, total: 0, error: null };
  return {
    id: svcId,
    phase: job.phase,
    downloaded: job.downloaded,
    total: job.total,
    error: job.error,
  };
}

function emit(svcId, force = false) {
  const job = jobs.get(svcId);
  if (!job) return;
  const now = Date.now();
  if (!force && now - job.lastEmit < 200) return;
  job.lastEmit = now;
  notify('installer:progress', snapshot(svcId));
}

async function downloadFile(url, dest, onBytes, signal) {
  const tmp = `${dest}.part`;
  try {
    const res = await net.fetch(url, { signal });
    if (!res.ok) throw new Error(`Installer download failed (HTTP ${res.status}).`);
    const total = Number(res.headers.get('content-length')) || 0;
    let received = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        onBytes(received, total);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(tmp));
    await fsp.rename(tmp, dest);
    return { received, total };
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

function runInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(installerPath, [], { detached: true, stdio: 'ignore', windowsHide: false });
    } catch (err) {
      reject(err);
      return;
    }
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    child.on('error', async (err) => {
      // spawn itself failed (blocked etc.) — try opening via the shell; we can't
      // track its exit code, so the caller must finish the wizard untracked.
      const shellError = await shell.openPath(installerPath);
      if (!shellError) settle(resolve, { viaShell: true });
      else settle(reject, err);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        settle(resolve, { code });
      } else {
        settle(reject, new Error(`Setup exited with code ${code == null ? 'unknown' : code}. If a Windows permission prompt appeared and you declined it, allow the installer to run and try again.`));
      }
    });
    child.unref();
  });
}

async function start(svcId) {
  const svc = services.byId(svcId);
  if (!svc || !svc.installer) return { ok: false, phase: 'error', error: 'This app has no installer.' };

  const existing = jobs.get(svcId);
  if (existing && (existing.phase === 'downloading' || existing.phase === 'running-installer')) {
    return { ok: false, phase: existing.phase, error: 'Installation already in progress.' };
  }

  const job = {
    phase: 'downloading',
    downloaded: 0,
    total: 0,
    error: null,
    controller: new AbortController(),
    canceled: false,
    lastEmit: 0,
  };
  jobs.set(svcId, job);

  try {
    await fsp.mkdir(installerDir(), { recursive: true });
    const dest = path.join(installerDir(), svc.installer.fileName);
    emit(svcId, true);

    const { received, total } = await downloadFile(
      svc.installer.url,
      dest,
      (got, size) => {
        job.downloaded = got;
        job.total = size;
        emit(svcId);
      },
      job.controller.signal,
    );
    job.downloaded = received;
    job.total = total;
    job.phase = 'running-installer';
    emit(svcId, true);

    const result = await runInstaller(dest);
    if (job.canceled) {
      job.phase = 'canceled';
      emit(svcId, true);
      return { ok: false, phase: 'canceled' };
    }

    job.phase = 'done';
    const installed = services.computeState(svc, config.load()) === 'available';
    emit(svcId, true);
    return { ok: true, phase: 'done', installed, viaShell: !!result.viaShell };
  } catch (err) {
    if (job.canceled || (err && err.name === 'AbortError')) {
      job.phase = 'canceled';
      job.error = null;
      emit(svcId, true);
      return { ok: false, phase: 'canceled' };
    }
    job.phase = 'error';
    job.error = err && err.message ? err.message : String(err);
    emit(svcId, true);
    return { ok: false, phase: 'error', error: job.error };
  }
}

function cancel(svcId) {
  const job = jobs.get(svcId);
  if (!job || (job.phase !== 'downloading' && job.phase !== 'running-installer')) {
    return { ok: false };
  }
  job.canceled = true;
  job.controller.abort();
  return { ok: true };
}

function registerIpc(options = {}) {
  if (typeof options.notify === 'function') notify = options.notify;
  ipcMain.handle('installer:install', (_e, svcId) => start(svcId));
  ipcMain.handle('installer:cancel', (_e, svcId) => cancel(svcId));
  ipcMain.handle('installer:status', (_e, svcId) => snapshot(svcId));
}

module.exports = { registerIpc, start, cancel, snapshot, downloadFile, installerDir };
