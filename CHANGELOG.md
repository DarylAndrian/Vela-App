# Changelog

All notable changes to Vela-App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-11-26

### Added
- Whiteboard in Home and the sidebar. Write and annotate on a multipage A4 notebook with pressure-sensitive ink, shapes, blank/ruled/dotted paper, and undo/redo. Paste screenshots, move and resize them, then copy a region as a transparent PNG or save it as a white-background JPG. Notebooks save locally and restore after restart.
- Palm rejection for pen input: touches near pen use are ignored, so resting a palm no longer scrolls the page.

## [0.8.2] - 2026-11-24

### Added
- Sign PDF in the sidebar and Home’s built-in tools. Draw or import a signature, place it on a PDF, and save a signed copy offline.

## [0.8.0] - 2026-11-21

### Added
- Macro Recorder in Home and the sidebar. Record and replay Windows mouse and keyboard actions, use global stop shortcuts, and open existing VelaClicker recordings.

## [0.6.0] - 2026-11-19

### Changed
- Vela now uses a persistent sidebar and shared Settings across its built-in tools.
- Media Converter opens directly to image conversion and keeps files, settings, and running jobs available when switching workspaces.
- File exports use Windows save dialogs and offer to show the result in File Explorer.
- Picture Connector, Photo to PDF, Chart Code, and Taiwan Year Calculator open directly to their workspaces.

## [0.5.0] - 2026-11-18

### Added
- VelaIsland settings (widgets, hotkey, opacity, position) passed to the app as launch arguments
- One-click download and install for Windows companion apps, with progress and cancel
- Chart thumbnails in the Chart Code library

### Changed
- Whole app aligned to the Vela Design Guide 3.0 (Emerald Slate): shared colour roles for light and dark themes, DM Sans and Outfit type scale, card recipes, status badge colours, 2px focus ring, and reduced-motion support
- Media Converter redesigned from its orange theme to Emerald Slate, with Lucide icons, Vela buttons, fields and alerts, and an icon-only tool menu on narrow windows
- VelaPT restyled from its indigo theme to Emerald Slate
- Small labels raised to a 12px minimum across all screens

### Removed
- Unused Instrument, JetBrains Mono, Inter, Space Grotesk and IBM Plex font files

## [0.4.0] - 2026-11-09

First tracked release — the complete desktop version of Vela.

### Added
- Launcher home screen with service cards for the Vela family (Vela, VelaPTP, VelaIsland, VelaZoom) and one-click service launch
- Vela account sign-in directly on the launcher home page
- Web services open in-app via embedded web views
- **Chart Code Generator** — native visual tool for generating chart code (requires Vela connection)
- **Picture Connector** — native, fully local picture-combining tool (no account required)
- **Media Converter** — six-tool local media suite powered by native ffmpeg; all processing happens on the local PC and files are never uploaded; AI background-removal models are downloaded on demand and kept local
- **Taiwan Year Calculator** — offline ROC/Gregorian year converter
- Windows NSIS installer with desktop and Start menu shortcuts and selectable install directory
