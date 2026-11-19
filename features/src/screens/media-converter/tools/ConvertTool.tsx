import { useState } from 'react';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DropZone } from '../components/DropZone';
import { ProgressBar } from '../components/ProgressBar';
import { ToolShell } from '../components/ToolShell';
import { convertFilesToZip, convertSingleFile } from '../lib/client-convert';
import { outputName, saveOutput } from '../lib/save-output';
import { RevealOutput } from '../../../components/RevealOutput';
import { OUTPUT_FORMATS } from '../lib/formats';
import { IMAGE_ACCEPT } from '../lib/media-accept';
import { useMediaActivity } from '../lib/use-media-activity';

const FORMAT_OPTIONS = OUTPUT_FORMATS.map((format) => ({
  value: format,
  label: format.toUpperCase(),
}));

export function ConvertTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<string>('png');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const canConvert = files.length > 0 && !loading;
  useMediaActivity('convert', loading);

  const handleConvert = async () => {
    if (!canConvert) {
      return;
    }

    setLoading(true);
    setProgress(null);
    setError(null);
    setSavedPath(null);

    try {
      if (files.length === 1) {
        const { blob, filename } = await convertSingleFile(files[0], format);
        setSavedPath(await saveOutput(blob, filename));
      } else {
        setProgress({ completed: 0, total: files.length });
        const zipBlob = await convertFilesToZip(files, format, (completed, total) => {
          setProgress({ completed, total });
        });
        setSavedPath(await saveOutput(zipBlob, 'converted-images.zip'));
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
    }
  };

  return (
    <ToolShell
      settings={
        <>
          <label htmlFor="output-format" className="mc-label">Output format</label>
          <select id="output-format" value={format} disabled={loading}
            onChange={(event) => setFormat(event.target.value)} className="mc-input">
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {files.length > 1 && <p className="mt-3 text-xs text-mut">Batch output is saved as a ZIP.</p>}
        </>
      }
      actions={
        <Button onClick={handleConvert} disabled={!canConvert} loading={loading}>
          {loading ? 'Converting…' : 'Convert and save'}
        </Button>
      }
      status={progress && (
        <ProgressBar value={(progress.completed / progress.total) * 100}
          label={`Converting ${progress.completed} of ${progress.total}`} />
      )}
    >
      <DropZone files={files} onFilesChange={setFiles} accept={IMAGE_ACCEPT} disabled={loading}
        dropLabel="Drag and drop images here" activeDropLabel="Drop your images here"
        hintLabel="JPG, PNG, WebP, TIFF, BMP, GIF, HEIC, HEIF" />
      {error && <Alert tone="error">{error}</Alert>}
      {savedPath && <Alert tone="success">Saved {outputName(savedPath)}. <RevealOutput path={savedPath} /></Alert>}
    </ToolShell>
  );
}
