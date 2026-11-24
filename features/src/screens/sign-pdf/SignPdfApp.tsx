import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSignature, FolderOpen, Minus, Plus, Save, X } from 'lucide-react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { vela } from '../../lib/ipc';
import { fileToBase64 } from '../media-converter/lib/blob-base64';
import { exportPdf, readPdf, type Placement, type Rectangle } from './pdf';
import { SignatureDialog, type Signature } from './SignatureDialog';
import { PdfPage } from './PdfPage';

type Document = Awaited<ReturnType<typeof readPdf>> & { name: string; sourcePath: string };
const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function SignPdfApp() {
  const [pdf, setPdf] = useState<Document | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [level, setLevel] = useState(2);
  const [fitWidth, setFitWidth] = useState(640);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [saved, setSaved] = useState<Placement[]>(placements);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [placing, setPlacing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [signatureDialog, setSignatureDialog] = useState(false);
  const [busy, setBusy] = useState<'open' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const viewer = useRef<HTMLDivElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const nextId = useRef(0);
  const dirty = placements.length !== saved.length || placements.some((mark, index) => mark !== saved[index]);

  useLayoutEffect(() => { vela().files.reportUnsignedChanges(dirty); }, [dirty]);

  useEffect(() => {
    const container = viewer.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setFitWidth(Math.max(100, container.clientWidth - 56)));
    observer.observe(container);
    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    void pdf.doc.getPage(pageNumber).then(
      (next) => { if (active) setPage(next); },
      () => { if (active) setError('Could not open this page.'); },
    );
    return () => { active = false; };
  }, [pdf, pageNumber]);

  async function open(files: FileList) {
    if (busy || pdf || !files.length) return;
    setError('');
    if (files.length !== 1 || !/\.pdf$/i.test(files[0].name)) {
      setError('Choose one PDF file.');
      return;
    }
    setBusy('open');
    try {
      const file = files[0];
      const sourcePath = vela().files.getPathForFile(file);
      if (!sourcePath) throw new Error('Choose the PDF from a folder on your computer.');
      setPdf({ ...await readPdf(file), name: file.name, sourcePath });
    } catch (problem) {
      setError(/password|encrypted/i.test(errorMessage(problem))
        ? 'This PDF is password-protected or encrypted. Choose an unlocked copy.'
        : 'Could not read this PDF. Choose a valid PDF file and try again.');
    } finally {
      setBusy(null);
    }
  }

  function close() {
    discardDialog.current?.close();
    void pdf?.close().catch(() => {});
    setPdf(null);
    setPageNumber(1);
    setPage(null);
    setLevel(2);
    setSignature(null);
    setPlacing(false);
    setSelected(null);
    const empty: Placement[] = [];
    setPlacements(empty);
    setSaved(empty);
    setStatus('');
    setError('');
  }

  async function save() {
    if (!pdf || !placements.length || busy) return;
    setBusy('save');
    setError('');
    setStatus('');
    try {
      const output = await exportPdf(pdf.bytes, pdf.doc, placements);
      const result = await vela().files.save(pdf.name.replace(/\.pdf$/i, '-signed.pdf'),
        [{ name: 'PDF document', extensions: ['pdf'] }], await fileToBase64(output), pdf.sourcePath);
      if (result) {
        setSaved(placements);
        setStatus(`Saved ${result.split(/[\\/]/).pop()}`);
      }
    } catch (problem) {
      const message = errorMessage(problem);
      setError(message.includes('protect the original PDF')
        ? 'Choose a different file name or folder to protect the original PDF.'
        : 'Could not save the signed copy. Try again or choose a different folder.');
    } finally {
      setBusy(null);
    }
  }

  function goTo(next: number) {
    setPage(null);
    setPageNumber(next);
    setSelected(null);
    setError('');
    viewer.current?.scrollTo(0, 0);
  }

  function edit(next: (current: Placement[]) => Placement[]) {
    setPlacements(next);
    setStatus('');
  }

  function place(rect: Rectangle) {
    if (!signature) return;
    const id = ++nextId.current;
    edit((current) => [...current, { ...rect, id, page: pageNumber, signature: signature.url }]);
    setSelected(id);
    setPlacing(false);
  }

  function remove(id: number) {
    edit((current) => current.filter((mark) => mark.id !== id));
    setSelected(null);
  }

  return (
    <main className="sign-app" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      if (!signatureDialog) void open(event.dataTransfer.files);
    }} onKeyDown={(event) => { if (event.key === 'Escape' && !signatureDialog) setPlacing(false); }}>
      <header className="sign-header">
        <div className="sign-heading">
          <FileSignature size={23} aria-hidden="true" />
          <div><h1>Sign PDF</h1>{pdf && <span title={pdf.name}>{pdf.name}</span>}</div>
        </div>
        {pdf && <div className="sign-actions">
          <button type="button" disabled={!!busy} onClick={() => dirty ? discardDialog.current?.showModal() : close()}><X size={15} /> Close PDF</button>
          <button type="button" className="sign-primary" disabled={!!busy || !placements.length} onClick={() => void save()}><Save size={15} /> {busy === 'save' ? 'Saving…' : 'Save signed copy'}</button>
        </div>}
      </header>
      {!pdf ? (
        <section className="sign-start">
          <div className="sign-drop">
            <FolderOpen size={30} aria-hidden="true" />
            <h2>Open a PDF to sign</h2>
            <p>Drop a PDF here or choose one from your computer.</p>
            <label className="sign-file sign-primary">
              {busy === 'open' ? 'Opening…' : 'Browse PDFs'}
              <input type="file" accept="application/pdf,.pdf" disabled={!!busy} onChange={(event) => {
                if (event.currentTarget.files) void open(event.currentTarget.files);
                event.currentTarget.value = '';
              }} />
            </label>
            {error && <p role="alert" className="sign-error">{error}</p>}
          </div>
        </section>
      ) : (
        <>
          <div className="sign-toolbar" aria-label="PDF controls">
            <div className="sign-actions">
              <button type="button" title="Previous page" aria-label="Previous page" disabled={!!busy || pageNumber === 1} onClick={() => goTo(pageNumber - 1)}><ChevronLeft size={16} /></button>
              <span aria-live="polite">{pageNumber} / {pdf.doc.numPages}</span>
              <button type="button" title="Next page" aria-label="Next page" disabled={!!busy || pageNumber === pdf.doc.numPages} onClick={() => goTo(pageNumber + 1)}><ChevronRight size={16} /></button>
              <button type="button" title="Zoom out" aria-label="Zoom out" disabled={!!busy || level === 0} onClick={() => setLevel(level - 1)}><Minus size={15} /></button>
              <button type="button" title="Reset zoom" disabled={!!busy} onClick={() => setLevel(2)}>{Math.round(zoomLevels[level] * 100)}%</button>
              <button type="button" title="Zoom in" aria-label="Zoom in" disabled={!!busy || level === zoomLevels.length - 1} onClick={() => setLevel(level + 1)}><Plus size={15} /></button>
            </div>
            <div className="sign-actions">
              {selected !== null && <button type="button" disabled={!!busy} onClick={() => remove(selected)}>Remove signature</button>}
              {signature && <button type="button" aria-pressed={placing} disabled={!!busy || !page} onClick={() => { setSelected(null); setPlacing(!placing); }}>{placing ? 'Cancel placement' : 'Place signature'}</button>}
              <button type="button" disabled={!!busy || !page} onClick={() => setSignatureDialog(true)}><FileSignature size={16} /> {signature ? 'Change signature' : 'Add signature'}</button>
            </div>
          </div>
          <div className={`sign-notice${error ? ' sign-error' : ''}`} role={error ? 'alert' : 'status'}>
            {error || status || (placing ? 'Click the page to place your signature.' : '')}
          </div>
          <div ref={viewer} className="sign-viewer">
            <div className="sign-paper-area">
              {page && <PdfPage key={page.pageNumber} page={page} zoom={zoomLevels[level]} fitWidth={fitWidth}
                placements={placements.filter((mark) => mark.page === pageNumber)} signature={placing ? signature : null} selected={selected} disabled={!!busy}
                onPlace={place} onSelect={(id) => { setSelected(id); if (id !== null) setPlacing(false); }}
                onMove={(id, rect) => edit((current) => current.map((mark) => mark.id === id ? { ...mark, ...rect } : mark))}
                onRemove={remove} />}
            </div>
          </div>
          <dialog ref={discardDialog} className="sign-dialog" aria-labelledby="discard-title">
            <h2 id="discard-title">Discard unsaved changes?</h2>
            <p>Your changes to this PDF haven’t been saved.</p>
            <div className="sign-actions">
              <button type="button" autoFocus onClick={() => discardDialog.current?.close()}>Keep editing</button>
              <button type="button" onClick={close}>Discard changes</button>
            </div>
          </dialog>
        </>
      )}
      {signatureDialog && <SignatureDialog onClose={() => setSignatureDialog(false)} onSignature={(next) => {
        setSignature(next);
        setSignatureDialog(false);
        setSelected(null);
        setPlacing(true);
        setStatus('');
        setError('');
      }} />}
    </main>
  );
}
