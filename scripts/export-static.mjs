#!/usr/bin/env node
// Captures a static snapshot of this app's SSR output for GitHub Pages.
//
// Why this exists instead of using TanStack Start's built-in SPA/prerender
// mode: that feature currently expects a conventional `dist/server/server.js`
// output layout and doesn't resolve this project's Nitro output directory
// (`.output/server/index.mjs`) correctly, which was confirmed by actually
// running it, not assumed. This script does the same job — snapshot the
// server-rendered HTML to a static file — by briefly running the real
// server this project already builds and fetching it directly.
//
// This is safe for this app specifically because it has exactly one real
// page route (`/`) and no server functions; everything meaningful happens
// client-side after hydration (IndexedDB, Canvas, the service worker).
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = '.output/public';

// Must match vite.config.ts's default and the workflow's PAGES_BASE_PATH.
// The server itself redirects bare "/" to this path when it's not "/" (e.g.
// "/Skedio/"), so routes below are fetched relative to it directly rather
// than relying on following that redirect.
const BASE_PATH = process.env.PAGES_BASE_PATH || '/';

const ROUTES = [
  { path: BASE_PATH, file: 'index.html' },
  { path: `${BASE_PATH}sitemap.xml`, file: 'sitemap.xml' },
];

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`Server at ${url} did not become ready in time`);
}

async function main() {
  const server = spawn('node', ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });

  const cleanup = () => {
    server.kill();
  };
  process.on('exit', cleanup);

  try {
    await waitForServer(BASE);

    for (const route of ROUTES) {
      const res = await fetch(`${BASE}${route.path}`);
      if (!res.ok) {
        throw new Error(`Failed to capture ${route.path}: ${res.status} ${res.statusText}`);
      }
      const body = await res.text();
      await writeFile(`${OUT_DIR}/${route.file}`, body, 'utf-8');
      console.log(`Captured ${route.path} -> ${OUT_DIR}/${route.file} (${body.length} bytes)`);
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
