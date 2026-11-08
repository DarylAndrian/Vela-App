const { app, net, ipcMain } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

// Mirrors the @imgly/background-removal CDN layout (resources.json + flat
// hash-named chunks) into userData so the renderer can run fully offline
// against app://models. Tier 1 = CPU onnxruntime + quantized model (~56 MB),
// tier 2 adds the full-precision model (~176 MB) on first high-quality run.
const BASE_KEYS = [
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
  '/models/isnet_quint8',
];
const HIGH_KEYS = ['/models/isnet'];

let notify = () => {};
let inflight = null;
let lastEmit = 0;
const state = {
  baseReady: false,
  highReady: false,
  downloading: false,
  downloaded: 0,
  total: 0,
  error: null,
};

function cacheDir() {
  return path.join(app.getPath('userData'), 'models', 'background-removal');
}

function imglyVersion() {
  const candidates = [
    path.join(__dirname, '..', '..', 'features', 'dist', 'media-model-manifest.json'),
    path.join(__dirname, '..', '..', 'features', 'node_modules', '@imgly', 'background-removal', 'package.json'),
  ];
  for (const file of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const version = data.imglyVersion || data.version;
      if (version) return version;
    } catch {}
  }
  throw new Error('Could not determine the background-removal model version.');
}

function cdnBase(version) {
  return `https://staticimgly.com/@imgly/background-removal-data/${version}/dist/`;
}

function snapshot() {
  return {
    ok: !state.error,
    baseReady: state.baseReady,
    highReady: state.highReady,
    downloading: state.downloading,
    downloaded: state.downloaded,
    total: state.total,
    error: state.error,
  };
}

function emit(force = false) {
  const now = Date.now();
  if (!force && now - lastEmit < 200) return;
  lastEmit = now;
  notify('media:models-progress', snapshot());
}

async function syncVersion(version) {
  const dir = cacheDir();
  await fsp.mkdir(dir, { recursive: true });
  const markerPath = path.join(dir, 'cache-state.json');
  let stored = null;
  try {
    stored = JSON.parse(await fsp.readFile(markerPath, 'utf8')).version;
  } catch {}
  if (stored === version) return;
  for (const name of await fsp.readdir(dir)) {
    await fsp.rm(path.join(dir, name), { force: true });
  }
  await fsp.writeFile(markerPath, JSON.stringify({ version }));
}

async function loadManifest(version) {
  const local = path.join(cacheDir(), 'resources.json');
  try {
    const map = JSON.parse(await fsp.readFile(local, 'utf8'));
    if (map && typeof map === 'object' && Object.keys(map).length > 0) return map;
  } catch {}
  const res = await net.fetch(`${cdnBase(version)}resources.json`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Model manifest download failed (HTTP ${res.status}).`);
  const map = await res.json();
  await fsp.writeFile(local, JSON.stringify(map));
  return map;
}

function requiredFiles(map, level) {
  const keys = level >= 2 ? [...BASE_KEYS, ...HIGH_KEYS] : BASE_KEYS;
  const files = [];
  const seen = new Set();
  for (const key of keys) {
    const entry = map[key];
    if (!entry || !Array.isArray(entry.chunks)) {
      throw new Error(`Model manifest is missing ${key}.`);
    }
    for (const chunk of entry.chunks) {
      if (seen.has(chunk.name)) continue;
      seen.add(chunk.name);
      files.push({ name: chunk.name, size: chunk.offsets[1] - chunk.offsets[0] });
    }
  }
  return files;
}

async function downloadChunk(url, dest, expectedSize, onBytes) {
  const tmp = `${dest}.part`;
  try {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`Model chunk download failed (HTTP ${res.status}).`);
    let received = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        onBytes(chunk.length);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(tmp));
    if (received !== expectedSize) {
      throw new Error(`Model chunk size mismatch (expected ${expectedSize}, got ${received}).`);
    }
    await fsp.rename(tmp, dest);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

async function runLevel(level) {
  state.downloading = true;
  state.error = null;
  emit(true);

  const version = imglyVersion();
  await syncVersion(version);
  const map = await loadManifest(version);
  const files = requiredFiles(map, level);
  const dir = cacheDir();

  let doneBytes = 0;
  const missing = [];
  for (const file of files) {
    const dest = path.join(dir, file.name);
    let size = -1;
    try {
      size = (await fsp.stat(dest)).size;
    } catch {}
    if (size === file.size) {
      doneBytes += file.size;
    } else {
      if (size >= 0) await fsp.rm(dest, { force: true });
      missing.push(file);
    }
  }

  state.total = files.reduce((sum, f) => sum + f.size, 0);
  state.downloaded = doneBytes;
  emit(true);

  for (const file of missing) {
    await downloadChunk(
      cdnBase(version) + file.name,
      path.join(dir, file.name),
      file.size,
      (bytes) => {
        state.downloaded += bytes;
        emit();
      },
    );
  }

  state.baseReady = true;
  if (level >= 2) state.highReady = true;
  state.downloading = false;
  emit(true);
}

function ensureReady(level = 1) {
  if (level <= 1 && state.baseReady && !state.error) return Promise.resolve(snapshot());
  if (level >= 2 && state.highReady && !state.error) return Promise.resolve(snapshot());
  if (inflight && inflight.level >= level) return inflight.promise;

  const prev = inflight ? inflight.promise : Promise.resolve();
  const promise = prev
    .then(() => runLevel(level))
    .catch((err) => {
      state.downloading = false;
      state.error = err && err.message ? err.message : String(err);
      emit(true);
    })
    .then(() => snapshot())
    .finally(() => {
      if (inflight && inflight.promise === promise) inflight = null;
    });
  inflight = { level, promise };
  return promise;
}

function prefetch() {
  if (state.baseReady || inflight) return;
  ensureReady(1);
}

function registerIpc(options = {}) {
  if (typeof options.notify === 'function') notify = options.notify;
  ipcMain.handle('media:ensure-models', (_e, tier) => ensureReady(tier === 'high' ? 2 : 1));
  ipcMain.handle('media:models-status', () => snapshot());
}

module.exports = { registerIpc, prefetch, ensureReady, cacheDir };