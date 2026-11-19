import type JSZip from 'jszip';

export function addZipOutput(zip: JSZip, filename: string, blob: Blob) {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  let name = filename;
  for (let suffix = 1; zip.file(name); suffix += 1) {
    name = `${stem} (${suffix})${extension}`;
  }
  zip.file(name, blob);
}
