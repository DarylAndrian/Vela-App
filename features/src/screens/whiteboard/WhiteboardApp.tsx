import { useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { Columns2, Maximize, Minus, PenLine, Plus, Redo2, Undo2 } from 'lucide-react';
import { PAGE_WIDTH, type Brush } from './ink';
import { exportRegion, pastePlacement } from './exchange';
import { shapes, templates, type Page, type Selection, type Template } from './notebook';
import { drawThumbnail, type Pictures } from './render';
import { useBoardSurface, type Tool } from './useBoardSurface';
import { useNotebook } from './useNotebook';

function Thumbnail({ page, pictures }: { page: Page; pictures: Pictures }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => drawThumbnail(canvas.current!, page, pictures), [page, pictures]);
  return <canvas ref={canvas} className={`wb-thumb wb-template-${page.template.toLowerCase()}`} width={108} height={152} aria-hidden="true" />;
}

export function WhiteboardApp() {
  const [brush, setBrush] = useState<Brush>({ color: '#17243a', width: 5, sensitivity: 1 });
  const [tool, setTool] = useState<Tool>('Pen');
  const [showPages, setShowPages] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selection, select] = useState<Selection | null>(null);
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportRunning = useRef(false);
  const pasteQueue = useRef(Promise.resolve());
  const { notebook, pictures, status, ready, retry, selectPage, addPage, setTemplate, append, updatePicture, canUndo, canRedo, undo, redo } = useNotebook();
  const latestNotebook = useRef(notebook);
  useLayoutEffect(() => { latestNotebook.current = notebook; }, [notebook]);
  const activeIndex = notebook.pages.findIndex(page => page.id === notebook.activePageId);
  const page = notebook.pages[activeIndex];
  const board = useBoardSurface({ ...notebook, pictures, brush, tool, selection, select, selectPage, commit: append, updatePicture });
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (ready && !restored.current) {
      restored.current = true;
      board.jumpTo(notebook.activePageId);
    }
  }, [board.jumpTo, notebook.activePageId, ready]);
  const style = { '--wb-page-width': `${PAGE_WIDTH * board.zoom}px`, '--wb-spacing': `${28 * board.zoom}px` } as CSSProperties;
  const exportPage = selection?.kind === 'region' ? notebook.pages.find(item => item.id === selection.pageId) : undefined;

  async function exportSelection(format: 'png' | 'jpg') {
    if (selection?.kind !== 'region' || !exportPage || exportRunning.current) return;
    exportRunning.current = true;
    setExporting(true);
    setMessage('');
    try {
      const didExport = await exportRegion(exportPage, selection.rect, pictures, format);
      if (didExport) setMessage(format === 'png' ? 'Region copied' : 'JPG saved');
    } catch {
      setMessage(format === 'png' ? 'Could not copy the region' : 'Could not save the JPG');
    } finally {
      exportRunning.current = false;
      setExporting(false);
    }
  }

  async function pasteImage(file: File, requested: string) {
    setMessage('');
    try {
      const bitmap = await createImageBitmap(file);
      let pageId = requested;
      let area = board.visibleArea(pageId);
      if (!area?.width || !area.height) {
        pageId = latestNotebook.current.activePageId;
        area = board.visibleArea(pageId);
      }
      if (!area?.width || !area.height) {
        bitmap.close();
        setMessage('Bring a page into view before pasting');
        return;
      }
      const id = crypto.randomUUID();
      append(pageId, { type: 'picture', id, ...pastePlacement(bitmap, area) }, { blob: file, bitmap });
      setTool('Select picture');
      select({ kind: 'picture', pageId, id });
    } catch {
      setMessage('Could not open the pasted image');
    }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find(item => /^image\/(?!svg\+xml)/i.test(item.type));
    if (!file) return;
    event.preventDefault();
    const requested = notebook.activePageId;
    pasteQueue.current = pasteQueue.current.then(() => pasteImage(file, requested));
  }

  function exportFromToolbar(format: 'png' | 'jpg') {
    board.viewport.current?.focus({ preventScroll: true });
    void exportSelection(format);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      board.cancelGesture();
      select(null);
      setMessage('');
    }
    if (event.code === 'Space') {
      event.preventDefault();
      board.enablePan();
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'c' && tool === 'Region Copy') {
        event.preventDefault();
        if (!event.repeat) void exportSelection('png');
      }
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) redo();
        else undo();
      }
    }
  }

  return (
    <main className="whiteboard" aria-label="Whiteboard">
      <header className="wb-header">
        <PenLine aria-hidden="true" size={21} />
        <h1>Whiteboard</h1>
        <span className={`wb-save-state wb-save-${status}`} role="status">{{
          loading: 'Opening notebook…', 'load-error': 'Could not open notebook', saving: 'Saving…',
          'save-error': 'Could not save', saved: 'Saved',
        }[status]}</span>
        {(status === 'load-error' || status === 'save-error') && <button className="btn sm" type="button" onClick={retry}>Retry</button>}
        <div className="wb-header-actions" inert={!ready}>
          <button type="button" className="btn sm ghost" aria-pressed={showPages} onClick={() => setShowPages(!showPages)}>
            <Columns2 aria-hidden="true" /> Pages
          </button>
          <div className="wb-add-page" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setShowTemplates(false);
          }} onKeyDown={event => { if (event.key === 'Escape') setShowTemplates(false); }}>
            <button type="button" className="btn sm primary" aria-expanded={showTemplates} onClick={() => setShowTemplates(!showTemplates)}>
              <Plus aria-hidden="true" /> Add Page
            </button>
            {showTemplates && <div className="wb-template-picker" aria-label="New page template">
              {templates.map(template => <button key={template} type="button" className="btn sm ghost" onClick={() => {
                board.jumpTo(addPage(template));
                setShowTemplates(false);
                board.viewport.current?.focus({ preventScroll: true });
              }}>{template}</button>)}
            </div>}
          </div>
        </div>
      </header>
      <div className="wb-controls" role="group" aria-label="Drawing controls" inert={!ready}>
        <label>
          Tool
          <select value={tool} onChange={event => {
            setTool(event.target.value as Tool);
            select(null);
            setMessage('');
          }}>
            <option>Pen</option>
            <option>Select picture</option>
            <option>Region Copy</option>
            <optgroup label="Shapes">{shapes.map(shape => <option key={shape}>{shape}</option>)}</optgroup>
          </select>
        </label>
        <label className="wb-ink-color">
          Ink color
          <input type="color" value={brush.color} onChange={event => setBrush({ ...brush, color: event.target.value })} />
        </label>
        <label className="wb-slider">
          Thickness
          <input type="range" min="1" max="32" step="1" value={brush.width}
            onChange={event => setBrush({ ...brush, width: event.target.valueAsNumber })} />
          <span aria-hidden="true">{brush.width}</span>
        </label>
        <label className="wb-slider">
          Pressure sensitivity
          <input type="range" min="0.25" max="3" step="0.05" value={brush.sensitivity}
            onChange={event => setBrush({ ...brush, sensitivity: event.target.valueAsNumber })} />
          <span aria-hidden="true">{brush.sensitivity.toFixed(2)}</span>
        </label>
        <div className="wb-undo" aria-label="Edit history" role="group">
          <button type="button" className="btn sm ghost" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 aria-hidden="true" /></button>
          <button type="button" className="btn sm ghost" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}><Redo2 aria-hidden="true" /></button>
        </div>
      </div>
      <div className="wb-body" inert={!ready}>
        {showPages && <nav className="wb-rail" aria-label="Notebook pages">
          {notebook.pages.map((item, index) => <button type="button" key={item.id} aria-current={item.id === page.id ? 'page' : undefined}
            className="wb-page-button" onClick={() => board.jumpTo(item.id)}>
            <Thumbnail page={item} pictures={pictures} />
            <span>Page {index + 1}</span>
          </button>)}
        </nav>}
        <div className="wb-stage" data-tool={tool}>
          <div ref={board.viewport} className="wb-viewport" onScroll={board.onScroll} tabIndex={0} aria-label="Drawing workspace"
            onKeyDown={onKeyDown} onPaste={onPaste} onCopy={event => {
              if (tool !== 'Region Copy') return;
              event.preventDefault();
              void exportSelection('png');
            }} {...board.pointerHandlers}>
            <div className="wb-paper-stack" style={style}>
              {notebook.pages.map((item, index) => <div key={item.id} data-page-id={item.id}
                className={`wb-paper wb-template-${item.template.toLowerCase()}`} aria-label={`Page ${index + 1}`} />)}
            </div>
          </div>
          <canvas ref={board.artwork} className="wb-artwork" aria-hidden="true" />
          <canvas ref={board.preview} className="wb-preview" aria-hidden="true" />
        </div>
      </div>
      <footer className="wb-footer" inert={!ready}>
        <label className="wb-page-status">
          <span>Page {activeIndex + 1} of {notebook.pages.length}</span>
          <select aria-label="Page template" value={page.template} onChange={event => setTemplate(page.id, event.target.value as Template)}>
            {templates.map(template => <option key={template}>{template}</option>)}
          </select>
        </label>
        {tool === 'Region Copy' && <div className="wb-region-actions" role="group" aria-label="Region actions">
          <button type="button" className="btn sm" disabled={!exportPage || exporting} onClick={() => exportFromToolbar('png')}>Copy region</button>
          <button type="button" className="btn sm" disabled={!exportPage || exporting} onClick={() => exportFromToolbar('jpg')}>Save as JPG</button>
        </div>}
        <span className="wb-message" role="status">{message}</span>
        <div className="wb-zoom" role="group" aria-label="Zoom">
          <button type="button" className="btn sm ghost" aria-label="Zoom out" disabled={board.zoom <= 0.25} onClick={() => board.zoomAt(board.zoom / 1.25)}><Minus aria-hidden="true" /></button>
          <output aria-label="Zoom level">{Math.round(board.zoom * 100)}%</output>
          <button type="button" className="btn sm ghost" aria-label="Zoom in" disabled={board.zoom >= 8} onClick={() => board.zoomAt(board.zoom * 1.25)}><Plus aria-hidden="true" /></button>
          <button type="button" className="btn sm ghost" onClick={board.fitPage}><Maximize aria-hidden="true" /> Fit Page</button>
        </div>
      </footer>
    </main>
  );
}
