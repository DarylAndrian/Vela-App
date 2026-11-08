const { app, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Native ffmpeg engine. Video/audio jobs reference real file paths and write
// straight to a user-chosen folder, so large media never crosses IPC as bytes.

let ffmpegPath = null;
const activeJobs = new Map();

const AUDIO_CODECS = {
  mp3: 'libmp3lame',
  wav: 'pcm_s16le',
  m4a: 'aac',
  ogg: 'libvorbis',
  flac: 'flac',
  opus: 'libopus',
};
const BITRATE_FORMATS = new Set(['mp3', 'm4a', 'ogg', 'opus']);

function resolveFfmpeg() {
  if (ffmpegPath) return ffmpegPath;
  try {
    let p = require('ffmpeg-static');
    if (typeof p === 'string' && app.isPackaged) {
      p = p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    }
    ffmpegPath = p;
  } catch {
    ffmpegPath = null;
  }
  return ffmpegPath;
}

function ffmpegAvailable() {
  const p = resolveFfmpeg();
  return Boolean(p && fs.existsSync(p));
}

function videoCodecArgs(format) {
  if (format === 'webm') return ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'];
  return ['-c:v', 'libx264', '-c:a', 'aac'];
}

function buildArgs(job, inputPath, outputPath, mode) {
  const base = ['-hide_banner', '-nostdin', '-y', '-i', inputPath];
  let mid;
  if (job.kind === 'audio') {
    mid = ['-vn', '-acodec', AUDIO_CODECS[job.format] || 'aac'];
    if (BITRATE_FORMATS.has(job.format)) mid.push('-b:a', '192k');
  } else if (mode === 'remux') {
    mid = ['-c', 'copy'];
  } else {
    mid = videoCodecArgs(job.format);
  }
  return [...base, ...mid, '-progress', 'pipe:1', '-nostats', outputPath];
}

function tailError(stderr) {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.filter((l) => !/^(frame=|fps=|size=|time=|bitrate=|speed=|Duration:|Stream #|Input #|Output #|Metadata:|major_brand|minor_version|compatible_brands|encoder|handler_name)/i.test(l));
  return (meaningful.slice(-2).join(' ') || lines.slice(-1).join(' ') || '').slice(0, 300);
}

function runFfmpeg(args, jobId, index, total, name, state, notify) {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolveFfmpeg(), args, { windowsHide: true });
    state.procs.add(proc);
    let durationSec = null;
    let stderrTail = '';
    let stdoutBuf = '';
    let settled = false;
    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      state.procs.delete(proc);
      fn(val);
    };

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      if (durationSec === null) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m) durationSec = Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]);
      }
    });

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (line.startsWith('out_time_us=')) {
          const us = parseInt(line.slice('out_time_us='.length), 10);
          if (durationSec && durationSec > 0 && Number.isFinite(us)) {
            const ratio = Math.min(1, Math.max(0, us / (durationSec * 1e6)));
            notify('media:job-progress', { jobId, index, total, ratio, name });
          }
        } else if (line === 'progress=end') {
          notify('media:job-progress', { jobId, index, total, ratio: 1, name });
        }
      }
    });

    proc.on('error', (err) => finish(reject, new Error(`ffmpeg failed to start: ${err.message}`)));
    proc.on('close', (code) => {
      if (state.canceled) return finish(reject, new Error('Canceled'));
      if (code === 0) return finish(resolve, { code: 0 });
      finish(reject, new Error(tailError(stderrTail) || `ffmpeg exited with code ${code}.`));
    });
  });
}

