import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { computeLayout, drawComposite, type ComposeOptions } from '../lib/compose';
import { normalizeImage, type ProcessedImage } from '../lib/imageProcessing';
import { vela } from '../lib/ipc';
import { SettingsPanel } from './picture/SettingsPanel';
import { DEFAULT_SETTINGS, type ConnectorSettings } from './picture/types';
import {
  base64ToFile, blobToBase64, canvasToBlob, exportBlob, fileStamp, hasFiles, loadImage, releaseImage,
} from './picture/helpers';

function Thumb({ image, selected, onRemove, onPick }: {
  image: ProcessedImage; selected: boolean; onRemove: () => void; onPick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 'none', width: 118, opacity: isDragging ? 0.6 : 1,
        transform: CSS.Transform.toString(transform), transition,
      }}
    >
      <div
        onClick={onPick}
        style={{
          height: 72, borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'grab', position: 'relative',
          border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        }}
        {...attributes}
        {...listeners}
      >
        <img src={image.url} alt={image.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
        <div
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            position: 'absolute', top: 4, right: 4, width: 15, height: 15, borderRadius: 4,
            background: 'rgba(0,0,0,.45)', color: '#fff', fontSize: 12, display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}
        >×</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 5, textAlign: 'center', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {image.name}
      </div>
    </div>
  );
}

