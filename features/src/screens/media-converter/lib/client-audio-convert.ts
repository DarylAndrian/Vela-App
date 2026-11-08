import { normalizeAudioOutputFormat, replaceAudioFileExtension } from './audio-formats';
import { resolveEntries, runNativeJobs, type NativeResult } from './native-jobs';
import type { JobProgress } from './media-bridge';

// Extracts audio from video files using the main-process ffmpeg engine.
// Outputs are written straight to the chosen disk location.
export async function convertVideosToAudio(
  files: File[],
  format: string,
  onProgress: (p: JobProgress) => void,
  jobId: string,
): Promise<NativeResult> {
  const outputFormat = normalizeAudioOutputFormat(format);
  const entries = resolveEntries(files, (file) =>
    replaceAudioFileExtension(file.name, outputFormat),
  );
  return runNativeJobs(entries, 'audio', outputFormat, 'extract', onProgress, jobId);
}

export const LARGE_VIDEO_WARNING_BYTES = 200 * 1024 * 1024;

export function hasLargeVideos(files: File[]): boolean {
  return files.some((file) => file.size > LARGE_VIDEO_WARNING_BYTES);
}

export type { NativeResult };