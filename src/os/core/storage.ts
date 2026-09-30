// Everything JM/OS remembers in this browser goes through here. Storage can
// be missing (server rendering), blocked (some private windows, disabled
// site data) or full, and stored values can be stale or hand-edited, so
// every read has a fallback and every write may quietly do nothing: the
// desktop should behave the same, just without remembering.
//
// Every tab of a visitor shares this storage, and each keeps its own copy
// in memory. So a change builds on what's stored now (updateJSON), not on
// a copy another tab may have overtaken, which would undo that tab's
// change; and state other tabs change is picked up (onStored).

const store = () => (typeof window === 'undefined' ? null : window.localStorage);

/** A stored string, or null when there's none or storage can't be read. */
export function load(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Stores a string, or forgets the key for null. */
export function save(key: string, value: string | null) {
  try {
    if (value === null) store()?.removeItem(key);
    else store()?.setItem(key, value);
  } catch {}
}

/** A stored JSON value, or `fallback` when it's missing, unreadable or not JSON. */
export function loadJSON<T>(key: string, fallback: T): T {
  const raw = load(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Stores a value as JSON, or forgets the key for null. */
export function saveJSON(key: string, value: unknown) {
  save(key, value === null ? null : JSON.stringify(value));
}

/** Stored settings over their defaults, so settings added later get their default. */
export function loadSettings<T extends object>(key: string, defaults: T): T {
  const saved = loadJSON<Partial<T> | null>(key, null);
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...defaults, ...saved } : defaults;
}

/**
 * Changes a stored JSON value starting from what's stored now, and returns
 * the result: a best score, a setting or an item added in another tab
 * since this one last looked isn't overwritten.
 */
export function updateJSON<T>(key: string, fallback: T, change: (current: T) => T): T {
  const next = change(loadJSON(key, fallback));
  saveJSON(key, next);
  return next;
}

/**
 * Calls back when another tab changes `key` (or clears storage). The tab
 * that writes isn't told: it already knows. Returns a function that stops.
 */
export function onStored(key: string, callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const listener = (e: StorageEvent) => {
    if (e.key === key || e.key === null) callback();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

/**
 * The storage itself, for Backup & Restore, which reads every key and puts
 * them back (apps/preferences/backup.ts). Throws where storage is blocked,
 * which the pane tells the visitor. Everything else goes through the
 * functions above.
 */
export function wholeStorage(): Storage {
  return window.localStorage;
}

// What's remembered for this tab alone (sessionStorage): a reload keeps it,
// and the visitor's other tabs don't see it. Only the boot screen uses it,
// to run once a tab (Desktop.tsx); anything a visitor chooses goes through
// load and save, which every tab shares.
const tabStore = () => (typeof window === 'undefined' ? null : window.sessionStorage);

/** A string remembered for this tab, or null when there's none or storage can't be read. */
export function loadForTab(key: string): string | null {
  try {
    return tabStore()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Remembers a string for this tab. */
export function saveForTab(key: string, value: string) {
  try {
    tabStore()?.setItem(key, value);
  } catch {}
}
