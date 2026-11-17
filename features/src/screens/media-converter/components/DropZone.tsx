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
  hintLabel = 'or click to browse.',
}: DropZoneProps) {
  const [previewUrls, setPreviewUrls] = useState<(string | null)[]>([]);
  const nativeDropFiles = useRef<File[]>([]);

  useEffect(() => {
    let cancelled = false;
    const readers: FileReader[] = [];
    const objectUrls: string[] = [];

    setPreviewUrls(files.map(() => null));

    files.forEach((file, index) => {
      if (!isPreviewable(file)) {
        return;
      }

      // Videos can be hundreds of MB — stream the preview from an object URL
      // instead of reading the whole file into a base64 data URL.
      if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        setPreviewUrls((prev) => {
          const next = [...prev];
          next[index] = url;
          return next;
        });
        return;
      }

      const reader = new FileReader();
      readers.push(reader);
      reader.onload = () => {
        if (cancelled) {
          return;
        }
        const result = typeof reader.result === 'string' ? reader.result : null;
        setPreviewUrls((prev) => {
          const next = [...prev];
          next[index] = result;
          return next;
        });
      };
      reader.readAsDataURL(file);
    });

    return () => {
      cancelled = true;
      readers.forEach((reader) => reader.abort());
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // react-dropzone rebuilds dropped Files via getAsFile(), which strips the
      // native path Electron's webUtils needs. Swap the originals back in.
      const originals = nativeDropFiles.current;
      nativeDropFiles.current = [];
      const resolved = acceptedFiles.map((file) => {
        const match = originals.find(
          (original) =>
            original.name === file.name &&
            original.size === file.size &&
            original.lastModified === file.lastModified,
        );
        return match ?? file;
      });
      onFilesChange([...files, ...resolved]);
    },
    [files, onFilesChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple: true,
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

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        onDropCapture={(event) => {
          nativeDropFiles.current = Array.from(event.dataTransfer?.files ?? []);
        }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-[180ms] ${
          isDragActive
            ? 'border-accent bg-accent-soft'
            : 'border-line-strong bg-surface hover:border-accent hover:bg-hover'
        }`}
      >
        <input {...getInputProps()} />
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <UploadIcon aria-hidden className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">
              {isDragActive ? activeDropLabel : dropLabel}
            </p>
            <p className="mt-1 text-sm text-mut">{hintLabel}</p>
          </div>
        </div>
      </div>

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
              className="min-h-8 rounded-lg px-3 text-sm font-medium text-mut transition-colors duration-[120ms] hover:bg-hover hover:text-ink"
            >
              Clear all
            </button>
          </div>

          <ul aria-label="Selected files" className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
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