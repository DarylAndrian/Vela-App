import { useState } from 'react';
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
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(nextFile);
    setPreviewUrl(nextUrl);
  };

  return (
    <ToolShell
      eyebrow="Image Editor"
      title="Annotate photos*right on your computer*"
      description="Pixelate, draw shapes, add text, or brush over a photo. Everything runs locally — download a PNG when you are done."
      features={[
        {
          title: 'Pixelate & blur',
          body: 'Hide names, numbers, or faces with mosaic blocks or a frosted blur.',
        },
        {
          title: 'Shape, text, brush',
          body: 'Highlight a region, drop a caption, or sketch with a pen or highlighter. Options sit above the tool dock.',
        },
        {
          title: 'Stays local',
          body: 'Photos are annotated on your computer like the rest of Media Converter. Nothing is uploaded to edit.',
        },
      ]}
    >
      <section className="mc-bento p-4 sm:p-6">
        <EditorMockup
          key={previewUrl ?? 'empty'}
          file={file}
          previewUrl={previewUrl}
          onFilesChange={handleFilesChange}
          onClear={() => handleFilesChange([])}
        />
      </section>
    </ToolShell>
  );
}