/**
 * User-configurable app settings persisted in localStorage. These are simple
 * client-side preferences (not artwork data) and never leave the device.
 */

export type TraceOrientation = 'follow' | 'portrait' | 'landscape';

export interface SkedioSettings {
  keepScreenAwake: boolean;
  traceOrientation: TraceOrientation;
  highContrast: boolean;
  ppi: number;
}

export const defaultSettings: SkedioSettings = {
  keepScreenAwake: true,
  traceOrientation: 'follow',
  highContrast: true,
  ppi: 160,
};

const STORAGE_KEY = 'skedio-settings';

export function loadSettings(): SkedioSettings {
  if (typeof localStorage === 'undefined') return { ...defaultSettings };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<SkedioSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: SkedioSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Resets ONLY app preferences to defaults. Does NOT touch the theme, projects,
 * categories, folders, or any user artwork/data.
 */
export function resetSettings(): SkedioSettings {
  saveSettings(defaultSettings);
  return { ...defaultSettings };
}
