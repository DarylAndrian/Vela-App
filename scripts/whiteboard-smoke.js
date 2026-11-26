const { clipboard, dialog } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

async function waitFor(predicate) {
  for (let i = 0; i < 120; i++) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return false;
}

// Run the production handler and ClipboardItem conversion without replacing the system clipboard.
async function captureImageWrites(action) {
  const write = clipboard.write;
  const writes = [];
  clipboard.write = async (items) => {
    const blob = await items[0].getType('image/png');
    writes.push(Buffer.from(await blob.arrayBuffer()));
  };
  try {
    await action(writes);
    return writes;
  } finally {
    clipboard.write = write;
  }
}

async function imageDetails(bytes) {
  if (!bytes) return null;
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  return { width: info.width, height: info.height, corner: pixel(1, 1),
    red: pixel(info.width - 3, info.height - 3), center: pixel(info.width >> 1, Math.round(info.height * 2 / 3)) };
}

async function run(win, views, check) {
  const open = () => win.webContents.executeJavaScript(`
    document.querySelector('#toolNav [data-destination="whiteboard"]').click()
  `);
  await open();
  let board;
  const loaded = await waitFor(() => {
    board = views.getView('whiteboard')?.webContents;
    return board && !board.isLoading();
  });
  board?.setBackgroundThrottling(false);
  const saved = () => waitFor(() => board.executeJavaScript(`!!document.querySelector('.wb-save-saved')`));
  const ready = loaded && await saved();
  check('Whiteboard opens from the launcher rail', ready && views.getViewId() === 'whiteboard');
  if (!ready) return;

  const origin = await board.executeJavaScript(`(() => {
    const { left, top } = document.querySelector('.wb-paper').getBoundingClientRect();
    const slider = document.querySelector('input[type="range"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '30');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return { x: Math.ceil(left + 45), y: Math.ceil(top + 65) };
  })()`);
  const evaluate = (fn, ...args) => board.executeJavaScript(`(${fn})(...${JSON.stringify(args)})`);
  const gesture = (steps, pointerType = 'pen') => evaluate((steps, pointerType) => {
    const viewport = document.querySelector('.wb-viewport');
    const capture = viewport.setPointerCapture;
    // Scripted PointerEvents have no active OS pointer to capture.
    viewport.setPointerCapture = () => {};
    try {
      for (const [type, x, y, pressure] of steps) {
        const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : viewport;
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType,
          pointerId: 4, clientX: x, clientY: y, pressure, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      }
    } finally {
      viewport.setPointerCapture = capture;
    }
  }, steps, pointerType);
  const { x, y } = origin;
  await gesture([
    ['pointerdown', x, y, 0.12], ['pointermove', x + 35, y, 0.12],
    ['pointermove', x + 75, y, 0.95], ['pointermove', x + 115, y, 0.95],
    ['pointerup', x + 135, y, 0], ['pointerdown', x + 170, y + 40, 0.8], ['pointerup', x + 170, y + 40, 0],
    ['pointerdown', x + 240, y + 40, 0.8], ['pointercancel', x + 240, y + 40, 0],
  ]);
  const measure = () => board.executeJavaScript(`(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.querySelector('.wb-artwork');
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    const column = (x, y) => {
      const sx = Math.round((x - rect.left) * canvas.width / rect.width);
      const sy = Math.round((y - rect.top - 20) * canvas.height / rect.height);
      return context.getImageData(sx, sy, 1, Math.round(40 * canvas.height / rect.height))
        .data.filter((value, i) => i % 4 === 3 && value > 127).length;
    };
    return { light: column(${x + 15}, ${y}), firm: column(${x + 95}, ${y}),
      release: column(${x + 131}, ${y}), dot: column(${x + 170}, ${y + 40}), cancelled: column(${x + 240}, ${y + 40}) };
  })()`);
  const ink = await measure();
  check('Whiteboard synthetic pen pressure, release, tap and cancellation',
    ink.light > 0 && ink.firm > ink.light && ink.release >= ink.firm - 2 && ink.dot > ink.light && ink.cancelled === 0, JSON.stringify(ink));
  await win.webContents.executeJavaScript("window.launcher.showWorkspace('home')");
  await open();
  const returned = await measure();
  check('Whiteboard retains its ink when switching workspaces', views.getView()?.webContents === board &&
    ink.dot > 0 && returned.dot === ink.dot);

  const center = await evaluate(async () => {
    const viewport = document.querySelector('.wb-viewport');
    const paper = document.querySelector('.wb-paper').getBoundingClientRect();
    const visible = viewport.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 96, 64);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }));
    viewport.focus();
    viewport.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    return { x: Math.round(paper.left + paper.width / 2),
      y: Math.round((Math.max(visible.top, paper.top) + Math.min(visible.bottom, paper.bottom)) / 2), scale: paper.width / 794 };
  });
  const pasted = await waitFor(() => board.executeJavaScript(`document.querySelector('.wb-controls select').value === 'Select picture'`));
  check('Whiteboard accepts a screenshot paste and selects the picture', pasted && await saved());
  const setTool = tool => evaluate(tool => {
    const select = document.querySelector('.wb-controls select');
    select.value = tool;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, tool);
  const drag = (x1, y1, x2, y2) => gesture([
    ['pointerdown', x1, y1, 1], ['pointermove', x2, y2, 1], ['pointerup', x2, y2, 0],
  ], 'mouse');
  const { x: cx, y: cy, scale } = center;
  await drag(cx, cy, cx + 12, cy + 6);
  await drag(cx + 12 + 48 * scale, cy + 6 + 32 * scale, cx + 27 + 48 * scale, cy + 16 + 32 * scale);
  const picture = await saved() && await evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('vela-whiteboard');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const request = db.transaction('pages').objectStore('pages').get(document.querySelector('.wb-paper').dataset.pageId);
      const page = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return page.objects.find(object => object.type === 'picture');
    } finally {
      db.close();
    }
  });
  check('Whiteboard moves and resizes a picture while preserving its aspect ratio', picture?.width > 96 &&
    picture.x > (794 - 96) / 2 && Math.abs(picture.width / picture.height - 1.5) < 0.001, JSON.stringify(picture));

  await setTool('Line');
  await drag(cx + 18, cy, cx - 24, cy);
  const history = await evaluate(async () => {
    const viewport = document.querySelector('.wb-viewport');
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const state = () => !document.querySelector('[aria-label="Redo"]').disabled;
    const key = value => viewport.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: value, ctrlKey: true,
    }));
    key('z');
    await frame();
    const canRedo = state();
    key('y');
    await frame();
    return canRedo && !state();
  });
  check('Whiteboard supports keyboard undo and redo for an edit', history);
  await setTool('Region Copy');
  await drag(center.x + 18, center.y + 18, center.x - 48, center.y - 36);
  const copy = () => evaluate(() => {
    document.querySelector('.wb-viewport').dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'c', ctrlKey: true,
    }));
  });
  const crop = await captureImageWrites(async (writes) => {
    await copy();
    await waitFor(() => writes.length === 1);
    await evaluate(() => document.querySelector('[aria-label="Zoom in"]').click());
    await waitFor(() => board.executeJavaScript(`document.querySelector('output').textContent !== '75%'`));
    await copy();
    await waitFor(() => writes.length === 2);
  });
  const png = await imageDetails(crop[0]);
  check('Whiteboard copies a transparent, zoom-independent PNG at 2 px per page unit', png &&
    png.width === Math.round(132 / center.scale) && png.height === Math.round(108 / center.scale) &&
    png.corner[3] === 0 && png.red[0] === 255 && png.red[1] === 0 && png.center.join(',') === '23,36,58,255' &&
    crop[0].equals(crop[1] ?? Buffer.alloc(0)), JSON.stringify(png));

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vela-whiteboard-smoke-'));
  const jpgPath = path.join(directory, 'selection.jpg');
  const showSaveDialog = dialog.showSaveDialog;
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: jpgPath });
  try {
    await evaluate(() => [...document.querySelectorAll('.wb-region-actions button')].find(button => button.textContent === 'Save as JPG').click());
    const exported = await waitFor(() => board.executeJavaScript(`document.querySelector('.wb-message').textContent === 'JPG saved'`));
    const jpg = exported ? await imageDetails(await fs.readFile(jpgPath)) : null;
    check('Whiteboard saves the selected crop as JPG on white', !!jpg && jpg.width === png?.width &&
      jpg.height === png?.height && jpg.corner.slice(0, 3).every(value => value >= 245), JSON.stringify(jpg));
  } finally {
    dialog.showSaveDialog = showSaveDialog;
    await fs.rm(jpgPath, { force: true });
    await fs.rmdir(directory);
  }

  const zoom = await evaluate(async () => {
    const viewport = document.querySelector('.wb-viewport');
    const paper = document.querySelector('.wb-paper');
    const bounds = viewport.getBoundingClientRect();
    const x = bounds.left + viewport.clientWidth / 2;
    const y = bounds.top + viewport.clientHeight / 2;
    const pagePoint = () => {
      const rect = paper.getBoundingClientRect();
      return { x: (x - rect.left) * 794 / rect.width, y: (y - rect.top) * 1123 / rect.height };
    };
    const wheel = async deltaY => {
      viewport.dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, ctrlKey: true, deltaY, cancelable: true }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };
    const label = () => document.querySelector('[aria-label="Zoom level"]').textContent;
    const before = pagePoint();
    await wheel(-3000);
    const after = pagePoint();
    const canvas = document.querySelector('.wb-artwork');
    const bounded = canvas.width === Math.round(viewport.clientWidth * devicePixelRatio) &&
      canvas.height === Math.round(viewport.clientHeight * devicePixelRatio) &&
      canvas.width <= Math.round(innerWidth * devicePixelRatio);
    const horizontal = { left: viewport.scrollLeft, width: viewport.clientWidth, content: viewport.scrollWidth };
    const max = label();
    await wheel(3000);
    const min = label();
    [...document.querySelectorAll('.wb-zoom button')].find(button => button.textContent.trim() === 'Fit Page').click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { before, after, bounded, horizontal, max, min, fits: paper.getBoundingClientRect().height <= viewport.clientHeight };
  });
  check('Whiteboard anchors Ctrl+wheel zoom and keeps its canvas at viewport size', zoom.min === '25%' && zoom.max === '800%' &&
    zoom.fits && zoom.bounded && Math.hypot(zoom.before.x - zoom.after.x, zoom.before.y - zoom.after.y) < 1, JSON.stringify(zoom));

  await evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (args[1] === 'readwrite' && this.name === 'vela-whiteboard') {
        IDBDatabase.prototype.transaction = transaction;
        queueMicrotask(() => tx.abort());
      }
      return tx;
    };
    document.querySelector('.wb-add-page > button').click();
  });
  await evaluate(() => [...document.querySelectorAll('.wb-template-picker button')].find(button => button.textContent === 'Dotted').click());
  const failed = await waitFor(() => board.executeJavaScript(`!!document.querySelector('.wb-save-save-error')`));
  const pagesBeforeRetry = await board.executeJavaScript(`document.querySelectorAll('.wb-paper').length`);
  let keepEditingPrompt = false;
  if (failed) {
    const showMessageBox = dialog.showMessageBoxSync;
    dialog.showMessageBoxSync = (_window, options) => {
      keepEditingPrompt = options.message.includes('Whiteboard') && options.buttons[options.defaultId] === 'Keep editing';
      return 0;
    };
    try {
      const prevented = { value: false };
      win.emit('close', { preventDefault() { prevented.value = true; } });
      keepEditingPrompt &&= prevented.value;
    } finally {
      dialog.showMessageBoxSync = showMessageBox;
    }
    await evaluate(() => [...document.querySelectorAll('.wb-header button')].find(button => button.textContent === 'Retry').click());
  }
  check('Whiteboard protects an unsaved edit when the window closes', keepEditingPrompt);
  const recovered = await saved();
  check('Whiteboard retains in-memory edits after a failed transaction and retries', failed && pagesBeforeRetry === 2 && recovered);

  views.discard('whiteboard');
  await open();
  await waitFor(() => {
    board = views.getView('whiteboard')?.webContents;
    return board && !board.isLoading();
  });
  const reopened = await saved() && await board.executeJavaScript(`({
    pages: document.querySelectorAll('.wb-paper').length,
    active: document.querySelector('.wb-page-button[aria-current]').textContent.trim(),
    template: document.querySelector('[aria-label="Page template"]').value,
  })`);
  check('Whiteboard restores notebook and active page in a new renderer', reopened?.pages === 2 &&
    reopened.active === 'Page 2' && reopened.template === 'Dotted', JSON.stringify(reopened));
  views.showShell();
}

module.exports = { run, captureImageWrites, waitFor };
