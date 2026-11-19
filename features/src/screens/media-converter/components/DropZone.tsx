import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { FileIcon, UploadIcon } from '../icons';

interface DropZoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept: Accept;
  dropLabel?: string;
  activeDropLabel?: string;
  hintLabel?: string;
  multiple?: boolean;
  disabled?: boolean;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PREVIEWABLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
]);

function isPreviewable(file: File): boolean {
  return PREVIEWABLE_TYPES.has(file.type);
}

export function DropZone({
  files,
  onFilesChange,
  accept,
  dropLabel = 'Drag and drop files here',
  activeDropLabel = 'Drop your files here',
  hintLabel,
  multiple = true,
  disabled = false,
}: DropZoneProps) {
  const [previewUrls, setPreviewUrls] = useState<(string | null)[]>([]);
  const zoneRef = useRef<HTMLDivElement>(null);
  const nativeDropFiles = useRef<File[]>([]);

  useEffect(() => {
    const urls = files.map((file) => isPreviewable(file) ? URL.createObjectURL(file) : null);
    setPreviewUrls(urls);
    return () => urls.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, [files]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // react-dropzone rebuilds dropped Files via getAsFile(), which strips the
      // native path Electron's webUtils needs. Swap the originals back in.
      const originals = nativeDropFiles.current;
      nativeDropFiles.current = [];
      const resolved = acceptedFiles.map((file) => {
        const index = originals.findIndex(
          (original) =>
            original.name === file.name &&
            original.size === file.size &&
            original.lastModified === file.lastModified,
        );
        return index < 0 ? file : originals.splice(index, 1)[0];
      });
      if (resolved.length) onFilesChange(multiple ? [...files, ...resolved] : resolved);
    },
    [files, multiple, onFilesChange],
  );

  const { getRootProps, getInputProps, isDragActive, open, fileRejections } = useDropzone({
    onDrop,
    accept,
    multiple,
    disabled,
    noClick: true,
    noKeyboard: true,
  });

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
  };

  const clearFiles = () => {
    onFilesChange([]);
  };

  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key.toLowerCase() !== 'o' || disabled ||
          !zoneRef.current || zoneRef.current.closest('[hidden]')) return;
      event.preventDefault();
      open();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, open]);

  return (
    <div ref={zoneRef} className="space-y-3">
      <div {...getRootProps()}
        onDropCapture={(event) => {
          nativeDropFiles.current = Array.from(event.dataTransfer?.files ?? []);
        }}
        className={`mc-file-intake ${isDragActive ? 'mc-file-intake-active' : ''}`}>
        <input {...getInputProps()} />
        <button className="mc-add-files" type="button" disabled={disabled} onClick={open}>
          <UploadIcon aria-hidden className="h-4 w-4" />
          {multiple ? 'Add files' : 'Add image'}
        </button>
        <div>
          <p className="text-sm text-ink">{isDragActive ? activeDropLabel : dropLabel}</p>
          {hintLabel && <p className="mt-0.5 text-xs text-mut">{hintLabel}</p>}
        </div>
      </div>
      {fileRejections.length > 0 && (
        <p className="text-sm text-danger-fg" role="alert">
          {fileRejections[0].file.name}: {fileRejections[0].errors.some((error) => error.code === 'too-many-files')
            ? 'Add one image at a time.' : 'This file type is not supported.'}
        </p>
      )}

      {files.length > 0 && (
        <div className="mc-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">
              {files.length} file{files.length === 1 ? '' : 's'}
              <span className="ml-2 text-xs font-medium tabular-nums text-mut">
                {formatFileSize(totalBytes)}
              </span>
            </p>
            <button
              type="button"
              onClick={clearFiles}
              disabled={disabled}
              className="min-h-8 rounded-lg px-3 text-sm font-medium text-mut transition-colors duration-[120ms] hover:bg-hover hover:text-ink"
            >
              Clear all
            </button>
          </div>

          <ul aria-label="Selected files" className="grid gap-1.5">
            {files.map((file, index) => {
              const url = previewUrls[index] ?? null;
              const previewable = url !== null;

              return (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-line bg-base p-2"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface">
                    {previewable ? (
                      file.type.startsWith('video/') ? (
                        <video
                          src={url}
                          muted
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <FileIcon aria-hidden className="h-5 w-5 text-mut" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {file.name}
                    </p>
                    <p className="text-xs font-medium tabular-nums text-mut">
                      {formatFileSize(file.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={disabled}
                    aria-label={`Remove ${file.name}`}
                    className="min-h-8 shrink-0 rounded-lg px-3 text-xs font-medium text-mut transition-colors duration-[120ms] hover:bg-hover hover:text-ink"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
