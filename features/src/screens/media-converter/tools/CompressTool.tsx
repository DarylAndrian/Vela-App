import { useMemo, useState } from 'react';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DropZone } from '../components/DropZone';
import { ProgressBar } from '../components/ProgressBar';
import { ToolShell } from '../components/ToolShell';
import {
  COMPRESS_LARGE_FILE_BYTES,
  compressFilesToZip,
  compressSingleFile,
  hasLargeFiles,
  type CompressFormatPreference,
} from '../lib/client-compress';
import { outputName, saveOutput } from '../lib/save-output';
import { RevealOutput } from '../../../components/RevealOutput';
import { IMAGE_ACCEPT } from '../lib/media-accept';
import { COMPRESS_DEFAULT_TARGET_BYTES } from '../lib/compress-defaults';
import { useMediaActivity } from '../lib/use-media-activity';

type SizeUnit = 'kb' | 'mb';

const FORMAT_OPTIONS: { value: CompressFormatPreference; label: string }[] = [
  { value: 'keep', label: 'Keep original' },
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'gif', label: 'GIF' },
];

const SIZE_PRESETS: { label: string; kilobytes: number }[] = [
  { label: '500 KB', kilobytes: 500 },
  { label: '1 MB', kilobytes: 1024 },
  { label: '1.5 MB', kilobytes: 1536 },
  { label: '2 MB', kilobytes: 2048 },
  { label: '5 MB', kilobytes: 5120 },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function bytesForInput(value: number, unit: SizeUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    return COMPRESS_DEFAULT_TARGET_BYTES;
  }
  return Math.floor(value * (unit === 'mb' ? 1024 * 1024 : 1024));
}

function inputValueForBytes(bytes: number, unit: SizeUnit): number {
  return unit === 'mb'
    ? Math.round((bytes / (1024 * 1024)) * 100) / 100
    : Math.round(bytes / 1024);
}

const FIELD_CLASSES = 'mc-input';

