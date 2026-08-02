# Changelog

All notable changes to Skedio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/) with a
`-beta.N` pre-release suffix during the beta period.

## [1.0.0-beta.1] — 2026-08-01

Initial public beta release.

### Added
- Import, adjust (brightness/contrast/opacity/edge detection), and trace images with a ruler, protractor, grid and perspective-guide overlay
- Fullscreen Trace Mode with wake-lock, power-button exit detection, and a discreet long-press unlock corner
- Projects, folders, categories, tags, favorites, per-project notes, and search
- Autosave, manual save, and crash recovery
- Backup and restore to/from a portable `.skedio` file
- Installable PWA with offline support via a service worker, safe-area-aware layout, and a non-disruptive update flow that never interrupts an active tracing session
- Dark and light themes
- GitHub Pages static-export deployment alongside the primary Cloudflare Workers deployment

### Fixed
Prior to this release, a full production audit found and fixed a number of issues, most notably:
- A data-loss bug where entering and exiting Trace Mode could silently discard unsaved adjustments made in that session
- The service worker failing to register in practice due to a `window.load` timing issue, which meant offline support did not actually work despite being implemented
- Crash-recovery snapshots being stored in `localStorage` with full image data, risking the storage quota on large images and risking overwriting newer autosaved data with a stale copy
- A 1px black border appearing on edge-detected image previews
- A memory leak from Battery API listeners not being removed when leaving Trace Mode
- Missing safety caps on imported image dimensions, risking Android Canvas allocation failures on very large images
- Missing `safe-area-inset` handling throughout the app, including on Trace Mode's exit control
- Several accessibility gaps (invalid nested interactive elements, missing menu semantics, no keyboard/Escape handling on the project context menu)

See the project's audit reports for the complete list.
