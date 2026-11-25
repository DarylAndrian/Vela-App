import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { cpSync, readFileSync, writeFileSync } from 'fs';

const pdfAssetDirs = ['cmaps', 'iccs', 'standard_fonts', 'wasm'];

function pdfAssets(): Plugin {
  return {
    name: 'pdf-assets',
    writeBundle(options) {
      for (const name of pdfAssetDirs) {
        cpSync(resolve(__dirname, 'node_modules/pdfjs-dist', name),
          resolve(options.dir || 'dist', 'pdf-assets', name), { recursive: true });
      }
    },
  };
}

// Pins the @imgly/background-removal version into the build so the main
// process model cache downloads the matching CDN assets (dev falls back to
// reading features/node_modules directly).
function mediaModelManifest(): Plugin {
  return {
    name: 'media-model-manifest',
    apply: 'build',
    writeBundle(options) {
      const pkgPath = resolve(__dirname, 'node_modules/@imgly/background-removal/package.json');
      const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const outDir = options.dir || resolve(__dirname, 'dist');
      writeFileSync(resolve(outDir, 'media-model-manifest.json'), JSON.stringify({ imglyVersion: version }, null, 2));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), mediaModelManifest(), pdfAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        connect: resolve(__dirname, 'connect.html'),
        vault: resolve(__dirname, 'vault.html'),
        'chart-code': resolve(__dirname, 'chart-code.html'),
        'picture-connector': resolve(__dirname, 'picture-connector.html'),
        'media-converter': resolve(__dirname, 'media-converter.html'),
        'taiwan-year': resolve(__dirname, 'taiwan-year.html'),
        velapt: resolve(__dirname, 'velapt.html'),
        'sign-pdf': resolve(__dirname, 'sign-pdf.html'),
        macro: resolve(__dirname, 'macro.html'),
      },
    },
  },
  optimizeDeps: {
    include: ['mermaid', '@mermaid-js/layout-elk'],
  },
});
