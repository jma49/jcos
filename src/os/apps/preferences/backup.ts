// Backup & Restore: everything JM/OS remembers in this browser, as a file
// that can be read back in here or in another browser. Sign-in sessions,
// the development backend's data, caches and the open windows stay out.

/** The keys a backup carries: JM/OS's own, and the appearance. */
export function backedUp(key: string) {
  if (key === 'theme') return true;
  if (!key.startsWith('os-')) return false;
  if (key === 'os-auth' || key === 'os-windows' || key.startsWith('os-dev-') || key.endsWith('-cache')) return false;
  return true;
}

/** What Reset puts back to its default: the choices System Preferences makes, and nothing else. */
export const PREFERENCE_KEYS = [
  'theme',
  'os-accent',
  'os-glass',
  'os-wallpaper',
  'os-wallpaper-rotate',
  'os-screensaver',
  'os-sound',
  'os-place',
  'os-system'
];

export const BACKUP_FORMAT = 'jmos-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  saved: string;
  settings: Record<string, string>;
}

type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export function makeBackup(store: Store, now = new Date()): Backup {
  const settings: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    const value = key === null ? null : store.getItem(key);
    if (key !== null && value !== null && backedUp(key)) settings[key] = value;
  }
  return { format: BACKUP_FORMAT, version: 1, saved: now.toISOString(), settings };
}

/**
 * Reads a backup file's text back into storage. Only keys a backup could
 * carry, with string values, are written. Returns how many, or throws with
 * something to show when the file isn't a backup.
 */
export function restoreBackup(store: Store, text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a JM/OS backup.');
  }
  const backup = parsed as Partial<Backup> | null;
  if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.settings !== 'object' || !backup.settings) {
    throw new Error('That file isn’t a JM/OS backup.');
  }
  if (backup.version !== 1) throw new Error('That backup is from a newer JM/OS.');
  let count = 0;
  for (const [key, value] of Object.entries(backup.settings)) {
    if (!backedUp(key) || typeof value !== 'string') continue;
    store.setItem(key, value);
    count++;
  }
  return count;
}

/** Forgets every choice System Preferences made. */
export function resetPreferences(store: Store) {
  for (const key of PREFERENCE_KEYS) store.removeItem(key);
}