export function PictureConnectorScreen() {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [pending, setPending] = useState(0);
  const [settings, setSettings] = useState<ConnectorSettings>(DEFAULT_SETTINGS);
  const [dragOver, setDragOver] = useState(false);
  const [canvasLimited, setCanvasLimited] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  const aliveRef = useRef(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const say = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      imagesRef.current.forEach((image) => releaseImage(image.url));
    };
  }, []);

  const addFiles = useCallback(async (fileList: File[]) => {
    const files = fileList.filter((file) =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.name));
    if (files.length === 0) {
      say('Drop image files to connect them.', 'err');
      return;
    }
    setPending((count) => count + files.length);
    const slots: Array<{ ok: true; image: ProcessedImage } | { ok: false } | undefined> = new Array(files.length);
    let cursor = 0;
    let nextToCommit = 0;

    const commitReady = () => {
      const batch: ProcessedImage[] = [];
      while (nextToCommit < slots.length && slots[nextToCommit]) {
        const slot = slots[nextToCommit];
        nextToCommit += 1;
        if (!slot?.ok) continue;
        if (!aliveRef.current) releaseImage(slot.image.url);
        else batch.push(slot.image);
      }
      if (batch.length > 0 && aliveRef.current) setImages((prev) => [...prev, ...batch]);
    };

    const worker = async () => {
      while (cursor < files.length) {
        const index = cursor;
        cursor += 1;
        try {
          const image = await normalizeImage(files[index]);
          slots[index] = { ok: true, image };
        } catch (err) {
          slots[index] = { ok: false };
          if (aliveRef.current) say(err instanceof Error ? err.message : 'Could not read that image.', 'err');
        } finally {
          setPending((count) => Math.max(0, count - 1));
          commitReady();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, files.length) }, () => worker()));
  }, [say]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const found = prev.find((image) => image.id === id);
      if (found) releaseImage(found.url);
      return prev.filter((image) => image.id !== id);
    });
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setImages((prev) => {
      const oldIndex = prev.findIndex((image) => image.id === active.id);
      const newIndex = prev.findIndex((image) => image.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const composeOptions = useMemo<ComposeOptions>(() => ({
    mode: settings.mode,
    perRow: settings.perRow,
    matchHeights: settings.matchHeights,
    gap: settings.gap,
    padding: settings.padding,
    arrowColor: settings.arrowColor,
    arrowThickness: settings.arrowThickness,
    arrowHeadSize: settings.arrowHeadSize,
    background: settings.background,
  }), [settings]);

  useEffect(() => {
    if (images.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const sources = await Promise.all(images.map((image) => loadImage(image.url)));
          if (cancelled) return;
          const layout = computeLayout(
            images.map((image) => ({ width: image.width, height: image.height })),
            composeOptions,
          );
          drawComposite(canvas, sources, layout, composeOptions);
          setCanvasLimited(layout.canvasLimited);
        } catch {
          if (!cancelled) say('Could not draw the preview.', 'err');
        }
      })();
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [images, composeOptions, say]);

  const canExport = images.length > 0;

  const download = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !canExport) return;
    const blob = await exportBlob(canvas, settings);
    const saved = await vela().files.save(
      `vela-connected-${fileStamp()}.${settings.format === 'jpeg' ? 'jpg' : 'png'}`,
      settings.format === 'jpeg'
        ? [{ name: 'JPEG image', extensions: ['jpg'] }]
        : [{ name: 'PNG image', extensions: ['png'] }],
      await blobToBase64(blob),
    );
    if (saved) say('Picture saved.');
  }, [canExport, settings, say]);

  const copyImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !canExport) return;
    try {
      const blob = await canvasToBlob(canvas, 'image/png');
      await vela().clipboard.writeImage(await blobToBase64(blob));
      say('Copied to the clipboard.');
    } catch {
      say('Could not copy the image. Try downloading it instead.', 'err');
    }
  }, [canExport, say]);

  const browse = useCallback(async () => {
    const picked = await vela().files.openImages();
    if (picked.length > 0) void addFiles(picked.map((p) => base64ToFile(p.name, p.dataBase64)));
  }, [addFiles]);

  return (
    <div
      className="page"
      onDragOver={(e) => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDragOver(false);
        void addFiles([...(e.dataTransfer.files || [])]);
      }}
      style={dragOver ? { outline: '2px dashed var(--accent)', outlineOffset: -8, borderRadius: 12 } : undefined}
    >
      <p className="page-note">
        <b>Picture Connector</b> — join screenshots into one picture with arrows. Everything stays on this PC:
        images are discarded when the app closes. Drop, paste (Ctrl+V), or browse.
      </p>

      <div className="card-panel" style={{ padding: '16px 18px', marginBottom: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
          <button className="btn primary" onClick={browse}>
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
            Add images
          </button>
          <div style={{
            flex: 1, border: '1.5px dashed var(--border-strong)', borderRadius: 'var(--radius-md)',
            padding: '9px 15px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center',
          }}>
            Drag &amp; drop screenshots here, or press <b style={{ color: 'var(--text-2)' }}>Ctrl+V</b> to paste
          </div>
          {pending > 0 && <span className="badge blue"><span className="dot" />Processing {pending}…</span>}
          {images.length > 0 && <span className="badge green"><span className="dot" />{images.length} images</span>}
        </div>
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 3 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={images.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                {images.map((image) => (
                  <Thumb key={image.id} image={image} selected={false}
                    onRemove={() => removeImage(image.id)} onPick={() => undefined} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 292px', gap: 13, alignItems: 'start' }}>
        <div className="card-panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '9px 15px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.7px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Live preview</span>
            <div style={{ flex: 1 }} />
            {canvasLimited && images.length > 0 && (
              <span className="badge amber">Scaled to fit the {16000}px canvas limit</span>
            )}
            <button className="btn primary" disabled={!canExport} onClick={download}>
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
              Download
            </button>
            <button className="btn" disabled={!canExport} onClick={copyImage}>
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              Copy
            </button>
          </div>
          <div style={{
            padding: 24, minHeight: 420, display: 'grid', placeItems: 'center',
            background: 'repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 0 0/22px 22px',
          }}>
            {images.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, lineHeight: 1.7 }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>🖼️</div>
                Add screenshots to see the composite here.
              </div>
            ) : (
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, boxShadow: 'var(--shadow)' }} />
            )}
          </div>
        </div>

        <SettingsPanel settings={settings} onChange={(partial) => setSettings((prev) => ({ ...prev, ...partial }))} />
      </div>

      <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: 'none' }} />
      {toast && (
        <div className={`toast visible${toast.kind === 'err' ? ' danger' : ''}`}>{toast.msg}</div>
      )}
    </div>
  );
}
