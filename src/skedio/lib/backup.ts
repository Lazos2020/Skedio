import {
  exportAllData,
  importAllData,
  setBackupMeta,
  SkedioBackupData,
} from './db';

// Bumped alongside the app; embedded in every backup file.
export const SKEDIO_APP_VERSION = '1.0.0-beta.1';
// Human-readable label shown throughout the UI (About page, About card,
// backup card, footer). The semver above is kept for compatibility checks
// on backup files.
export const SKEDIO_APP_VERSION_LABEL = 'Skedio v1 Beta';
// Increment when the shape of SkedioBackupData changes in a breaking way.
export const SKEDIO_DATA_VERSION = 1;

export interface SkedioBackupFile {
  format: 'skedio-backup';
  appVersion: string;
  dataVersion: number;
  createdAt: number;
  data: SkedioBackupData;
}

export interface CreatedBackup {
  json: string;
  sizeBytes: number;
  projectCount: number;
  createdAt: number;
}

// Serializes every piece of user data into a single .skedio backup payload
// and records lightweight metadata (date/size/count) for the Settings card.
export async function createBackup(): Promise<CreatedBackup> {
  const data = await exportAllData();
  const createdAt = Date.now();
  const file: SkedioBackupFile = {
    format: 'skedio-backup',
    appVersion: SKEDIO_APP_VERSION,
    dataVersion: SKEDIO_DATA_VERSION,
    createdAt,
    data,
  };
  const json = JSON.stringify(file);
  const sizeBytes = new Blob([json]).size;
  const projectCount = data.projects.length;
  await setBackupMeta({ lastBackupAt: createdAt, sizeBytes, projectCount });
  return { json, sizeBytes, projectCount, createdAt };
}

// Triggers a client-side download of the backup with the custom .skedio ext.
export function downloadBackup(json: string): void {
  const blob = new Blob([json], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `skedio-backup-${stamp}.skedio`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Validates and parses raw text from a chosen file. Throws a friendly error
// when the file is corrupted or not a Skedio backup.
export function parseBackupFile(text: string): SkedioBackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file could not be read. It may be corrupted.');
  }
  const f = parsed as Partial<SkedioBackupFile>;
  if (
    !f ||
    f.format !== 'skedio-backup' ||
    !f.data ||
    !Array.isArray(f.data.projects) ||
    !Array.isArray(f.data.folders) ||
    !Array.isArray(f.data.categories)
  ) {
    throw new Error('This is not a valid .skedio backup file.');
  }
  return f as SkedioBackupFile;
}

export async function restoreBackup(file: SkedioBackupFile): Promise<void> {
  await importAllData(file.data);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
