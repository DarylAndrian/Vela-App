import { useEffect, useState } from 'react';
import { EditorMockup } from '../image-editor/EditorMockup';
import { ToolShell } from '../components/ToolShell';

export function EditTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFilesChange = (files: File[]) => {
    const nextFile = files[0] ?? null;

    if (nextFile && nextFile === file) {
      return;
    }

    const nextUrl = nextFile ? URL.createObjectURL(nextFile) : null;
    setFile(nextFile);
    setPreviewUrl(nextUrl);
  };

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <ToolShell>
      <EditorMockup key={previewUrl ?? 'empty'}
        file={file} previewUrl={previewUrl}
        onFilesChange={handleFilesChange} onClear={() => handleFilesChange([])} />
    </ToolShell>
  );
}
