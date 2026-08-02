import { Project, CollectionFolder, AppStats, defaultAppStats } from '../types';

const DB_NAME = 'skedio_tracing_db';
const DB_VERSION = 2;
const PROJECTS_STORE = 'projects';
const FOLDERS_STORE = 'folders';
const META_STORE = 'meta';

// A single shared connection is opened lazily and reused for every call in
// this module, instead of calling indexedDB.open() again on every read/write.
// Each open() is an async round-trip into the browser's storage process; for
// bulk operations (export, import/restore, clearing hundreds of projects)
// reopening per-call adds real, avoidable latency.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onsuccess = () => {
      const db = request.result;
      // If another tab upgrades the schema, this connection is force-closed.
      // Drop the cached promise so the next call reopens a fresh connection
      // instead of every future operation hanging against a dead handle.
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const store = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
        store.createIndex('folderId', 'folderId', { unique: false });
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });

  return dbPromise;
}

/* ---------------- Generic meta helpers ---------------- */

async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const request = tx.objectStore(META_STORE).get(key);
    request.onsuccess = () => resolve((request.result as { key: string; value: T } | undefined)?.value);
    request.onerror = () => reject(request.error);
  });
}

async function setMeta<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    const request = tx.objectStore(META_STORE).put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* ---------------- Usage stats ---------------- */

const STATS_KEY = 'app_stats';

export async function getAppStats(): Promise<AppStats> {
  const value = await getMeta<Partial<AppStats>>(STATS_KEY);
  return { ...defaultAppStats, ...(value ?? {}) };
}

export async function bumpAppStats(delta: Partial<AppStats>): Promise<AppStats> {
  const current = await getAppStats();
  const next: AppStats = {
    appOpens: current.appOpens + (delta.appOpens ?? 0),
    imagesImported: current.imagesImported + (delta.imagesImported ?? 0),
    totalTracingTimeMs: current.totalTracingTimeMs + (delta.totalTracingTimeMs ?? 0),
  };
  await setMeta(STATS_KEY, next);
  return next;
}

/* ---------------- User categories ---------------- */

const CATEGORIES_KEY = 'user_categories';

export async function getCategories(): Promise<string[]> {
  const value = await getMeta<string[]>(CATEGORIES_KEY);
  return value ?? [];
}

export async function saveCategories(categories: string[]): Promise<void> {
  await setMeta(CATEGORIES_KEY, categories);
}

export async function addCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();
  const current = await getCategories();
  if (!trimmed || current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return current;
  }
  const next = [...current, trimmed];
  await saveCategories(next);
  return next;
}

export async function deleteCategory(name: string): Promise<string[]> {
  const current = await getCategories();
  const next = current.filter((c) => c !== name);
  await saveCategories(next);
  return next;
}

/* ---------------- Pinned categories ---------------- */

// Pinned categories are stored as an ordered list so their arrangement
// persists across restarts and they always render first.
const PINNED_CATEGORIES_KEY = 'pinned_categories';

export async function getPinnedCategories(): Promise<string[]> {
  const value = await getMeta<string[]>(PINNED_CATEGORIES_KEY);
  return value ?? [];
}

export async function savePinnedCategories(pinned: string[]): Promise<void> {
  await setMeta(PINNED_CATEGORIES_KEY, pinned);
}

export async function togglePinnedCategory(name: string): Promise<string[]> {
  const current = await getPinnedCategories();
  const next = current.includes(name)
    ? current.filter((c) => c !== name)
    : [...current, name];
  await savePinnedCategories(next);
  return next;
}

/* ---------------- Backup metadata ---------------- */

export interface BackupMeta {
  lastBackupAt: number;
  sizeBytes: number;
  projectCount: number;
}

const BACKUP_META_KEY = 'backup_meta';

export async function getBackupMeta(): Promise<BackupMeta | null> {
  const value = await getMeta<BackupMeta>(BACKUP_META_KEY);
  return value ?? null;
}

export async function setBackupMeta(meta: BackupMeta): Promise<void> {
  await setMeta(BACKUP_META_KEY, meta);
}

/* ---------------- One-time demo cleanup ---------------- */

// Fixed ids that previous versions seeded automatically. On the very first
// launch of this version we remove ONLY these known demo records — user
// created projects/folders are never touched. A flag ensures this runs once.
const LEGACY_SAMPLE_PROJECT_IDS = ['sample-anime', 'sample-botanical', 'sample-geometric'];
const LEGACY_SAMPLE_FOLDER_IDS = ['folder-1', 'folder-2', 'folder-3'];
const DEMO_CLEARED_FLAG = 'demo_cleared_v1';

export async function clearDemoDataOnce(): Promise<void> {
  const done = await getMeta<boolean>(DEMO_CLEARED_FLAG);
  if (done) return;

  for (const id of LEGACY_SAMPLE_PROJECT_IDS) {
    await deleteProject(id);
  }
  for (const id of LEGACY_SAMPLE_FOLDER_IDS) {
    await deleteFolderRecord(id);
  }
  await setMeta(DEMO_CLEARED_FLAG, true);
}

