# Skedio

**A fast, private, ad-free tracing app made for artists.**

Skedio turns any phone or tablet into a light box. Import a drawing, tune brightness, contrast, opacity and edge detection, then place paper over the screen and trace it with the help of a ruler, protractor, grid and perspective guides. Everything runs and stays on your device — Skedio does not generate AI art, does not teach drawing, and does not require an internet connection to use.

**Live app:** https://lazos2020.github.io/Skedio/

## Features

- **Import & adjust** — JPG/PNG/WEBP up to 50MB, with brightness/contrast/opacity/edge-detection controls and an automatic safety cap on extreme resolutions
- **Trace Mode** — a fullscreen, distraction-free tracing view with wake-lock (screen stays on), a discreet long-press corner to exit, and support for exiting via a phone's power button
- **Overlay tools** — ruler, protractor, grid, and perspective guides, calibrated to your device's actual screen size
- **Organization** — folders, categories, tags, favorites, per-project notes, and search
- **Autosave & crash recovery** — projects save automatically as you work; if the app closes unexpectedly, you're offered your session back
- **Backup & restore** — export your whole library (or a single project) to a `.skedio` file and restore it later or on another device
- **Installable PWA** — works offline after the first visit, installs to your home screen, and updates without ever interrupting an active tracing session
- **Dark and light themes**, built for Android phones and tablets first (desktop browsers work too)

All data — images, projects, settings — is stored locally in your browser's IndexedDB. Nothing is uploaded anywhere.

## Tech stack

- [React 19](https://react.dev) + [TanStack Start](https://tanstack.com/start) (SSR framework) + [TanStack Router](https://tanstack.com/router)
- [Vite](https://vite.dev) + [Nitro](https://nitro.build) for the build/server layer
- [Tailwind CSS 4](https://tailwindcss.com)
- IndexedDB for local storage, Canvas 2D for image processing — no backend, no server-side data
- A hand-written service worker (`public/sw.js`) for offline support

## Getting started

```bash
npm install
npm run dev       # starts the dev server
```

Other scripts:

```bash
npm run build      # production build (Cloudflare Workers target)
npm run preview    # preview a production build locally
npx tsc --noEmit   # type-check
npm run lint        # eslint
npm run format      # prettier --write
```

## Deployment

Skedio has two build targets from the same source:

- **Cloudflare Workers** (primary) — `npm run build` builds a full SSR app targeting Cloudflare Workers via Nitro (see `vite.config.ts`, `.output/server/wrangler.json` after building).
- **GitHub Pages** (static mirror) — `.github/workflows/deploy.yml` builds a static export for the project site at `https://lazos2020.github.io/Skedio/`. Because GitHub Pages can only serve static files and this app has no server functions or API routes beyond a static sitemap, the workflow builds with `BUILD_TARGET=github-pages`, briefly runs the built server to capture its rendered HTML as a static snapshot (`scripts/export-static.mjs`), and publishes that. See the comments in both files for exactly how the base-path handling works.

## Project structure

```
src/skedio/            The actual application (everything else in src/ is
                        TanStack Start/routing scaffolding)
  components/           UI screens and components
  lib/                   IndexedDB, backup/restore, image processing,
                          service worker registration, settings
  App.tsx                Top-level state and view routing
public/
  sw.js                  Service worker (offline support, update lifecycle)
  manifest.webmanifest    PWA manifest
scripts/
  export-static.mjs      GitHub Pages static-export capture script
```

## License

MIT — see [LICENSE](./LICENSE).
