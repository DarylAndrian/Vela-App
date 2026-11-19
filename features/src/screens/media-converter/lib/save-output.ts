import { vela } from '../../../lib/ipc';
import { fileToBase64 } from './blob-base64';

export async function saveOutput(blob: Blob, filename: string): Promise<string | null> {
  const extension = filename.split('.').at(-1) || 'png';
  const filters = [{ name: `${extension.toUpperCase()} file`, extensions: [extension] }];
  return vela().files.save(filename, filters, await fileToBase64(blob));
}

export function outputName(path: string): string {
  return path.split(/[\\/]/).at(-1) || path;
}
