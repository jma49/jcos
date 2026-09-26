// Everything JM/OS remembers in this browser goes through here. Storage can
// be missing (server rendering), blocked (some private windows, disabled
// site data) or full, and stored values can be stale or hand-edited, so
// every read has a fallback and every write may quietly do nothing: the
// desktop should behave the same, just without remembering.

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
