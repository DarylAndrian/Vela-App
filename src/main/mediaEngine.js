const { app, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

// Native ffmpeg engine. Video/audio jobs reference real file paths and write
// straight to a user-chosen folder, so large media never crosses IPC as bytes.

let ffmpegPath = null;
const activeJobs = new Map();
const rendererJobs = new Map();

function reportActivity(notify) {
  const localCount = Array.from(rendererJobs.values()).reduce((total, modes) => total + modes.size, 0);
  notify('service:state', { type: 'media-activity', count: activeJobs.size + localCount });
}

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

async function publishOutput(temp, outputDir, requestedName, overwrite) {
  if (overwrite) {
    const target = path.join(outputDir, requestedName);
    await fs.promises.rename(temp, target);
    return target;
  }
  const { name, ext } = path.parse(requestedName);
  for (let suffix = 0; ; suffix += 1) {
    const target = path.join(outputDir, suffix ? `${name} (${suffix})${ext}` : requestedName);
    try {
      try {
        await fs.promises.link(temp, target);
      } catch (error) {
        if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error.code)) throw error;
        await fs.promises.copyFile(temp, target, fs.constants.COPYFILE_EXCL);
      }
      return target;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

async function runJob(job, outputDir, jobId, index, total, state, notify, overwrite) {
  const inputPath = job.inputPath;
  if (typeof job.outputName !== 'string' || !job.outputName || path.basename(job.outputName) !== job.outputName) {
    throw new Error('Invalid output name.');
  }
  const target = path.resolve(outputDir, job.outputName);
  if (overwrite && path.resolve(inputPath).toLowerCase() === target.toLowerCase()) {
    throw new Error('Choose a different destination from the source file.');
  }
  const temp = path.join(outputDir, `.vela-${randomUUID()}${path.extname(job.outputName)}`);
  notify('media:job-progress', { jobId, index, total, ratio: -1, name: job.outputName });
  if (!fs.existsSync(inputPath)) throw new Error(`Input file not found: ${path.basename(inputPath)}`);

  const attempt = (mode) => runFfmpeg(buildArgs(job, inputPath, temp, mode), jobId, index, total, job.outputName, state, notify);
  try {
    if (job.kind === 'video' && job.mode === 'remux') {
      try {
        await attempt('remux');
      } catch (err) {
        if (state.canceled) throw err;
        await attempt('reencode');
      }
    } else {
      await attempt(job.kind === 'audio' ? 'extract' : job.mode);
    }
    if (state.canceled) throw new Error('Canceled');
    return await publishOutput(temp, outputDir, job.outputName, overwrite);
  } finally {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
  }
}

async function convert(req, notify, sender) {
  const { jobId, outputDir, jobs, overwrite } = req || {};
  if (!jobId || !outputDir || !Array.isArray(jobs) || jobs.length === 0) {
    return { ok: false, error: 'Invalid conversion request.' };
  }
  if (activeJobs.has(jobId)) return { ok: false, error: 'This job is already running.' };
  if (!ffmpegAvailable()) {
    return { ok: false, error: 'The ffmpeg binary could not be found.' };
  }

  const state = { canceled: false, procs: new Set() };
  activeJobs.set(jobId, state);
  const onDestroyed = () => cancelJob(jobId);
  sender.once('destroyed', onDestroyed);
  reportActivity(notify);
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
        const outputPath = await runJob(job, outputDir, jobId, i, jobs.length, state, notify, overwrite === true && jobs.length === 1);
        results.push({ outputName: path.basename(outputPath), outputPath, ok: true });
      } catch (err) {
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
    sender.removeListener('destroyed', onDestroyed);
    activeJobs.delete(jobId);
    reportActivity(notify);
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

function registerIpc({ notify, getWindow }) {
  ipcMain.on('media:activity', ({ sender }, mode, busy) => {
    if (!['convert', 'compress', 'background'].includes(mode) || typeof busy !== 'boolean') return;
    let modes = rendererJobs.get(sender.id);
    if (!modes) {
      if (!busy) return;
      modes = new Set();
      const id = sender.id;
      rendererJobs.set(id, modes);
      sender.once('destroyed', () => {
        rendererJobs.delete(id);
        reportActivity(notify);
      });
    }
    if (busy) modes.add(mode);
    else modes.delete(mode);
    reportActivity(notify);
  });
  ipcMain.handle('media:ffmpeg-probe', () => ffmpegProbe());
  ipcMain.handle('media:convert', (event, req) => convert(req, notify, event.sender));
  ipcMain.handle('media:cancel-job', (_e, jobId) => cancelJob(jobId));
  ipcMain.handle('media:pick-save', (_e, opts) => pickSave(opts, getWindow));
  ipcMain.handle('media:pick-folder', () => pickFolder(getWindow));
}

module.exports = { registerIpc, ffmpegProbe, ffmpegAvailable, resolveFfmpeg };
