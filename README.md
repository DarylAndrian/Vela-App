# Vela-App

**The desktop version of Vela** — every Vela service and tool, gathered into one native Windows app.

Vela-App is a desktop launcher for the Vela service family. Instead of juggling scattered web apps and separate programs, you get a single home screen of service cards: click a card, and the service opens — web tools run right inside the app, native tools launch instantly, and everything is one installer away.

## Features

### Service launcher
- Home screen with service cards for the whole Vela family: **Vela**, **VelaPTP**, **VelaIsland**, and **VelaZoom**
- Web services open in-app (no external browser tab required)
- Native services launch directly from the home screen
- **Vela account sign-in** built into the launcher home page

### Built-in tools
- **Chart Code Generator** — generate chart code with a visual workflow (requires Vela connection)
- **Picture Connector** — combine and arrange pictures; fully local, no account needed
- **Media Converter** — a six-tool local suite powered by native ffmpeg: convert, compress, and process media entirely on your PC — files are never uploaded. AI background-removal models are downloaded on first use and stay local afterwards
- **Taiwan Year Calculator** — convert between ROC (Taiwan) years and the Gregorian calendar, fully offline
- **Macro Recorder** — record mouse and keyboard actions, then replay them for a set number of cycles or in a loop. Press **F9** to stop recording and **F10** to cancel or stop playback. Open existing VelaClicker JSON files and save recordings locally.
- **Whiteboard** — a multipage A4 notebook with pressure-sensitive pen ink, shapes, blank/ruled/dotted paper, zoom, and undo/redo. Paste screenshots, annotate them, then copy a region as a transparent PNG or save it as a JPG. Palm rejection ignores touches near the pen. Notebooks save locally.

### Desktop integration
- Native Windows app with NSIS installer (desktop and Start menu shortcuts)
- Optional install location, per-user installation
- Local-first: your files stay on your machine

## Getting started

### Prerequisites
- Node.js (v18+ recommended)
- Windows (build and runtime target)
- Windows .NET Framework 4.x (included in Windows 10 and 11) for the bundled macro engine

### Development

```bash
npm install
npm --prefix features ci
npm run features:build
npm start
```

Useful scripts:

| Command | Description |
| --- | --- |
| `npm start` | Run the app in development |
| `npm run smoke` | Run the app in smoke-test mode |
| `npm run whiteboard:device` | Drive Whiteboard with injected Windows pen and touch input and check clipboard copy (briefly takes over the pointer and clipboard) |
| `npm run shots` | Capture app screenshots |
| `npm run features:dev` | Start the Vite dev server for native tools (`features/`) |
| `npm run features:build` | Build the native tools bundle |
| `npm run dist` | Build the tools and Windows macro engine, then package the NSIS installer |

## Project layout

```
src/        Electron main, preload, and launcher renderer
features/   Native tools (React + Vite), served inside the app
native/     Windows macro input engine
assets/     Icons and static assets
scripts/    Build and test helper scripts
```

## Tech stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [electron-builder](https://www.electron.build/) — NSIS packaging
- Plain HTML/CSS/JS launcher renderer; React + Vite for the built-in tools
- ffmpeg (native) for media processing

## License

[MIT](LICENSE)
