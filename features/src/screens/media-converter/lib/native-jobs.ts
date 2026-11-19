import { getMedia, type JobProgress, type MediaJob } from './media-bridge';

export interface NativeResult {
  ok: boolean;
  canceled?: boolean;
  outputDir?: string;
  outputPath?: string;
  results?: { outputName: string; outputPath?: string; ok: boolean; error?: string }[];
  error?: string;
}

export interface NativeEntry {
  inputPath: string;
  outputName: string;
}

function stem(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

// Picks a save location (file for a single job, folder for a batch), then runs
// the jobs in the main process. Outputs are written straight to disk.
export async function runNativeJobs(
  entries: NativeEntry[],
  kind: 'video' | 'audio',
  format: string,
  mode: MediaJob['mode'],
  onProgress: (p: JobProgress) => void,
  jobId: string,
): Promise<NativeResult> {
  const media = getMedia();

  let outputDir: string;
  let singleName: string | null = null;
  let overwrite = false;

  if (entries.length === 1) {
    const save = await media.pickSave({
      defaultName: entries[0].outputName,
      filters: [{ name: kind === 'video' ? 'Video' : 'Audio', extensions: [format] }],
    });
    if (!save.ok || !save.dir) return { ok: false, canceled: true };
    outputDir = save.dir;
    // Force the target extension so ffmpeg picks the right container/codec.
    singleName = `${stem(save.name ?? entries[0].outputName)}.${format}`;
    overwrite = singleName.toLowerCase() === save.name?.toLowerCase();
  } else {
    const folder = await media.pickFolder();
    if (!folder.ok || !folder.dir) return { ok: false, canceled: true };
    outputDir = folder.dir;
  }

  const jobs: MediaJob[] = entries.map((entry) => ({
    inputPath: entry.inputPath,
    outputName: singleName ?? entry.outputName,
    kind,
    format,
    mode,
  }));

  const unsubscribe = media.onJobProgress((p) => {
    if (p.jobId === jobId) onProgress(p);
  });

  try {
    const result = await media.convert({ jobId, outputDir, jobs, overwrite });
    return { ...result, outputDir, outputPath: jobs.length === 1 ? result.results?.[0]?.outputPath : undefined };
  } finally {
    unsubscribe();
  }
}

export function resolveEntries(
  files: File[],
  makeOutputName: (file: File) => string,
): NativeEntry[] {
  const media = getMedia();
  return files.map((file) => {
    const inputPath = media.getPathForFile(file);
    if (!inputPath) {
      throw new Error(`Couldn't read the file path for ${file.name}. Try adding it again.`);
    }
    return { inputPath, outputName: makeOutputName(file) };
  });
}
