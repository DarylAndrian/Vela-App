import { useEffect, useMemo, useRef, useState } from 'react';
import type { Accept } from 'react-dropzone';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DropZone } from '../components/DropZone';
import { ProgressBar } from '../components/ProgressBar';
import { ToolShell } from '../components/ToolShell';
import { RevealOutput } from '../../../components/RevealOutput';
import { getMedia, type JobProgress } from '../lib/media-bridge';
import type { NativeResult } from '../lib/native-jobs';

interface NativeMediaToolProps {
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
  formats,
  defaultFormat,
  accept,
  selectId,
  verb,
  hasLargeFiles,
  convert,
}: NativeMediaToolProps) {
  const verbIng = verb === 'Extract' ? 'Extracting' : 'Converting';
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<string>(defaultFormat);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; outputPath: string } | null>(null);
  const [canceled, setCanceled] = useState(false);
  const [engine, setEngine] = useState<EngineState>('probing');
  const jobIdRef = useRef<string | null>(null);

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

  const handleConvert = async () => {
    if (!canConvert) return;

    const jobId = crypto.randomUUID();
    jobIdRef.current = jobId;
    setLoading(true);
    setProgress(null);
    setError(null);
    setSuccess(null);
    setCanceled(false);

    try {
      const result = await convert(files, format, setProgress, jobId);

      if (result.canceled) setCanceled(true);
      if (!result.ok && !result.canceled && !result.results?.length) {
        setError(result.error ?? 'Something went wrong during conversion.');
        return;
      }

      const results = result.results ?? [];
      const failed = results.filter((entry) => !entry.ok && entry.error !== 'Canceled');
      const savedCount = results.filter((entry) => entry.ok).length;

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
        setSuccess({ message, outputPath: result.outputPath ?? result.outputDir ?? '' });
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
    <ToolShell
      settings={
        <>
          <label htmlFor={selectId} className="mc-label">Output format</label>
          <select id={selectId} value={format} disabled={loading}
            onChange={(event) => setFormat(event.target.value)} className="mc-input">
            {formats.map((option) => (
              <option key={option} value={option}>{option.toUpperCase()}</option>
            ))}
          </select>
          {files.length > 1 && <p className="mt-3 text-xs text-mut">Choose a folder for the output files.</p>}
        </>
      }
      status={progress ? <ProgressBar value={barValue} label={barLabel} /> : null}
      actions={
        <>
          {loading && <Button variant="secondary" onClick={handleCancel}>Cancel</Button>}
          <Button onClick={handleConvert} disabled={!canConvert} loading={loading}>
            {buttonLabel}
          </Button>
        </>
      }
    >
      <DropZone files={files} onFilesChange={setFiles} accept={accept} disabled={loading}
        dropLabel="Drag and drop videos here" activeDropLabel="Drop your videos here" />
      {sizeWarning && <Alert tone="warning">{sizeWarning}</Alert>}
      {engine === 'missing' && (
        <Alert tone="error">The local video engine (ffmpeg) could not be found. Try reinstalling the app.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {canceled && <Alert tone="info">Conversion canceled.</Alert>}
      {success && (
        <Alert tone="success">{success.message} {success.outputPath && <RevealOutput path={success.outputPath} />}</Alert>
      )}
    </ToolShell>
  );
}
