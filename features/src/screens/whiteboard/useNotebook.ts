import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { vela } from '../../lib/ipc';
import { createPage, type BoardObject, type Notebook, type Page, type Picture, type Raster, type Template } from './notebook';
import type { Pictures } from './render';
import { loadNotebook, openStorage, saveNotebook } from './storage';

interface History {
  past: Page[][];
  present: Notebook;
  future: Page[][];
  pictures: Pictures;
}

function withPages(notebook: Notebook, pages: Page[]): Notebook {
  const activePageId = pages.some(page => page.id === notebook.activePageId) ? notebook.activePageId : pages[pages.length - 1].id;
  return { pages, activePageId };
}

export function useNotebook() {
  const [history, setHistory] = useState<History>(() => {
    const page = createPage('Blank');
    return { past: [], present: { pages: [page], activePageId: page.id }, future: [], pictures: new Map() };
  });
  const [loadStatus, setLoadStatus] = useState<'loading' | 'load-error' | 'ready'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [savedNotebook, setSavedNotebook] = useState<Notebook | null>(null);
  const [writeFailed, setWriteFailed] = useState(false);
  const connection = useRef<IDBDatabase | null>(null);
  const stored = useRef<Notebook | null>(null);
  const latest = useRef(history);
  const writing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let db: IDBDatabase | null = null;
    void (async () => {
      try {
        db = await openStorage();
        if (cancelled) {
          db.close();
          return;
        }
        const data = await loadNotebook(db);
        if (cancelled) {
          for (const { bitmap } of data?.pictures.values() ?? []) bitmap.close();
          return;
        }
        connection.current = db;
        stored.current = data?.notebook ?? null;
        setSavedNotebook(stored.current);
        if (data) setHistory({ past: [], present: data.notebook, future: [], pictures: data.pictures });
        setLoadStatus('ready');
      } catch {
        db?.close();
        if (!cancelled) setLoadStatus('load-error');
      }
    })();
    return () => {
      cancelled = true;
      db?.close();
      if (connection.current === db) connection.current = null;
    };
  }, [loadAttempt]);

  const flush = useCallback(async () => {
    const db = connection.current;
    if (!db || writing.current) return;
    writing.current = true;
    setWriteFailed(false);
    try {
      while (connection.current === db && stored.current !== latest.current.present) {
        const { present, pictures } = latest.current;
        await saveNotebook(db, stored.current, present, pictures);
        if (connection.current !== db) return;
        stored.current = present;
      }
      setSavedNotebook(stored.current);
      vela()?.whiteboard.reportDirty(false);
    } catch {
      if (connection.current === db) setWriteFailed(true);
    } finally {
      writing.current = false;
    }
  }, []);

  useLayoutEffect(() => {
    latest.current = history;
    if (loadStatus === 'ready' && stored.current !== history.present) {
      vela()?.whiteboard.reportDirty(true);
      void flush();
    }
  }, [history, loadStatus, flush]);

  function edit(change: (notebook: Notebook) => Notebook, picture?: { id: string; raster: Raster }) {
    setHistory(previous => {
      const next = change(previous.present);
      if (next === previous.present) return previous;
      const pictures = picture ? new Map(previous.pictures).set(picture.id, picture.raster) : previous.pictures;
      return { past: [...previous.past, previous.present.pages], present: next, future: [], pictures };
    });
  }

  function updatePage(id: string, change: (page: Page) => Page, picture?: { id: string; raster: Raster }) {
    edit(notebook => {
      const pages = notebook.pages.map(page => page.id === id ? change(page) : page);
      return pages.every((page, i) => page === notebook.pages[i]) ? notebook : { ...notebook, pages };
    }, picture);
  }

  function selectPage(id: string) {
    setHistory(previous => {
      const { present } = previous;
      if (present.activePageId === id || !present.pages.some(page => page.id === id)) return previous;
      return { ...previous, present: { ...present, activePageId: id } };
    });
  }

  return {
    notebook: history.present,
    pictures: history.pictures,
    status: loadStatus !== 'ready' ? loadStatus
      : savedNotebook === history.present ? 'saved' : writeFailed ? 'save-error' : 'saving',
    ready: loadStatus === 'ready',
    retry() {
      if (loadStatus === 'load-error') {
        setLoadStatus('loading');
        setLoadAttempt(attempt => attempt + 1);
      } else void flush();
    },
    selectPage,
    addPage(template: Template) {
      const page = createPage(template);
      edit(notebook => ({ pages: [...notebook.pages, page], activePageId: page.id }));
      return page.id;
    },
    setTemplate(id: string, template: Template) {
      updatePage(id, page => page.template === template ? page : { ...page, template });
    },
    append(id: string, object: BoardObject, raster?: Raster) {
      updatePage(id, page => ({ ...page, objects: [...page.objects, object] }),
        object.type === 'picture' && raster ? { id: object.id, raster } : undefined);
    },
    updatePicture(id: string, picture: Picture) {
      updatePage(id, page => page.objects.some(object => object.type === 'picture' && object.id === picture.id)
        ? { ...page, objects: page.objects.map(object => object.type === 'picture' && object.id === picture.id ? picture : object) }
        : page);
    },
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo() {
      setHistory(previous => {
        const { past, present, future } = previous;
        if (!past.length) return previous;
        return { ...previous, past: past.slice(0, -1), present: withPages(present, past[past.length - 1]), future: [present.pages, ...future] };
      });
    },
    redo() {
      setHistory(previous => {
        const { past, present, future } = previous;
        if (!future.length) return previous;
        return { ...previous, past: [...past, present.pages], present: withPages(present, future[0]), future: future.slice(1) };
      });
    },
  };
}
