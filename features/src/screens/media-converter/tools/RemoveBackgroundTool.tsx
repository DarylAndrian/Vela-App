import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DropZone } from '../components/DropZone';
import { ProgressBar } from '../components/ProgressBar';
import { ToolShell } from '../components/ToolShell';
import { saveOutput, outputName } from '../lib/save-output';
import { RevealOutput } from '../../../components/RevealOutput';
import { getMedia, hasMedia, type ModelsStatus } from '../lib/media-bridge';
import { removeBackgroundClient, type QualityMode } from '../lib/remove-background-client';
import { useMediaActivity } from '../lib/use-media-activity';

const PHOTO_ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
} as const;

const CHECKERBOARD =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIwLjEiLz4KPHJlY3QgeD0iMTAiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsbD0iIzAwMCIgZmlsbC1vcGFjaXR5PSIwLjEiLz4KPHJlY3QgeT0iMTAiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsbD0iIzAwMCIgZmlsbC1vcGFjaXR5PSIwLjEiLz4KPHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIi8+Cjwvc3ZnPg==';

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function RemoveBackgroundTool() {
  const [file, setFile] = useState<File | null>(null);
  const files = useMemo(() => file ? [file] : [], [file]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [quality, setQuality] = useState<QualityMode>('high');
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelsStatus | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useMediaActivity('background', isProcessing);
  const resultBlobRef = useRef<Blob | null>(null);
  const originalUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const setOriginal = useCallback((url: string | null) => {
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    originalUrlRef.current = url;
    setOriginalUrl(url);
  }, []);

  const setResult = useCallback((url: string | null) => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = url;
    setResultUrl(url);
  }, []);

  useEffect(() => {
    if (!hasMedia()) {
      setModels({
        ok: false,
        baseReady: false,
        highReady: false,
        downloading: false,
        downloaded: 0,
        total: 0,
        error: 'The local media engine is not available in this window.',
      });
      return;
    }
    const media = getMedia();
    const unsub = media.onModelsProgress(setModels);
    void media.modelsStatus().then(setModels).catch(() => {});
    return () => {
      unsub();
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  const handleFilesChange = useCallback(
    (files: File[]) => {
      if (files.length > 0) {
        setFile(files[0]);
        setOriginal(URL.createObjectURL(files[0]));
      } else {
        setFile(null);
        setOriginal(null);
      }
      setResult(null);
      resultBlobRef.current = null;
      setResultFilename(null);
      setProgress('');
      setError(null);
      setSavedPath(null);
    },
    [setOriginal, setResult],
  );

  const processImage = async () => {
    if (!file || !hasMedia()) return;

    setResult(null);
    resultBlobRef.current = null;
    setIsProcessing(true);
    setProgress('');
    setError(null);
    setSavedPath(null);

    try {
      const media = getMedia();
      if (quality === 'high' && !models?.highReady) {
        setProgress('Downloading high-quality model (176 MB, one time only)...');
        const status = await media.ensureModels('high');
        setModels(status);
        if (!status.highReady) {
          throw new Error(status.error || 'The high-quality model could not be downloaded.');
        }
      } else if (!models?.baseReady) {
        const status = await media.ensureModels('base');
        setModels(status);
        if (!status.baseReady) {
          throw new Error(status.error || 'The AI models are not ready yet.');
        }
      }

      const resultBlob = await removeBackgroundClient(file, quality, setProgress);
      resultBlobRef.current = resultBlob;
      setResult(URL.createObjectURL(resultBlob));

      const nameWithoutExt =
        file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setResultFilename(`${nameWithoutExt}-nobg.png`);
      setProgress('Done!');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An error occurred during processing.',
      );
      setProgress('');
    } finally {
      setIsProcessing(false);
    }
  };

  async function saveResult() {
    if (!resultBlobRef.current || saving) return;
    setSaving(true);
    setError(null);
    try {
      const path = await saveOutput(resultBlobRef.current, resultFilename ?? 'image-nobg.png');
      if (path) setSavedPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the image.');
    } finally {
      setSaving(false);
    }
  }

  const downloadPct = models && models.total > 0 ? (models.downloaded / models.total) * 100 : null;
  const busy = isProcessing || saving;
  const modelReady = quality === 'high' ? models?.highReady : models?.baseReady;

  return (
    <ToolShell
      settings={
        <>
          <label htmlFor="bg-quality" className="mc-label">Quality</label>
          <select id="bg-quality" className="mc-input" value={quality} disabled={busy}
            onChange={(event) => setQuality(event.target.value as QualityMode)}>
            <option value="fast">Fast</option>
            <option value="high">High quality</option>
          </select>
          {!modelReady && (
            <p className="mt-3 text-xs text-mut">First use requires a one-time model download.</p>
          )}
        </>
      }
      status={
        <div data-testid="models-status">
          {models?.downloading ? (
            <ProgressBar value={downloadPct} label={`Downloading model · ${formatMb(models.downloaded)} of ${formatMb(models.total)}`} />
          ) : isProcessing ? (
            <ProgressBar label={progress || 'Removing background…'} />
          ) : models?.baseReady ? 'Models ready' : null}
        </div>
      }
      actions={
        <>
          <Button variant={resultUrl ? 'secondary' : 'primary'} onClick={processImage}
            disabled={!file || busy || !hasMedia()} loading={isProcessing}>
            {resultUrl ? 'Reprocess' : 'Remove background'}
          </Button>
          {resultUrl && <Button onClick={saveResult} disabled={busy} loading={saving}>Save PNG…</Button>}
        </>
      }
    >
      <DropZone files={files} onFilesChange={handleFilesChange} accept={PHOTO_ACCEPT}
        multiple={false} disabled={busy} dropLabel="Drag and drop an image here"
        activeDropLabel="Drop your image here" hintLabel="JPG, PNG, WebP" />
      {originalUrl && (
        <div className="grid grid-cols-2 gap-3">
          <figure>
            <figcaption className="mb-1 text-sm text-mut">Original</figcaption>
            <div className="aspect-square overflow-hidden rounded-lg border border-line bg-base">
              <img src={originalUrl} alt="Original" className="h-full w-full object-contain" />
            </div>
          </figure>
          <figure>
            <figcaption className="mb-1 text-sm text-mut">Result</figcaption>
            <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border border-line bg-base"
              style={resultUrl ? { backgroundImage: `url(${CHECKERBOARD})` } : undefined}>
              {resultUrl ? <img src={resultUrl} alt="Background removed" className="h-full w-full object-contain" /> :
                <span className="px-2 text-center text-xs text-mut">{isProcessing ? 'Processing…' : 'Preview appears here'}</span>}
            </div>
          </figure>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {savedPath && <Alert tone="success">Saved {outputName(savedPath)}. <RevealOutput path={savedPath} /></Alert>}
    </ToolShell>
  );
}
