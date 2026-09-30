import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { loadForTab, onStored, saveForTab, saveJSON, updateJSON } from './storage';

// Several tabs of one visitor share storage: a change builds on what's
// stored now, and a tab hears of the others' changes. What's kept for one
// tab alone lives apart.

let map: Map<string, string>;
let tab: Map<string, string>;
let target: EventTarget;

const storage = (kept: Map<string, string>) => ({
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key)
});

beforeEach(() => {
  map = new Map();
  tab = new Map();
  target = new EventTarget();
  vi.stubGlobal('window', {
    localStorage: storage(map),
    sessionStorage: storage(tab),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target)
  });
});

afterEach(() => vi.unstubAllGlobals());

/** What the browser does in every other tab when one writes. */
const otherTabWrote = (key: string | null) => target.dispatchEvent(Object.assign(new Event('storage'), { key }));

describe('updateJSON', () => {
  test('starts from what’s stored, so another tab’s item isn’t lost', () => {
    saveJSON('os-applets', ['minesweeper']);
    map.set('os-applets', JSON.stringify(['minesweeper', 'pinball'])); // another tab installed Pinball
    expect(updateJSON<string[]>('os-applets', [], (installed) => [...installed, 'spider'])).toEqual(['minesweeper', 'pinball', 'spider']);
  });

  test('uses the fallback when nothing is stored', () => {
    expect(updateJSON('os-x', { n: 1 }, (x) => ({ n: x.n + 1 }))).toEqual({ n: 2 });
  });
});

describe('onStored', () => {
  test('calls back for its key, or when storage is cleared, until stopped', () => {
    const heard = vi.fn();
    const stop = onStored('os-system', heard);
    otherTabWrote('os-other');
    otherTabWrote('os-system');
    otherTabWrote(null);
    stop();
    otherTabWrote('os-system');
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe('loadForTab and saveForTab', () => {
  test('keep a value for this tab, out of the storage every tab shares', () => {
    saveForTab('os-booted', '1');
    expect(loadForTab('os-booted')).toBe('1');
    expect(map.has('os-booted')).toBe(false);
    expect(loadForTab('os-other')).toBeNull();
  });

  test('do nothing, and answer null, where storage is blocked', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked');
      }
    });
    expect(() => saveForTab('os-booted', '1')).not.toThrow();
    expect(loadForTab('os-booted')).toBeNull();
  });
});
