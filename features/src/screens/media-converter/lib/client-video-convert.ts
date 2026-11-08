import { normalizeVideoOutputFormat, replaceVideoFileExtension } from './video-formats';
import { resolveEntries, runNativeJobs, type NativeResult } from './native-jobs';
import type { JobProgress } from './media-bridge';

const REMUX_OUTPUT_FORMATS = new Set(['mp4', 'mov', 'mkv']);

export function videoModeFor(format: string): 'remux' | 'reencode' {
  return REMUX_OUTPUT_FORMATS.has(format) ? 'remux' : 'reencode';
}

// Native conversion: real file paths in, outputs written straight to disk by
// the main-process ffmpeg engine. Remux is tried first for mp4/mov/mkv and
// falls back to a re-encode when the codecs don't fit the container.
export async function convertVideos(
  files: File[],
  format: string,
  onProgress: (p: JobProgress) => void,
  jobId: string,
): Promise<NativeResult> {
  const outputFormat = normalizeVideoOutputFormat(format);
  const entries = resolveEntries(files, (file) =>
    replaceVideoFileExtension(file.name, outputFormat),
  );
  return runNativeJobs(entries, 'video', outputFormat, videoModeFor(outputFormat), onProgress, jobId);
}

export const LARGE_VIDEO_WARNING_BYTES = 200 * 1024 * 1024;

export function hasLargeVideos(files: File[]): boolean {
  return files.some((file) => file.size > LARGE_VIDEO_WARNING_BYTES);
}

export type { NativeResult };