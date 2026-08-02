import { Project } from '../types';

/** Normalizes a raw tag string: trims, collapses whitespace. Case preserved. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Case-insensitive uniqueness check. */
export function tagsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Sorted, de-duplicated list of every tag used across all projects. */
export function allTagsFromProjects(projects: Project[]): string[] {
  const seen = new Map<string, string>(); // lower -> original casing
  for (const p of projects) {
    for (const t of p.tags ?? []) {
      const norm = normalizeTag(t);
      if (!norm) continue;
      const key = norm.toLowerCase();
      if (!seen.has(key)) seen.set(key, norm);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}