async function runJob(job, outputDir, jobId, index, total, state, notify) {
  const inputPath = job.inputPath;
  const outputPath = path.join(outputDir, job.outputName);
  notify('media:job-progress', { jobId, index, total, ratio: -1, name: job.outputName });
  if (!fs.existsSync(inputPath)) throw new Error(`Input file not found: ${path.basename(inputPath)}`);

  const attempt = (mode) => runFfmpeg(buildArgs(job, inputPath, outputPath, mode), jobId, index, total, job.outputName, state, notify);

  if (job.kind === 'video' && job.mode === 'remux') {
    try {
      await attempt('remux');
      return;
    } catch (err) {
      if (state.canceled) throw err;
      // Stream copy failed (codec not supported by the container) -> re-encode.
      fs.rmSync(outputPath, { force: true });
      await attempt('reencode');
      return;
    }
  }

  await attempt(job.kind === 'audio' ? 'extract' : job.mode);
}

async function convert(req, notify) {
  const { jobId, outputDir, jobs } = req || {};
  if (!jobId || !outputDir || !Array.isArray(jobs) || jobs.length === 0) {
    return { ok: false, error: 'Invalid conversion request.' };
  }
  if (!ffmpegAvailable()) {
    return { ok: false, error: 'The ffmpeg binary could not be found.' };
  }

  const state = { canceled: false, procs: new Set() };
  activeJobs.set(jobId, state);
  const results = [];
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      if (state.canceled) {
        results.push({ outputName: job.outputName, ok: false, error: 'Canceled' });
        continue;
      }
      try {
        await runJob(job, outputDir, jobId, i, jobs.length, state, notify);
        results.push({ outputName: job.outputName, ok: true });
      } catch (err) {
        fs.rmSync(path.join(outputDir, job.outputName), { force: true });
        results.push({ outputName: job.outputName, ok: false, error: err.message });
        if (state.canceled) {
          for (let j = i + 1; j < jobs.length; j += 1) {
            results.push({ outputName: jobs[j].outputName, ok: false, error: 'Canceled' });
          }
          break;
        }
      }
    }
    return { ok: results.every((r) => r.ok), results, canceled: state.canceled };
  } finally {
    activeJobs.delete(jobId);
  }
}

function cancelJob(jobId) {
  const state = activeJobs.get(jobId);
  if (!state) return { ok: false };
  state.canceled = true;
  for (const proc of state.procs) {
    try { proc.kill(); } catch { /* already exited */ }
  }
  return { ok: true };
}

function ffmpegProbe() {
  return new Promise((resolve) => {
    if (!ffmpegAvailable()) return resolve({ ok: false, error: 'The ffmpeg binary could not be found.' });
    const proc = spawn(resolveFfmpeg(), ['-version'], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (c) => { out += c.toString(); });
    proc.on('error', (err) => resolve({ ok: false, error: err.message }));
    proc.on('close', () => resolve({ ok: true, version: out.split('\n')[0].trim() }));
  });
}

async function pickSave(opts, getWindow) {
  const result = await dialog.showSaveDialog(getWindow(), {
    defaultPath: opts && opts.defaultName,
    filters: opts && opts.filters,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  return {
    ok: true,
    path: result.filePath,
    dir: path.dirname(result.filePath),
    name: path.basename(result.filePath),
  };
}

async function pickFolder(getWindow) {
  const result = await dialog.showOpenDialog(getWindow(), {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  return { ok: true, dir: result.filePaths[0] };
}

function reveal(target) {
  if (target) shell.showItemInFolder(target);
  return { ok: true };
}

function registerIpc({ notify, getWindow }) {
  ipcMain.handle('media:ffmpeg-probe', () => ffmpegProbe());
  ipcMain.handle('media:convert', (_e, req) => convert(req, notify));
  ipcMain.handle('media:cancel-job', (_e, jobId) => cancelJob(jobId));
  ipcMain.handle('media:pick-save', (_e, opts) => pickSave(opts, getWindow));
  ipcMain.handle('media:pick-folder', () => pickFolder(getWindow));
  ipcMain.handle('media:reveal', (_e, target) => reveal(target));
}

module.exports = { registerIpc, ffmpegProbe, ffmpegAvailable, resolveFfmpeg };