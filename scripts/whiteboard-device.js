// Whiteboard device check: drives the visible workspace with pen and touch injected through the Windows
// pointer stack, then copies an annotated screenshot to the real system clipboard and reads it back from
// another process. Run with `npm run whiteboard:device`. It takes over the pointer for about 20 seconds
// and briefly replaces the clipboard (its previous items are written back afterwards).
const { clipboard, dialog, screen } = require('electron');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { waitFor } = require('./whiteboard-smoke');

const PALM_GUARD_MS = 500;

function pointerHost() {
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'whiteboard-pointer.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const waiting = [];
  const errors = [];
  lines.on('line', (line) => {
    if (line.startsWith('error')) errors.push(line);
    else waiting.shift()?.(line);
  });
  const next = () => new Promise(resolve => waiting.push(resolve));
  const ready = next();
  return {
    ready,
    async run(commands) {
      const done = next();
      child.stdin.write(`${[...commands, 'sync'].join('\n')}\n`);
      await done;
      if (errors.length) throw new Error(errors.splice(0).join('; '));
    },
    close: () => child.stdin.end(),
  };
}

function probeClipboard(points = []) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'clipboard-probe.ps1'), points.map(([x, y]) => `${x},${y}`).join(';')],
    { windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(JSON.parse(stdout))));
  });
}

