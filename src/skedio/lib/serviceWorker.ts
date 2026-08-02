/**
 * Registers the Skedio service worker and reports when an update has
 * downloaded and is ready to activate. The actual activation is always
 * deferred to an explicit user action via applyUpdate() — see public/sw.js
 * for why (in short: never interrupt an in-progress tracing session).
 */

export interface SwRegistrationHandle {
  registration: ServiceWorkerRegistration;
}

export function registerServiceWorker(onUpdateAvailable: () => void): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Skip in dev — a service worker intercepting fetches fights with Vite's
  // dev server / HMR and isn't useful before a real production build exists.
  if (!import.meta.env.PROD) return;

  const doRegister = () => {
    // BASE_URL always has a trailing slash ("/" at the root, "/Skedio/" under
    // a GitHub Pages project subpath) — building both the script URL and the
    // scope from it means this works correctly under either deployment.
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        // A worker was already installed and waiting from a previous visit.
        if (registration.waiting && navigator.serviceWorker.controller) {
          onUpdateAvailable();
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // "installed" + an existing controller means this is a genuine
            // update (not the very first install on a fresh visit).
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdateAvailable();
            }
          });
        });
      })
      .catch(() => {
        // Offline support degrades gracefully — the app still works online,
        // it just won't have offline caching this session.
      });
  };

  // This function runs from inside a React effect, i.e. only after the app
  // has already mounted — by which point `load` has typically already
  // fired. Registering a 'load' listener at that point would wait forever
  // for an event that already happened, so check readyState first.
  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister, { once: true });
  }
}

let reloadTriggered = false;

/** Activates a waiting update and reloads once it takes control. Guarded
 * against firing more than once so a flaky double-tap can't trigger a
 * reload loop. */
export function applyUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration?.waiting) return;

    if (!reloadTriggered) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadTriggered) return;
        reloadTriggered = true;
        window.location.reload();
      });
    }

    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}
