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

### Desktop integration
- Native Windows app with NSIS installer (desktop and Start menu shortcuts)
- Optional install location, per-user installation
- Local-first: your files stay on your machine

## Getting started

### Prerequisites
- Node.js (v18+ recommended)
- Windows (build and runtime target)

### Development

```bash
npm install
npm start
```

Useful scripts:

| Command | Description |
| --- | --- |
| `npm start` | Run the app in development |
| `npm run smoke` | Run the app in smoke-test mode |
| `npm run shots` | Capture app screenshots |
| `npm run features:dev` | Start the Vite dev server for native tools (`features/`) |
| `npm run features:build` | Build the native tools bundle |
| `npm run dist` | Build tools + package the Windows NSIS installer |

## Project layout

```
src/        Electron main, preload, and launcher renderer
features/   Native tools (React + Vite), served inside the app
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
