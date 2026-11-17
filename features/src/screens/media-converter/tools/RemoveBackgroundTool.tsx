import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DropZone } from '../components/DropZone';
import { ProgressBar } from '../components/ProgressBar';
import { ToolShell } from '../components/ToolShell';
import { downloadBlob } from '../lib/download';
import { getMedia, hasMedia, type ModelsStatus } from '../lib/media-bridge';
import { removeBackgroundClient, type QualityMode } from '../lib/remove-background-client';

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
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [quality, setQuality] = useState<QualityMode>('high');
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelsStatus | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
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
    media.ensureModels('base').then(setModels).catch(() => {});
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
      setDownloadNote(null);
    },
    [setOriginal, setResult],
  );

  const retryModels = async () => {
    if (!hasMedia()) return;
    setModels((prev) => (prev ? { ...prev, downloading: true, error: null } : prev));
    const status = await getMedia().ensureModels('base');
    setModels(status);
  };

  const processImage = async () => {
    if (!file || !hasMedia()) return;

    setIsProcessing(true);
    setProgress('');
    setError(null);
    setDownloadNote(null);

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

  const handleDownload = () => {
    if (!resultBlobRef.current) return;
    downloadBlob(resultBlobRef.current, resultFilename ?? 'image-nobg.png');
    setDownloadNote('Saved to your Downloads folder.');
  };

  const modelsReady = Boolean(models?.baseReady);
  const downloadPct =
    models && models.total > 0 ? (models.downloaded / models.total) * 100 : null;

  return (
    <ToolShell
      eyebrow="Background Remover"
      title="Remove backgrounds*in seconds*"
      description="Cut the subject out of any photo with AI segmentation and edge refinement — right on this computer. Choose between fast processing or high-quality mode with stronger smoothing."
      features={[
        {
          title: 'Two quality modes',
          body: 'Fast uses a quantized model with basic smoothing; High uses full precision with stronger edge refinement.',
        },
        {
          title: 'Transparent PNG output',
          body: 'Download the result as a PNG with a clean alpha channel, ready for compositing.',
        },
        {
          title: 'Stays on this device',
          body: 'Your images never leave this computer. The AI model downloads once, then runs locally from cache.',
        },
      ]}
    >
      <section className="mc-bento p-5 sm:p-6">
        <div className="space-y-6">
          <div
            className="rounded-xl border border-line bg-base px-4 py-3"
            data-testid="models-status"
          >
            {!models && <p className="text-sm text-mut">Checking AI models...</p>}

            {models?.downloading && (
              <ProgressBar
                value={downloadPct}
                label={`Downloading AI models... ${formatMb(models.downloaded)} of ${formatMb(models.total)}`}
              />
            )}

            {models && !models.downloading && models.error && !models.baseReady && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-mut">
                  Couldn&apos;t download the AI models. Check your connection and try
                  again — every other tool still works offline.
                </p>
                <Button variant="secondary" size="sm" onClick={retryModels}>
                  Retry download
                </Button>
              </div>
            )}

            {models && !models.downloading && !models.error && models.baseReady && (
              <p className="text-sm text-mut">
                Models ready — processing stays on this device.
              </p>
            )}
          </div>

          <div>
            <p id="bg-quality-label" className="mc-label">
              Quality mode
            </p>
            <div role="group" aria-labelledby="bg-quality-label" className="inline-flex gap-1 rounded-xl border border-line bg-base p-1">
              <button
                type="button"
                onClick={() => setQuality('fast')}
                aria-pressed={quality === 'fast'}
                disabled={isProcessing}
                className={`min-h-8 rounded-lg px-4 text-sm font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed ${
                  quality === 'fast'
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-mut hover:bg-hover hover:text-ink'
                }`}
              >
                Fast
              </button>
              <button
                type="button"
                onClick={() => setQuality('high')}
                aria-pressed={quality === 'high'}
                disabled={isProcessing}
                className={`min-h-8 rounded-lg px-4 text-sm font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed ${
                  quality === 'high'
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-mut hover:bg-hover hover:text-ink'
                }`}
              >
                High quality
              </button>
            </div>
            <p className="mt-2 text-xs text-mut">
              {quality === 'fast'
                ? 'Quantized model for faster processing with basic edge smoothing.'
                : models?.highReady
                  ? 'Full-precision model with stronger edge smoothing for cleaner results.'
                  : 'Full-precision model with stronger edge smoothing. High quality downloads an additional 176 MB model on first use.'}
            </p>
          </div>

          {!file && (
            <DropZone
              files={[]}
              onFilesChange={handleFilesChange}
              accept={PHOTO_ACCEPT}
              dropLabel="Drag and drop an image here"
              activeDropLabel="Drop to start"
              hintLabel="Click to browse — JPG, PNG, WebP."
            />
          )}

          {file && originalUrl && (
            <div>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg leading-6 font-semibold text-ink">
                    {file.name}
                  </h3>
                  <p className="text-xs font-medium tabular-nums text-mut">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFilesChange([])}
                  disabled={isProcessing}
                >
                  Clear
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">Original</p>
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-base">
                    <img
                      src={originalUrl}
                      alt="Original"
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">Result</p>
                  <div
                    className={`relative aspect-video overflow-hidden rounded-xl border border-line ${resultUrl ? '' : 'bg-base'}`}
                    style={
                      resultUrl
                        ? { backgroundImage: `url(${CHECKERBOARD})` }
                        : undefined
                    }
                  >
                    {resultUrl ? (
                      <img
                        src={resultUrl}
                        alt="Result"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="text-sm text-mut">
                          {isProcessing ? progress || 'Processing...' : 'Not processed yet'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {!resultUrl ? (
                  <Button
                    onClick={processImage}
                    disabled={isProcessing || !modelsReady}
                    loading={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Remove background'}
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleDownload}>
                      Download transparent PNG
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setResult(null);
                        resultBlobRef.current = null;
                        setResultFilename(null);
                        setProgress('');
                        setError(null);
                        setDownloadNote(null);
                      }}
                    >
                      Re-process
                    </Button>
                  </>
                )}
              </div>

              {isProcessing && (
                <div className="mt-5">
                  <ProgressBar label={progress || 'Processing...'} />
                </div>
              )}

              {error && (
                <div className="mt-4">
                  <Alert tone="error">{error}</Alert>
                </div>
              )}

              {downloadNote && (
                <div className="mt-4">
                  <Alert tone="success">{downloadNote}</Alert>
                </div>
              )}

              {resultUrl && !isProcessing && (
                <p className="mt-4 text-center text-xs font-medium text-mut">
                  Processed locally with
                  {quality === 'fast'
                    ? ' basic edge smoothing'
                    : ' AI-powered edge refinement'}
                  .
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </ToolShell>
  );
}