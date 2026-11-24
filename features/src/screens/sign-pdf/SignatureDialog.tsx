import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';

export interface Signature {
  url: string;
  aspect: number;
}

function cropInk(canvas: HTMLCanvasElement): Signature {
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('Draw your signature first.');
  const result = document.createElement('canvas');
  result.width = right - left + 1;
  result.height = bottom - top + 1;
  result.getContext('2d')!.drawImage(canvas, left, top, result.width, result.height, 0, 0, result.width, result.height);
  return { url: result.toDataURL(), aspect: result.width / result.height };
}

export function SignatureDialog({ onClose, onSignature }: {
  onClose(): void;
  onSignature(signature: Signature): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad>(null);
  const active = useRef(false);
  const [error, setError] = useState('');
  const [ink, setInk] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    active.current = true;
    dialog.current!.showModal();
    const surface = canvas.current!;
    const bounds = surface.getBoundingClientRect();
    surface.width = Math.round(bounds.width * devicePixelRatio);
    surface.height = Math.round(bounds.height * devicePixelRatio);
    surface.getContext('2d')!.scale(devicePixelRatio, devicePixelRatio);
    const drawing = new SignaturePad(surface, { penColor: '#162033' });
    pad.current = drawing;
    const markInk = () => { setInk(!drawing.isEmpty()); setError(''); };
    drawing.addEventListener('endStroke', markInk);
    return () => {
      active.current = false;
      drawing.removeEventListener('endStroke', markInk);
      drawing.off();
    };
  }, []);

  async function importSignature(file: File) {
    setImporting(true);
    const source = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const bitmap = document.createElement('canvas');
      bitmap.width = Math.max(1, Math.round(image.naturalWidth * scale));
      bitmap.height = Math.max(1, Math.round(image.naturalHeight * scale));
      bitmap.getContext('2d')!.drawImage(image, 0, 0, bitmap.width, bitmap.height);
      const signature = cropInk(bitmap);
      if (active.current) onSignature(signature);
    } catch {
      if (active.current) setError('Choose a PNG or JPEG with a visible signature.');
    } finally {
      URL.revokeObjectURL(source);
      if (active.current) setImporting(false);
    }
  }

  return (
    <dialog ref={dialog} className="sign-dialog" aria-labelledby="signature-title" onCancel={onClose}>
      <h2 id="signature-title">Add signature</h2>
      <p>Draw your signature or import a PNG or JPEG.</p>
      <canvas ref={canvas} className="sign-pad" aria-label="Draw your signature" />
      {error && <p role="alert">{error}</p>}
      <div className="sign-actions">
        <label className="sign-file">
          Import image
          <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={importing} onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file && /\.(png|jpe?g)$/i.test(file.name)) void importSignature(file);
            else if (file) setError('Choose a PNG or JPEG.');
          }} />
        </label>
        <button type="button" disabled={!ink} onClick={() => { pad.current!.clear(); setInk(false); setError(''); }}>Clear</button>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="sign-primary" disabled={!ink || importing} onClick={() => {
          try { onSignature(cropInk(canvas.current!)); }
          catch { setError('Draw your signature first.'); }
        }}>Use signature</button>
      </div>
    </dialog>
  );
}
