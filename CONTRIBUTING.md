# Contributing to Skedio

Thanks for your interest in improving Skedio. This is a small, independently
maintained project — contributions, bug reports, and suggestions are all
welcome.

## Development setup

```bash
git clone https://github.com/lazos2020/Skedio.git
cd Skedio
npm install
npm run dev
```

The dev server prints a local URL to open. Skedio is a client-only app after
the initial page load — most of what you'll be working on lives under
`src/skedio/`.

## Before opening a pull request

```bash
npx tsc --noEmit   # must pass with zero errors
npm run build      # must build cleanly
```

Please also sanity-check the actual behavior in a browser, not just that it
compiles — this project has previously shipped bugs (a Trace Mode data-loss
issue, a service worker that silently never registered) that passed a clean
build and type-check but only showed up when actually clicking through the
app. If your change touches storage, the service worker, or Trace Mode
specifically, please describe how you tested it in the PR description.

### A note on linting

`npm run lint` will currently report a large number of `prettier/prettier`
errors across most of the codebase — this is a pre-existing mismatch between
`.prettierrc` (configured for double quotes) and the codebase's actual
single-quote convention throughout `src/skedio/`, not something introduced by
your change. Please don't run a project-wide `prettier --write` as part of an
unrelated PR; it would make the diff impossible to review. Match the existing
style of the file you're editing, and feel free to raise the config mismatch
as its own separate PR if you'd like to fix it properly.

Non-style lint errors (unused variables, `no-explicit-any`, etc.) should still
be fixed in code you touch.

## Project structure

See the "Project structure" section in [README.md](./README.md). The short
version: almost everything meaningful is under `src/skedio/`; the rest of
`src/` is TanStack Start/router scaffolding you're unlikely to need to touch.

## Reporting bugs

Please include:
- What you expected to happen vs. what actually happened
- Browser and OS/device (this app is Android-first; Android-specific reports
  are especially useful)
- Steps to reproduce
- Whether it reproduces in a fresh/incognito profile (helps rule out stale
  IndexedDB or service worker state from an earlier version)

For anything security-sensitive, please see [SECURITY.md](./SECURITY.md)
instead of opening a public issue.

## Code of conduct

Be respectful and constructive. Assume good faith. That's really it for a
project this size.
