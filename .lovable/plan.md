
## Skedio v1 Beta Release Plan

Two independent asks, batched into one release. All existing data, themes, and UI patterns preserved.

---

### A. Settings — Feedback & Bug Report emails

**File:** `src/skedio/components/SettingsView.tsx`

- Update the recipient constant used by feedback to `pyrrosathinaios@gmail.com` (dedicated `FEEDBACK_EMAIL` constant so About page's `skedio.app@gmail.com` stays untouched unless you want it changed too — will confirm).
- Rewrite `handleSendFeedback` body to the new template:
  ```
  App Version:
  Device:
  Android Version:
  Message:
  --------------------------------
  Please describe your suggestion, feedback, or idea here.
  ```
  Auto-fill App Version (`SKEDIO_APP_VERSION`), Device (`navigator.userAgent` short), Android Version (regex).
- Add `handleReportBug` with subject `Skedio Bug Report` and the extended template (Project Name, Steps to Reproduce, Expected/Actual, Additional Info).
- Both handlers use `window.location.href = 'mailto:…'` inside a `try` with a 500 ms `document.hasFocus()` check → if browser never lost focus, show notification `"No email application found on this device."` (works on Android, degrades gracefully on desktop).
- Add a second button `🐞 Report a Bug` directly below `💬 Send Feedback` in the existing Feedback card, matching the same styling (cyan-600 → replace with rose-600 for bug to differentiate, still theme-safe).
- Keep both dark + light theme by reusing existing card classes.

---

### B. v1 Beta feature bundle

#### 1. Version bump
- `src/skedio/lib/backup.ts`: `SKEDIO_APP_VERSION = '1.0.0-beta.1'` and add a display string `SKEDIO_APP_VERSION_LABEL = 'Skedio v1 Beta'` used in About/Settings/backup metadata surfaces.

#### 2. Types (`src/skedio/types.ts`)
- Add `tags?: string[]` to `Project` (isFavorite already exists).
- Backward compatible: readers default to `[]`.

#### 3. Favorites
- `HomeView` / `ProjectsView`: render a small ⭐ overlay on cards where `project.isFavorite`.
- `ProjectsView`: add a "Favorites" toggle chip in the filter row. When active, filter to favorites only and sort favorites-first. Empty state text: `"No favorite projects yet."`
- Toggle via context menu (below).

#### 4. Project search
- `ProjectsView`: add a search input above the category chips with a clear (✕) button. Normalizes case + collapses whitespace. Filters project list live. Empty result text: `"No projects found."` Uses `useMemo` for perf.

#### 5. Tags + tag filter
- New file `src/skedio/lib/tags.ts` — helpers `allTagsFromProjects`, `normalizeTag`.
- `ProjectsView`: horizontal DragScroll chip row of all tags in use; multi-select filter; "Clear Filters" button appears when any tags are selected.
- Tag CRUD lives inside the per-project **Edit Tags** action of the context menu (small modal with chip input + suggestions from existing tags).

#### 6. Long-press / right-click context menu
- New component `src/skedio/components/ProjectContextMenu.tsx` — floating Material-style menu with icons, fade+scale animation, backdrop click-to-close, keyboard Escape close.
- Actions wired:
  - ⭐ Add/Remove Favorite → toggle `isFavorite`, save.
  - 📂 Move to Folder → small submenu of folders + "No folder".
  - 🏷 Edit Tags → tag editor modal.
  - 📝 Edit Notes → notes modal (reuse existing notes if present; else add `notes?: string` on Project — already stored via TracingStudio, keep as-is).
  - ✏ Rename → prompt-style modal.
  - 📤 Export Project → serialize single project to `.skedio` (reuse backup format, one-project subset).
  - 📋 Duplicate → deep-clone with new id/createdAt, preserves notes/tags/folder/cover.
  - 🗑 Delete → confirm modal, then delete.
- Trigger from HomeView project card + ProjectsView cards via:
  - `onContextMenu` (right-click)
  - Long-press: `onPointerDown` + 500 ms timer cancelled on move/up.

#### 7. Project card polish
- Card renders: cover, name, ⭐ if fav, folder name, tag chips (max 3 + `+N`), last opened date. Layout unchanged, just add missing lines. Same in HomeView "Continue Project" card and ProjectsView list.

#### 8. Performance
- Memoize filtered lists (`useMemo`), stabilize handlers (`useCallback`), project cards wrapped in `React.memo`. Sufficient for 500+ items.

#### 9. Accessibility
- `aria-label` on all icon-only buttons (context menu trigger, star toggle, search clear).
- Context menu items are real `<button>` elements, keyboard focusable, `Escape` closes.

---

### Technical notes

- No schema migration needed — new fields are optional and default at read time.
- All new UI uses existing theme tokens (bg-[#181818] / border-white/10 in dark, adaptive in light). No new colors introduced.
- Export-single-project reuses `SkedioBackupFile` shape with `projects: [oneProject]` and empty folders/categories → guaranteed round-trip on restore.

### Files touched

- edit: `SettingsView.tsx`, `HomeView.tsx`, `ProjectsView.tsx`, `types.ts`, `lib/backup.ts`, `App.tsx`, `lib/db.ts` (only if a favorites index helper is needed — likely not)
- new:  `components/ProjectContextMenu.tsx`, `components/ProjectCardMeta.tsx` (shared card meta row), `lib/tags.ts`

### One quick confirmation

The About page currently shows `CONTACT_EMAIL = skedio.app@gmail.com`. Do you want the About page contact email also switched to `pyrrosathinaios@gmail.com`, or should only the Feedback + Bug Report buttons use the new address?