/* ---------------- Projects ---------------- */

export async function getAllProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly');
    const request = tx.objectStore(PROJECTS_STORE).getAll();
    request.onsuccess = () =>
      resolve((request.result as Project[]).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt));
    request.onerror = () => reject(request.error);
  });
}

export async function getProjectById(id: string): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly');
    const request = tx.objectStore(PROJECTS_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    const request = tx.objectStore(PROJECTS_STORE).put({ ...project, updatedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    const request = tx.objectStore(PROJECTS_STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Deletes every project in a single transaction. Used by "Clear All Saved
// Projects" in Settings — with hundreds of projects, looping deleteProject()
// once per id means hundreds of sequential transactions; a single clear()
// is one round-trip regardless of how many projects exist.
export async function clearAllProjects(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    const request = tx.objectStore(PROJECTS_STORE).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* ---------------- Folders ---------------- */

export async function getAllFolders(): Promise<CollectionFolder[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readonly');
    const request = tx.objectStore(FOLDERS_STORE).getAll();
    request.onsuccess = () =>
      resolve((request.result as CollectionFolder[]).sort((a, b) => a.name.localeCompare(b.name)));
    request.onerror = () => reject(request.error);
  });
}

export async function saveFolder(folder: CollectionFolder): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const request = tx.objectStore(FOLDERS_STORE).put(folder);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Deletes a folder record only (used by the demo cleanup, which must not
// touch any projects).
async function deleteFolderRecord(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const request = tx.objectStore(FOLDERS_STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  // First clear folderId from projects in this folder
  const projects = await getAllProjects();
  for (const p of projects) {
    if (p.folderId === id) {
      await saveProject({ ...p, folderId: null });
    }
  }
  await deleteFolderRecord(id);
}

/* ---------------- Backup export / import ---------------- */

export interface SkedioBackupData {
  projects: Project[];
  folders: CollectionFolder[];
  categories: string[];
  pinnedCategories: string[];
  stats: AppStats;
  preferences: Record<string, unknown>;
}

// Collects every piece of user data needed to fully restore the app.
export async function exportAllData(): Promise<SkedioBackupData> {
  const [projects, folders, categories, pinnedCategories, stats] = await Promise.all([
    getAllProjects(),
    getAllFolders(),
    getCategories(),
    getPinnedCategories(),
    getAppStats(),
  ]);

  // Client-side preferences (e.g. theme) live in localStorage, not IndexedDB.
  const preferences: Record<string, unknown> = {};
  if (typeof localStorage !== 'undefined') {
    const theme = localStorage.getItem('skedio-theme');
    if (theme) preferences['skedio-theme'] = theme;
  }

  return { projects, folders, categories, pinnedCategories, stats, preferences };
}

function clearStore(store: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const request = tx.objectStore(store).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

// Replaces all current data with the contents of a validated backup.
export async function importAllData(data: SkedioBackupData): Promise<void> {
  await clearStore(PROJECTS_STORE);
  await clearStore(FOLDERS_STORE);

  for (const p of data.projects ?? []) {
    await saveProject(p);
  }
  for (const f of data.folders ?? []) {
    await saveFolder(f);
  }

  await saveCategories(data.categories ?? []);
  await savePinnedCategories(data.pinnedCategories ?? []);
  if (data.stats) {
    await setMeta(STATS_KEY, data.stats);
  }

  // Restore client-side preferences (theme, etc.).
  if (data.preferences && typeof localStorage !== 'undefined') {
    for (const [key, value] of Object.entries(data.preferences)) {
      if (typeof value === 'string') localStorage.setItem(key, value);
    }
  }
}

/* ---------------- Storage information ---------------- */

export interface StorageInfo {
  projectCount: number;
  categoryCount: number;
  imageCount: number;
  usageBytes: number | null; // null when the Storage Estimate API is unavailable
}

/**
 * Gathers counts for the Settings "Storage" section. Image count is the number
 * of stored source images (one per project) plus any custom covers. Approximate
 * usage comes from the Storage Estimate API when available, otherwise it falls
 * back to measuring the byte length of the stored data URLs.
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  const [projects, categories] = await Promise.all([getAllProjects(), getCategories()]);

  const imageCount = projects.reduce(
    (n, p) => n + (p.imageDataUrl ? 1 : 0) + (p.coverDataUrl ? 1 : 0),
    0
  );

  let usageBytes: number | null = null;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') usageBytes = est.usage;
    }
  } catch {
    /* ignore */
  }

  // Fallback: approximate from the stored data-URL payloads.
  if (usageBytes === null) {
    usageBytes = projects.reduce(
      (n, p) =>
        n +
        (p.imageDataUrl?.length ?? 0) +
        (p.thumbnailDataUrl?.length ?? 0) +
        (p.coverDataUrl?.length ?? 0),
      0
    );
  }

  return {
    projectCount: projects.length,
    categoryCount: categories.length,
    imageCount,
    usageBytes,
  };
}
