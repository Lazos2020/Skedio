/**
 * Crash recovery: while a tracing session is active we persist a lightweight
 * pointer (project id + name only — never image data) to localStorage and
 * mark the session "open". On a normal exit the pointer is cleared. If the
 * app is reopened and a pointer is still marked open, the app closed
 * unexpectedly and we offer to restore the session.
 *
 * Deliberately NOT stored here: the project's imageDataUrl, thumbnailDataUrl,
 * or coverDataUrl. Those are already safely autosaved to IndexedDB by the
 * Tracing Studio's own debounced/interval/visibility-flush save pipeline —
 * duplicating them into localStorage would risk the ~5-10MB per-origin quota
 * on any single large image and, since this snapshot is only taken once (when
 * the studio opens) and never updated as the user edits, restoring from a
 * copy of the full project could silently revert newer autosaved changes.
 * Restoring now always re-fetches the current record from IndexedDB by id.
 */

export interface TraceSession {
  projectId: string;
  projectName: string;
  savedAt: number;
  /** true while a session is in progress (cleared on a clean exit). */
  open: boolean;
}

const STORAGE_KEY = 'skedio-active-session';

export function saveSession(projectId: string, projectName: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const session: TraceSession = { projectId, projectName, savedAt: Date.now(), open: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

/** Marks the current session as cleanly ended (no crash to recover). */
export function endSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Returns a recoverable session ONLY if one was left open (i.e. the app was
 * closed unexpectedly without a clean exit). Returns null otherwise.
 */
export function getRecoverableSession(): TraceSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TraceSession;
    if (parsed && parsed.open && parsed.projectId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function discardSession(): void {
  endSession();
}
