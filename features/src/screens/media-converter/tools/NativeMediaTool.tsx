import { useEffect, useMemo, useRef, useState } from 'react';
import type { Accept } from 'react-dropzone';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DropZone } from '../components/DropZone';
import { ProgressBar } from '../components/ProgressBar';
import { ToolShell } from '../components/ToolShell';
import { getMedia, type JobProgress } from '../lib/media-bridge';
import type { NativeResult } from '../lib/native-jobs';

interface Feature {
  title: string;
  body: string;
}

interface NativeMediaToolProps {
  eyebrow: string;
  title: string;
  description: string;
  features: Feature[];
  formats: readonly string[];
  defaultFormat: string;
  accept: Accept;
  selectId: string;
  verb: 'Convert' | 'Extract';
  hasLargeFiles: (files: File[]) => boolean;
  convert: (
    files: File[],
    format: string,
    onProgress: (p: JobProgress) => void,
    jobId: string,
  ) => Promise<NativeResult>;
}

type EngineState = 'probing' | 'ready' | 'missing';

export function NativeMediaTool({
  eyebrow,
  title,
  description,
  features,
  formats,
  defaultFormat,
  accept,
  selectId,
  verb,
  hasLargeFiles,
  convert,
}: NativeMediaToolProps) {
  const verbIng = `${verb}ing`;
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<string>(defaultFormat);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; outputDir: string } | null>(null);
  const [canceled, setCanceled] = useState(false);
  const [engine, setEngine] = useState<EngineState>('probing');
  const jobIdRef = useRef<string | null>(null);
  const jobCounter = useRef(0);

  useEffect(() => {
    let active = true;
    try {
      getMedia()
        .ffmpegProbe()
        .then((probe) => {
          if (active) setEngine(probe.ok ? 'ready' : 'missing');
        })
        .catch(() => {
          if (active) setEngine('missing');
        });
    } catch {
      setEngine('missing');
    }
    return () => {
      active = false;
    };
  }, []);

  const sizeWarning = useMemo(() => {
    if (files.length === 0 || !hasLargeFiles(files)) return null;
    return 'One or more videos exceed 200 MB. Large files are streamed straight to disk, but conversion will take longer.';
  }, [files, hasLargeFiles]);

  const canConvert = files.length > 0 && !loading && engine === 'ready';

  const summary = useMemo(() => {
    if (engine === 'probing') return 'Checking the local video engine...';
    if (engine === 'missing') return 'The local video engine is unavailable.';
    if (files.length === 0) {
      return 'Add one or more videos to get started. Files are processed on your computer and never uploaded.';
    }

    const action = verb === 'Extract' ? 'extract audio from' : 'convert';
    const target = verb === 'Extract' ? `as ${format.toUpperCase()}` : `to ${format.toUpperCase()}`;

    if (files.length === 1) {
      return `Ready to ${action} ${files[0].name} ${target}. You'll choose where to save the output.`;
    }

    return `Ready to ${action} ${files.length} videos ${target}. Outputs are saved straight to a folder you choose — each video is processed one at a time.`;
  }, [engine, files, format, verb]);

  const handleConvert = async () => {
    if (!canConvert) return;

    const jobId = `media-${Date.now()}-${(jobCounter.current += 1)}`;
    jobIdRef.current = jobId;
    setLoading(true);
    setProgress(null);
    setError(null);
    setSuccess(null);
    setCanceled(false);

    try {
      const result = await convert(files, format, setProgress, jobId);

      if (result.canceled) {
        setCanceled(true);
        return;
      }

      if (!result.ok) {
        setError(result.error ?? 'Something went wrong during conversion.');
        return;
      }

      const results = result.results ?? [];
      const failed = results.filter((entry) => !entry.ok);
      const savedCount = results.length - failed.length;

      if (failed.length > 0) {
        setError(
          failed
            .map((entry) => `${entry.outputName}: ${entry.error ?? 'conversion failed'}`)
            .join(' '),
        );
      }

      if (savedCount > 0) {
        const message =
          files.length === 1
            ? `Saved ${results[0]?.outputName ?? 'the file'}.`
            : `Saved ${savedCount} of ${files.length} files.`;
        setSuccess({ message, outputDir: result.outputDir ?? '' });
      }
    } catch (convertError) {
      setError(
        convertError instanceof Error
          ? convertError.message
          : 'Something went wrong during conversion.',
      );
    } finally {
      setLoading(false);
      setProgress(null);
      jobIdRef.current = null;
    }
  };

  const handleCancel = () => {
    if (jobIdRef.current) {
      void getMedia().cancelJob(jobIdRef.current);
    }
  };

  const handleReveal = () => {
    if (success?.outputDir) {
      void getMedia().reveal(success.outputDir);
    }
  };

  const barValue =
    progress === null
      ? null
      : progress.total === 1
        ? progress.ratio < 0
          ? null
          : progress.ratio * 100
        : ((progress.index + Math.min(Math.max(progress.ratio, 0), 1)) / progress.total) * 100;

  const barLabel =
    progress === null
      ? verbIng
      : progress.total === 1
        ? verb === 'Extract'
          ? `Extracting from ${progress.name}`
          : `Converting ${progress.name}`
        : `${verbIng} ${progress.index + 1} of ${progress.total}`;

  const buttonLabel = (() => {
    if (engine === 'probing') return 'Checking engine...';
    if (engine === 'missing') return 'Engine unavailable';
    if (loading) {
      if (progress) {
        if (progress.total === 1) {
          return progress.ratio < 0
            ? `${verbIng}...`
            : `${verbIng} ${Math.round(progress.ratio * 100)}%...`;
        }
        return `${verbIng} ${progress.index + 1}/${progress.total}...`;
      }
      return `${verbIng}...`;
    }
    return verb === 'Extract' ? 'Extract and save' : 'Convert and save';
  })();

  return (
    <ToolShell eyebrow={eyebrow} title={title} description={description} features={features}>
      <section className="mc-bento p-5 sm:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="sm:max-w-sm">
            <label htmlFor={selectId} className="mc-label">
              Output format
            </label>
            <select
              id={selectId}
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              className="mc-input"
            >
              {formats.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {loading && (
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            <Button onClick={handleConvert} disabled={!canConvert} loading={loading && engine === 'ready'}>
              {buttonLabel}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <DropZone
            files={files}
            onFilesChange={setFiles}
            accept={accept}
            dropLabel="Drag and drop videos here"
            activeDropLabel="Drop your videos here"
            hintLabel="Click to browse — MP4, MOV, AVI, MKV, WEBM."
          />

          {progress && <ProgressBar value={barValue} label={barLabel} />}

          <p className="text-sm leading-5 text-mut">{summary}</p>

          {sizeWarning && <Alert tone="warning">{sizeWarning}</Alert>}

          {engine === 'missing' && (
            <Alert tone="error">
              The local video engine (ffmpeg) could not be found. Try reinstalling the app.
            </Alert>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          {canceled && <Alert tone="info">Conversion canceled.</Alert>}

          {success && (
            <Alert tone="success">
              {success.message}
              {success.outputDir && (
                <button
                  type="button"
                  onClick={handleReveal}
                  className="ml-2 font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  Show in folder
                </button>
              )}
            </Alert>
          )}
        </div>
      </section>
    </ToolShell>
  );
}