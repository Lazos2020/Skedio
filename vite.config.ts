// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Set by .github/workflows/deploy.yml only. The default `npm run build` (no
// env var) is completely untouched and still targets Cloudflare Workers.
const isGithubPages = process.env.BUILD_TARGET === "github-pages";
// GitHub Pages project sites are served under /<repo-name>/, not the domain
// root — e.g. https://lazos2020.github.io/Skedio/. Passed from the workflow
// (derived from the actual repo name) rather than hardcoded here.
const pagesBasePath = process.env.PAGES_BASE_PATH || "/";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...(isGithubPages
    ? {
        // node-server is the preset this project has been verified against
        // in local testing (a plain Node HTTP server). The GitHub Pages
        // workflow runs this server briefly during the build just to
        // capture its rendered HTML as a static snapshot — see
        // .github/workflows/deploy.yml — rather than relying on
        // TanStack Start's built-in SPA/prerender machinery, which doesn't
        // currently resolve this project's customized Nitro output layout
        // correctly (verified locally; tracked as a known rough edge
        // upstream, not something worth patching around here).
        nitro: { preset: "node-server" },
        vite: { base: pagesBasePath },
      }
    : {}),
});
