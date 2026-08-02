# Security Policy

## Supported versions

Skedio is currently in public beta. Security fixes are made against the
latest release only.

| Version | Supported |
| --- | --- |
| 1.0.0-beta.1 and later | ✅ |
| Pre-release / internal builds | ❌ |

## Skedio's architecture, briefly

Skedio is a client-only, offline-first application. There is no backend
server, no user accounts, and no authentication. Every project — images,
adjustments, tags, notes — is stored locally in your browser's IndexedDB and
never leaves your device unless you explicitly export a backup file. The
`/sitemap.xml` route on the Cloudflare Workers deployment is the only
server-executed code in the project; the GitHub Pages deployment is fully
static.

This significantly narrows the realistic attack surface compared to a typical
web application (no server-side data to breach, no session/auth tokens to
steal), but a few areas are still worth reporting issues against:

- **Import/parsing safety** — how the app handles imported images and
  `.skedio` backup/restore files (malformed or oversized files should fail
  gracefully, not crash or corrupt existing data)
- **Service worker behavior** — caching logic that could serve stale or
  incorrect content, or a compromised update path
- **Cross-site scripting** — any way user-supplied content (project names,
  tags, notes) could execute as code rather than being rendered as text
- **Dependency vulnerabilities** in `package.json`

## Reporting a vulnerability

Please report security issues privately rather than opening a public GitHub
issue. Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
feature on this repository (**Security → Report a vulnerability**).

Please include:
- A description of the issue and its potential impact
- Steps to reproduce (a minimal example helps a lot)
- The browser/OS/version you tested on, if relevant

We'll do our best to acknowledge reports promptly and keep you updated as the
issue is investigated and fixed. Since this is a small, independently
maintained project, please be patient — there's no dedicated security team,
just best-effort maintenance.

## Disclosure

We ask that you give us a reasonable opportunity to fix an issue before any
public disclosure. There is no bug bounty program at this time.
