import type { Notebook, Page } from './notebook';
import type { Pictures } from './render';

export const DATABASE = 'vela-whiteboard';
const CURRENT = 'current';

interface Metadata {
  pageIds: string[];
  activePageId: string;
}

interface ImageRecord {
  id: string;
  blob: Blob;
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Notebook transaction aborted'));
  });
}

export function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Notebook storage is in use'));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('notebook');
      db.createObjectStore('pages', { keyPath: 'id' });
      db.createObjectStore('images', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
  });
}

function usedImages(pages: readonly Page[]) {
  const ids = new Set<string>();
  for (const page of pages) {
    for (const object of page.objects) if (object.type === 'picture') ids.add(object.id);
  }
  return ids;
}

export async function loadNotebook(db: IDBDatabase): Promise<{ notebook: Notebook; pictures: Pictures } | null> {
  const tx = db.transaction(['notebook', 'pages', 'images'], 'readonly');
  const [metadata, records, images] = await Promise.all([
    read<Metadata | undefined>(tx.objectStore('notebook').get(CURRENT)),
    read<Page[]>(tx.objectStore('pages').getAll()),
    read<ImageRecord[]>(tx.objectStore('images').getAll()),
    completion(tx),
  ]);
  if (!metadata) return null;
  const byId = new Map(records.map(page => [page.id, page]));
  const pages = metadata.pageIds.map(id => {
    const page = byId.get(id);
    if (!page) throw new Error('A saved page could not be found');
    return page;
  });
  if (!pages.some(page => page.id === metadata.activePageId)) throw new Error('The active page could not be found');
  const blobs = new Map(images.map(({ id, blob }) => [id, blob]));
  const pictures = new Map<string, { blob: Blob; bitmap: ImageBitmap }>();
  try {
    for (const id of usedImages(pages)) {
      const blob = blobs.get(id);
      if (!blob) throw new Error('A saved image could not be found');
      pictures.set(id, { blob, bitmap: await createImageBitmap(blob) });
    }
  } catch (error) {
    for (const { bitmap } of pictures.values()) bitmap.close();
    throw error;
  }
  return { notebook: { pages, activePageId: metadata.activePageId }, pictures };
}

export async function saveNotebook(db: IDBDatabase, previous: Notebook | null, notebook: Notebook, pictures: Pictures) {
  const pageIds = notebook.pages.map(page => page.id);
  const pageSet = new Set(pageIds);
  const oldPages = new Map(previous?.pages.map(page => [page.id, page]));
  const oldImages = usedImages(previous?.pages ?? []);
  const imageIds = usedImages(notebook.pages);
  const addedImages: ImageRecord[] = [];
  for (const id of imageIds) {
    if (oldImages.has(id)) continue;
    const picture = pictures.get(id);
    if (!picture) throw new Error('The image is unavailable');
    addedImages.push({ id, blob: picture.blob });
  }

  const tx = db.transaction(['notebook', 'pages', 'images'], 'readwrite');
  const finished = completion(tx);
  try {
    tx.objectStore('notebook').put({ pageIds, activePageId: notebook.activePageId } satisfies Metadata, CURRENT);
    const pages = tx.objectStore('pages');
    for (const page of notebook.pages) if (oldPages.get(page.id) !== page) pages.put(page);
    for (const id of oldPages.keys()) if (!pageSet.has(id)) pages.delete(id);
    const images = tx.objectStore('images');
    for (const image of addedImages) images.put(image);
    for (const id of oldImages) if (!imageIds.has(id)) images.delete(id);
  } catch (error) {
    tx.abort();
    await finished.catch(() => {});
    throw error;
  }
  await finished;
}
