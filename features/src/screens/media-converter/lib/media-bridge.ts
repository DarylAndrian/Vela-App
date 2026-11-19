// Accessor for the local media engine exposed by the Electron main process via
// preload (window.launcher.media). Image conversions shuttle base64 bytes;
// video/audio jobs reference real file paths and write straight to disk.

export interface ImageConvertRequest {
  inputBase64: string;
  inputFormat: string;
  outputFormat: string;
}

export interface ImageCompressRequest {
  inputBase64: string;
  inputFormat: string;
  targetBytes: number;
  format: string;
}

export interface MediaJob {
  inputPath: string;
  outputName: string;
  kind: 'video' | 'audio';
  format: string;
  mode: 'remux' | 'reencode' | 'extract';
}

export interface ConvertRequest {
  jobId: string;
  outputDir: string;
  jobs: MediaJob[];
  overwrite?: boolean;
}

export interface JobProgress {
  jobId: string;
  index: number;
  total: number;
  ratio: number;
  name: string;
}

export interface ModelsStatus {
  ok: boolean;
  baseReady: boolean;
  highReady: boolean;
  downloading: boolean;
  downloaded: number;
  total: number;
  error: string | null;
}

export interface MediaBridge {
  imageConvert(req: ImageConvertRequest): Promise<{ ok: boolean; dataBase64?: string; error?: string }>;
  imageCompress(req: ImageCompressRequest): Promise<{ ok: boolean; dataBase64?: string; extension?: string; error?: string }>;
  ffmpegProbe(): Promise<{ ok: boolean; version?: string; error?: string }>;
  convert(req: ConvertRequest): Promise<{ ok: boolean; canceled?: boolean; results?: { outputName: string; outputPath?: string; ok: boolean; error?: string }[]; error?: string }>;
  cancelJob(jobId: string): Promise<{ ok: boolean }>;
  reportActivity(mode: 'convert' | 'compress' | 'background', busy: boolean): void;
  pickSave(opts: { defaultName: string; filters?: { name: string; extensions: string[] }[] }): Promise<{ ok: boolean; dir?: string; name?: string; path?: string }>;
  pickFolder(): Promise<{ ok: boolean; dir?: string }>;
  ensureModels(tier: 'base' | 'high'): Promise<ModelsStatus>;
  modelsStatus(): Promise<ModelsStatus>;
  onModelsProgress(cb: (status: ModelsStatus) => void): () => void;
  onJobProgress(cb: (p: JobProgress) => void): () => void;
  getPathForFile(file: File): string;
}

export function getMedia(): MediaBridge {
  const media = (window as unknown as { launcher?: { media?: MediaBridge } }).launcher?.media;
  if (!media) {
    throw new Error('The local media engine is not available in this window.');
  }
  return media;
}

export function hasMedia(): boolean {
  return Boolean((window as unknown as { launcher?: { media?: MediaBridge } }).launcher?.media);
}