export function CompressTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<CompressFormatPreference>('keep');
  const [sizeValue, setSizeValue] = useState<number>(() =>
    inputValueForBytes(COMPRESS_DEFAULT_TARGET_BYTES, 'mb'),
  );
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('mb');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ path: string; detail: string } | null>(null);

  const targetBytes = useMemo(
    () => bytesForInput(sizeValue, sizeUnit),
    [sizeValue, sizeUnit],
  );

  const clientOptions = useMemo(
    () => ({ targetBytes, format }),
    [targetBytes, format],
  );

  const sizeWarning = useMemo(() => {
    if (files.length === 0 || !hasLargeFiles(files)) {
      return null;
    }
    return `One or more files exceed ${Math.floor(
      COMPRESS_LARGE_FILE_BYTES / (1024 * 1024),
    )} MB. Very large images can use a lot of memory and may take a while to process.`;
  }, [files]);

  const canConvert = files.length > 0 && !loading;
  useMediaActivity('compress', loading);

  const handlePresetClick = (kilobytes: number) => {
    if (kilobytes >= 1024) {
      setSizeUnit('mb');
      setSizeValue(Math.round((kilobytes / 1024) * 100) / 100);
    } else {
      setSizeUnit('kb');
      setSizeValue(kilobytes);
    }
  };

  const handleConvert = async () => {
    if (!canConvert) {
      return;
    }

    setLoading(true);
    setProgress(null);
    setError(null);
    setSaved(null);

    try {
      if (files.length === 1) {
        const { blob, filename } = await compressSingleFile(
          files[0],
          clientOptions,
        );
        const path = await saveOutput(blob, filename);
        if (!path) return;
        const ratio = Math.max(
          0,
          Math.round(((files[0].size - blob.size) / files[0].size) * 100),
        );
        setSaved({ path, detail: `${formatSize(files[0].size)} → ${formatSize(blob.size)}, ${ratio}% smaller` });
      } else {
        setProgress({ completed: 0, total: files.length });
        const zipBlob = await compressFilesToZip(
          files,
          clientOptions,
          (completed, total) => {
            setProgress({ completed, total });
          },
        );
        const path = await saveOutput(zipBlob, 'compressed-images.zip');
        if (path) setSaved({ path, detail: `${files.length} images` });
      }
    } catch (convertError) {
      setError(
        convertError instanceof Error
          ? convertError.message
          : 'Something went wrong during compression.',
      );
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const buttonLabel = (() => {
    if (loading) {
      if (progress) {
        return `Compressing ${progress.completed}/${progress.total}...`;
      }
      return 'Compressing...';
    }
    return 'Compress and save';
  })();

  const currentPresetMatch = SIZE_PRESETS.find((preset) => {
    const presetBytes = preset.kilobytes * 1024;
    return Math.abs(presetBytes - targetBytes) < 1024;
  });

  return (
    <ToolShell settings={
      <>
          <div className="mb-4 grid gap-4">
            <div>
              <label
                htmlFor="compress-output-format"
                className="mc-label"
              >
                Output format
              </label>
              <select
                id="compress-output-format"
                value={format}
                disabled={loading}
                onChange={(event) =>
                  setFormat(event.target.value as CompressFormatPreference)
                }
                className={FIELD_CLASSES}
              >
                {FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="compress-target-size"
                className="mc-label"
              >
                Target size
              </label>
              <div className="flex gap-2">
                <input
                  id="compress-target-size"
                  type="number"
                  min={1}
                  step={sizeUnit === 'mb' ? 0.1 : 10}
                  value={sizeValue}
                  disabled={loading}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next > 0) {
                      setSizeValue(next);
                    }
                  }}
                  className={FIELD_CLASSES}
                />
                <select
                  aria-label="Size unit"
                  value={sizeUnit}
                  disabled={loading}
                  onChange={(event) => {
                    const nextUnit = event.target.value as SizeUnit;
                    setSizeUnit(nextUnit);
                    setSizeValue(inputValueForBytes(targetBytes, nextUnit));
                  }}
                  className={`${FIELD_CLASSES} w-24 shrink-0`}
                >
                  <option value="kb">KB</option>
                  <option value="mb">MB</option>
                </select>
              </div>
            </div>
          </div>

          <div role="group" aria-labelledby="compress-presets" className="flex flex-wrap items-center gap-2">
            <span id="compress-presets" className="mr-1 text-xs font-medium text-mut">
              Presets
            </span>
            {SIZE_PRESETS.map((preset) => {
              const isActive = currentPresetMatch?.label === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetClick(preset.kilobytes)}
                  aria-pressed={isActive}
                  disabled={loading}
                  className={`min-h-8 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors duration-[120ms] ${
                    isActive
                      ? 'border-accent bg-accent-soft text-accent-text'
                      : 'border-line-strong bg-surface text-mut hover:bg-hover hover:text-ink'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        {files.length > 1 && <p className="mt-3 text-xs text-mut">Batch output is saved as a ZIP.</p>}
      </>
    }
      actions={<Button onClick={handleConvert} disabled={!canConvert} loading={loading}>{buttonLabel}</Button>}
      status={progress && (
        <ProgressBar value={(progress.completed / progress.total) * 100}
          label={`Compressing ${progress.completed} of ${progress.total}`} />
      )}
    >
      <DropZone files={files} onFilesChange={setFiles} accept={IMAGE_ACCEPT} disabled={loading}
        dropLabel="Drag and drop images here" activeDropLabel="Drop your images here"
        hintLabel="JPG, PNG, WebP, TIFF, BMP, GIF, HEIC, HEIF" />
      {sizeWarning && <Alert tone="warning">{sizeWarning}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {saved && (
        <Alert tone="success">Saved {outputName(saved.path)}. {saved.detail}. <RevealOutput path={saved.path} /></Alert>
      )}
    </ToolShell>
  );
}