async function run(win, views, check) {
  if (process.platform !== 'win32') {
    check('Whiteboard device check needs Windows pointer injection', false, process.platform);
    return;
  }
  // Electron 45's main-process clipboard is asynchronous and ClipboardItem based.
  const previous = await clipboard.read().catch(() => []);
  const host = pointerHost();
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.focus();
  try {
    await win.webContents.executeJavaScript(`document.querySelector('#toolNav [data-destination="whiteboard"]').click()`);
    let board;
    await waitFor(() => (board = views.getView('whiteboard')?.webContents) && !board.isLoading());
    board.setBackgroundThrottling(false);
    const evaluate = (fn, ...args) => board.executeJavaScript(`(${fn})(...${JSON.stringify(args)})`);
    const saved = async () => {
      await evaluate(() => new Promise(resolve => setTimeout(resolve, 80)));
      return waitFor(() => board.executeJavaScript(`!!document.querySelector('.wb-save-saved')`));
    };
    check('Whiteboard device check opens a visible workspace', (await host.ready) === 'ready' && await saved());

    await evaluate(() => {
      window.__device = { events: [] };
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
        window.addEventListener(type, (event) => window.__device.events.push({ type, pointerType: event.pointerType,
          pressure: event.pressure, buttons: event.buttons }), true);
      }
    });
    const brush = width => evaluate((width) => {
      const slider = document.querySelector('input[type="range"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, String(width));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, width);
    const setTool = tool => evaluate((tool) => {
      const select = document.querySelector('.wb-controls select');
      select.value = tool;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, tool);
    const state = () => evaluate(async () => {
      const viewport = document.querySelector('.wb-viewport');
      const paper = document.querySelector('.wb-paper');
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('vela-whiteboard');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const request = db.transaction('pages').objectStore('pages').get(paper.dataset.pageId);
      const page = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
      db.close();
      const events = window.__device.events.splice(0);
      const rect = paper.getBoundingClientRect();
      const visible = viewport.getBoundingClientRect();
      return { scrollTop: viewport.scrollTop, scrollLeft: viewport.scrollLeft,
        zoom: document.querySelector('[aria-label="Zoom level"]').textContent,
        objects: page?.objects ?? [], events,
        paper: { left: rect.left, top: rect.top, scale: rect.width / 794 },
        visible: { left: visible.left, top: visible.top, right: visible.right, bottom: visible.bottom } };
    });
    // Client (CSS px in the Whiteboard view) to physical screen pixels.
    const toScreen = (x, y) => {
      const content = win.getContentBounds();
      const view = views.getView('whiteboard').getBounds();
      const point = screen.dipToScreenPoint({ x: content.x + view.x + x, y: content.y + view.y + y });
      return `${Math.round(point.x)} ${Math.round(point.y)}`;
    };
    const touch = (...contacts) => `touch ${contacts.map(([id, phase, x, y]) => {
      const [sx, sy] = toScreen(x, y).split(' ');
      return `${id}:${phase}:${sx}:${sy}`;
    }).join(' ')}`;
    const pen = (phase, x, y, pressure = 0) => `pen ${phase} ${toScreen(x, y)} ${pressure}`;
    const line = (x1, y1, x2, y2, steps, each) => Array.from({ length: steps + 1 }, (_, i) =>
      each(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, i / steps));

    await brush(30);
    let s = await state();
    const left = s.paper.left + 60;
    const top = Math.max(s.paper.top, s.visible.top) + 60;
    const baseline = s.objects.length;

    // Hover: the pen is in range but never touches.
    await host.run([...line(left, top, left + 300, top, 20, (x, y) => [pen('hover', x, y), 'wait 8']).flat(), pen('leave', left + 300, top)]);
    s = await state();
    const hover = s.events.filter(event => event.pointerType === 'pen');
    check('Device pen hover reaches Whiteboard as pen input without ink', hover.length >= 10 &&
      hover.every(event => event.buttons === 0) && s.objects.length === baseline, `${hover.length} events, ${s.objects.length - baseline} objects`);

    // Light-to-firm stroke: pressure ramps from 0.1 to 1.
    await host.run([pen('hover', left, top + 40), pen('down', left, top + 40, 0.1),
      ...line(left, top + 40, left + 300, top + 40, 40, (x, y, t) => [pen('move', x, y, 0.1 + 0.9 * t), 'wait 8']).flat(),
      pen('up', left + 300, top + 40), pen('leave', left + 300, top + 40)]);
    await saved();
    s = await state();
    const stroke = s.objects.at(-1);
    const pressures = stroke?.type === 'ink' ? stroke.samples.map(sample => sample.pressure) : [];
    const rising = pressures.slice(1).filter((value, i) => value >= pressures[i] - 0.02).length / Math.max(1, pressures.length - 1);
    const penDown = s.events.filter(event => event.pointerType === 'pen' && event.buttons === 1);
    check('Device pen pressure maps light-to-firm into the stored stroke', s.objects.length === baseline + 1 &&
      pressures.length >= 20 && pressures[0] < 0.2 && Math.max(...pressures) > 0.95 && rising > 0.95 &&
      new Set(penDown.map(event => event.pressure.toFixed(2))).size > 10,
    JSON.stringify({ samples: pressures.length, first: pressures[0], max: Math.max(...pressures), rising }));

    // Palm lands below the pen during contact and drags upward.
    const palm = (x, y) => [[1, 'down', x, y], ...Array.from({ length: 8 }, (_, i) => [1, 'move', x, y - 15 * (i + 1)])];
    const before = await state();
    const palmPath = palm(left + 200, top + 260);
    const contact = line(left, top + 120, left + 300, top + 120, 30, (x, y, t) => {
      const frame = [pen('move', x, y, 0.6), 'wait 8'];
      const index = Math.round(t * 30) - 6;
      if (index >= 0 && index < palmPath.length) frame.push(touch(palmPath[index]));
      if (index === palmPath.length) frame.push(touch([1, 'up', left + 200, top + 140]));
      return frame;
    }).flat();
    await host.run([pen('hover', left, top + 120), pen('down', left, top + 120, 0.6), ...contact,
      pen('up', left + 300, top + 120), pen('leave', left + 300, top + 120)]);
    await saved();
    s = await state();
    const during = s.objects.slice(before.objects.length);
    const touchSeen = s.events.filter(event => event.pointerType === 'touch').length;
    check('Device palm during pen contact neither scrolls nor marks the page', s.scrollTop === before.scrollTop &&
      s.scrollLeft === before.scrollLeft && s.zoom === before.zoom && during.length === 1 &&
      during[0].samples.every(sample => Math.abs(sample.y - during[0].samples[0].y) < 3),
    `${touchSeen} touch events reached the page; ${during.length} new objects`);

    // Palm lands while the pen hovers just above the page.
    await host.run([pen('hover', left, top + 200), 'wait 30', touch([1, 'down', left + 200, top + 300]),
      ...Array.from({ length: 8 }, (_, i) => [pen('hover', left + i * 4, top + 200), touch([1, 'move', left + 200, top + 300 - 15 * (i + 1)]), 'wait 10']).flat(),
      touch([1, 'up', left + 200, top + 180]), pen('leave', left + 32, top + 200)]);
    s = await state();
    check('Device palm while the pen hovers does not pan', s.scrollTop === before.scrollTop && s.objects.length === before.objects.length + 1,
      `${s.events.filter(event => event.pointerType === 'touch').length} touch events`);

    // Palm lands just after the pen lifts and leaves range.
    await host.run([pen('hover', left, top + 220), pen('down', left, top + 220, 0.5), pen('move', left + 40, top + 220, 0.5),
      pen('up', left + 40, top + 220), pen('leave', left + 40, top + 220), `wait ${Math.round(PALM_GUARD_MS / 5)}`,
      touch([1, 'down', left + 200, top + 320]),
      ...Array.from({ length: 8 }, (_, i) => [touch([1, 'move', left + 200, top + 320 - 15 * (i + 1)]), 'wait 10']).flat(),
      touch([1, 'up', left + 200, top + 200])]);
    await saved();
    s = await state();
    check('Device palm right after the pen lifts does not pan', s.scrollTop === before.scrollTop,
      `scroll ${before.scrollTop} -> ${s.scrollTop}`);

    // Once the pen is away, one finger pans and two fingers pinch.
    const centerX = (s.visible.left + s.visible.right) / 2;
    const centerY = (s.visible.top + s.visible.bottom) / 2;
    await host.run([`wait ${PALM_GUARD_MS + 200}`, touch([1, 'down', centerX, centerY + 100]),
      ...Array.from({ length: 10 }, (_, i) => [touch([1, 'move', centerX, centerY + 100 - 20 * (i + 1)]), 'wait 10']).flat(),
      touch([1, 'up', centerX, centerY - 100])]);
    const panned = await state();
    await host.run(['wait 50', touch([1, 'down', centerX - 60, centerY], [2, 'down', centerX + 60, centerY]),
      ...Array.from({ length: 10 }, (_, i) => [touch([1, 'move', centerX - 60 - 9 * (i + 1), centerY], [2, 'move', centerX + 60 + 9 * (i + 1), centerY]), 'wait 10']).flat(),
      touch([1, 'up', centerX - 150, centerY], [2, 'up', centerX + 150, centerY])]);
    const pinched = await state();
    check('Device finger pans and pinch zooms after the pen leaves', panned.scrollTop - s.scrollTop > 100 &&
      parseInt(pinched.zoom, 10) > parseInt(panned.zoom, 10),
    `scroll ${s.scrollTop} -> ${panned.scrollTop}, zoom ${panned.zoom} -> ${pinched.zoom}`);

    // Annotate a pasted screenshot and copy a region through the real system clipboard.
    await evaluate(() => [...document.querySelectorAll('.wb-zoom button')].find(button => button.textContent.trim() === 'Fit Page').click());
    await evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
    await evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 96, height: 64 });
      const context = canvas.getContext('2d');
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, 96, 64);
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      const clipboardData = new DataTransfer();
      clipboardData.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }));
      const viewport = document.querySelector('.wb-viewport');
      viewport.focus();
      viewport.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    await saved();
    s = await state();
    const picture = s.objects.at(-1);
    const { scale } = s.paper;
    const pic = { x: s.paper.left + picture.x * scale, y: s.paper.top + picture.y * scale };
    await setTool('Pen');
    await brush(6);
    const inkY = pic.y + 24 * scale;
    await host.run([pen('hover', pic.x - 30 * scale, inkY), pen('down', pic.x - 30 * scale, inkY, 0.8),
      ...line(pic.x - 30 * scale, inkY, pic.x + 126 * scale, inkY, 30, (x, y) => [pen('move', x, y, 0.8), 'wait 8']).flat(),
      pen('up', pic.x + 126 * scale, inkY), pen('leave', pic.x + 126 * scale, inkY)]);
    await saved();
    await setTool('Region Copy');
    // The region starts in blank paper and ends inside the picture, cutting through picture and ink.
    const region = { x1: pic.x - 40 * scale, y1: pic.y - 40 * scale, x2: pic.x + 66 * scale, y2: pic.y + 48 * scale };
    await host.run([pen('hover', region.x1, region.y1), pen('down', region.x1, region.y1, 0.5),
      ...line(region.x1, region.y1, region.x2, region.y2, 12, (x, y) => [pen('move', x, y, 0.5), 'wait 8']).flat(),
      pen('up', region.x2, region.y2), pen('leave', region.x2, region.y2)]);
    // Injection returns once Windows has the input; wait for the renderer to finish the selection.
    await waitFor(() => board.executeJavaScript(`document.querySelector('.wb-region-actions button')?.disabled === false`));
    const copy = async () => {
      await clipboard.clear();
      await evaluate(() => document.querySelector('.wb-viewport').dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'c', ctrlKey: true })));
      return waitFor(() => clipboard.has('image/png'));
    };
    const width = Math.round(106 * 2);
    const height = Math.round(88 * 2);
    // Page-unit offsets inside the crop: ink crosses at y=40+24, picture spans from x=40.
    const inkPixel = [Math.round((40 + 20) * 2), Math.round((40 + 24) * 2)];
    const copied = await copy();
    const message = await board.executeJavaScript(`document.querySelector('.wb-message')?.textContent ?? ''`);
    const external = copied ? await probeClipboard([inkPixel]) : { message };
    const png = external?.png;
    const near = (value, expected) => Math.abs(value - expected) <= 4;
    check('Device copy reaches another process as a transparent PNG with ink above the picture', !!png &&
      near(png.width, width) && near(png.height, height) && png.corner[3] === 0 &&
      png.red.join(',') === '255,0,0,255' && png.points?.[0]?.[3] === 255 && png.points[0][0] < 100,
    JSON.stringify(external));
    check('Device copy also offers a bitmap for apps without PNG clipboard support', !!external?.dib &&
      near(external.dib.width, width) && near(external.dib.height, height), JSON.stringify(external?.dib));

    // Cancelling the JPG save dialog leaves the region ready to copy again.
    const showSaveDialog = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
    try {
      await evaluate(() => [...document.querySelectorAll('.wb-region-actions button')].find(button => button.textContent === 'Save as JPG').click());
      await evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
    } finally {
      dialog.showSaveDialog = showSaveDialog;
    }
    const again = await copy() && await probeClipboard();
    check('Device copy still works after cancelling the JPG save dialog', !!again?.png && near(again.png.width, width),
      JSON.stringify(again?.png));
  } finally {
    host.close();
    win.setAlwaysOnTop(false);
    await (previous.length ? clipboard.write(previous) : clipboard.clear()).catch(() => {});
  }
}

module.exports = { run };
