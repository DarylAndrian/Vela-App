const { protocol, app } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const SCHEME = 'app';
const DIST = path.join(__dirname, '..', '..', 'features', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

// Must run before app ready.
function registerPrivileged() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

// Runs after app ready. Serves app://features/<path> from features/dist and
// app://models/<path> from the userData model cache (background-removal assets).
function serve(target = protocol, featuresOnly = false) {
  target.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (featuresOnly && url.host !== 'features') return new Response('Forbidden', { status: 403 });
    let pathname = decodeURIComponent(url.pathname);

    if (url.host === 'models') {
      const root = path.join(app.getPath('userData'), 'models');
      const file = path.normalize(path.join(root, pathname));
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403, headers: cors });
      try {
        const data = await fs.readFile(file);
        return new Response(data, {
          headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', ...cors },
        });
      } catch {
        return new Response('Not found', { status: 404, headers: cors });
      }
    }

    if (pathname === '/' || pathname === '') pathname = '/chart-code.html';
    const file = path.normalize(path.join(DIST, pathname));
    if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.readFile(file);
      return new Response(data, {
        headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

module.exports = { registerPrivileged, serve };
