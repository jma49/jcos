import { loadJSON, loadSettings, onStored, saveJSON } from '../core/storage';
import type { AppId } from '../core/types';

export interface Saved<T> {
  /** The stored value, or `fallback`. An object is merged over `fallback`, so fields added later get their default. */
  load(fallback: T): T;
  save(value: T): void;
  /**
   * Changes it starting from what's stored now, and returns the result:
   * every tab of the visitor shares it, so a best score set in another tab
   * since this one loaded isn't overwritten by a lower one.
   */
  update(fallback: T, change: (current: T) => T): T;
  /** Calls back when another tab of the visitor's changes it; returns a function that stops. */
  watch(callback: () => void): () => void;
}

const isRecord = (value: unknown): value is object => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Something an applet remembers in this browser, under its own key:
 * `os-<app>`, or `os-<app>-<name>` for a second value such as a best score.
 * Every read has a fallback and a write may quietly do nothing (storage
 * can be blocked or full), as with everything in `core/storage.ts`.
 */
export function saved<T>(app: AppId, name?: string): Saved<T> {
  const key = name ? `os-${app}-${name}` : `os-${app}`;
  const load = (fallback: T): T => (isRecord(fallback) ? (loadSettings(key, fallback) as T) : loadJSON(key, fallback));
  return {
    load,
    save: (value) => saveJSON(key, value),
    update: (fallback, change) => {
      const next = change(load(fallback));
      saveJSON(key, next);
      return next;
    },
    watch: (callback) => onStored(key, callback)
  };
}
