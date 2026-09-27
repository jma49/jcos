import { loadJSON, loadSettings, saveJSON } from '../core/storage';
import type { AppId } from '../core/types';

export interface Saved<T> {
  /** The stored value, or `fallback`. An object is merged over `fallback`, so fields added later get their default. */
  load(fallback: T): T;
  save(value: T): void;
}

const isRecord = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Something an applet remembers in this browser, under its own key:
 * `os-<app>`, or `os-<app>-<name>` for a second value such as a best score.
 * Every read has a fallback and a write may quietly do nothing (storage
 * can be blocked or full), as with everything in `core/storage.ts`.
 */
export function saved<T>(app: AppId, name?: string): Saved<T> {
  const key = name ? `os-${app}-${name}` : `os-${app}`;
  return {
    load: (fallback) => (isRecord(fallback) ? loadSettings(key, fallback) : loadJSON(key, fallback)),
    save: (value) => saveJSON(key, value)
  };
}
