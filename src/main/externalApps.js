const { execFile, spawn } = require('child_process');
const fs = require('fs');
const { shell } = require('electron');

function isRunning(exeName) {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/NH'], (err, stdout) => {
      resolve(!err && stdout.toLowerCase().includes(exeName.toLowerCase()));
    });
  });
}

function trySpawn(exePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', reject);
    child.on('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function launch(svc, cfg) {
  const candidates = [cfg[svc.exeKey], ...svc.candidates].filter(Boolean);
  const existing = candidates.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (!existing.length) {
    const err = new Error(`${svc.exeName} not found. Install it, or use “Locate file…” to point to it.`);
    err.code = 'not-found';
    throw err;
  }

  const running = await isRunning(svc.exeName);
  if (running && svc.skipIfRunning) return { alreadyRunning: true };

  let lastError = null;
  for (const exePath of existing) {
    try {
      await trySpawn(exePath);
      return { alreadyRunning: running, exePath };
    } catch (err) {
      lastError = err;
    }
    const shellError = await shell.openPath(exePath);
    if (!shellError) return { alreadyRunning: running, exePath, viaShell: true };
    lastError = new Error(shellError);
  }
  throw new Error(`Couldn't launch ${svc.exeName} (${lastError ? lastError.message : 'unknown error'}). If Windows blocked this copy, use “Locate file…” to pick another one.`);
}

module.exports = { isRunning, launch };
