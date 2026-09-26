import { beforeAll, describe, expect, test } from 'vitest';
import { backedUp, makeBackup, PREFERENCE_KEYS, resetPreferences, restoreBackup } from './backup';
import { paneOf, PANES, searchPanes, SECTIONS } from './panes';

// System Preferences: finding panes, and backing up and restoring what
// this browser remembers.

/** A Storage over a Map, standing in for localStorage. */
function memory(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key)
  };
}

describe('panes', () => {
  test('every pane sits in a section, once', () => {
    expect(new Set(PANES.map((p) => p.id)).size).toBe(PANES.length);
    for (const p of PANES) expect(SECTIONS).toContain(p.section);
  });

  test('search finds panes by name first, then by what they hold', () => {
    expect(searchPanes('')).toEqual([]);
    expect(searchPanes('sound')).toEqual(['sound']);
    expect(searchPanes('night')).toEqual(['displays']);
    expect(searchPanes('WALL')).toEqual(['desktop']);
    // "d" starts Desktop, Dock, Date and Displays by name, and more by keyword.
    expect(searchPanes('d').slice(0, 4).sort()).toEqual(['datetime', 'desktop', 'displays', 'dock']);
    expect(searchPanes('24-hour clock')).toEqual(['datetime']);
    expect(searchPanes('zzz')).toEqual([]);
  });

  test('old links to the place pane open Date & Time', () => {
    expect(paneOf('location')).toBe('datetime');
    expect(paneOf('dock')).toBe('dock');
    expect(paneOf('nope')).toBeNull();
    expect(paneOf(undefined)).toBeNull();
  });
});

describe('backup', () => {
  test('carries JM/OS settings, not sign-ins, dev data, caches or open windows', () => {
    expect(backedUp('theme')).toBe(true);
    expect(backedUp('os-wallpaper')).toBe(true);
    expect(backedUp('os-applets')).toBe(true);
    for (const key of ['os-auth', 'os-windows', 'os-dev-chat', 'os-accent-cache', 'sb-token', 'other']) {
      expect(backedUp(key)).toBe(false);
    }
  });

  test('a backup restores into another browser', () => {
    const here = memory({ theme: 'dark', 'os-system': '{"clock24":true}', 'os-auth': 'secret', unrelated: 'x' });
    const backup = makeBackup(here, new Date('2026-09-26T12:00:00Z'));
    expect(backup.saved).toBe('2026-09-26T12:00:00.000Z');
    expect(backup.settings).toEqual({ theme: 'dark', 'os-system': '{"clock24":true}' });

    const there = memory({ 'os-auth': 'theirs' });
    expect(restoreBackup(there, JSON.stringify(backup))).toBe(2);
    expect(Object.fromEntries(there.map)).toEqual({ 'os-auth': 'theirs', theme: 'dark', 'os-system': '{"clock24":true}' });
  });

  test('restoring ignores keys a backup can’t carry, and refuses other files', () => {
    const store = memory();
    const file = { format: 'jmos-backup', version: 1, saved: '', settings: { 'os-auth': 'stolen', theme: 'light', 'os-sound': 3 } };
    expect(restoreBackup(store, JSON.stringify(file))).toBe(1);
    expect(Object.fromEntries(store.map)).toEqual({ theme: 'light' });

    expect(() => restoreBackup(store, 'not json')).toThrow(/isn’t a JM\/OS backup/);
    expect(() => restoreBackup(store, '{"settings":{}}')).toThrow(/isn’t a JM\/OS backup/);
    expect(() => restoreBackup(store, '{"format":"jmos-backup","version":2,"settings":{}}')).toThrow(/newer/);
  });

  test('reset forgets preferences and keeps everything else', () => {
    const store = memory({ theme: 'dark', 'os-system': '{}', 'os-wallpaper': 'color:blue', 'os-applets': '[]', 'os-pinball-best': '9' });
    resetPreferences(store);
    expect(Object.fromEntries(store.map)).toEqual({ 'os-applets': '[]', 'os-pinball-best': '9' });
    expect(PREFERENCE_KEYS).toContain('os-system');
  });
});

describe('system settings', () => {
  type System = typeof import('../../core/system');
  let system: System;
  const saved = memory({ 'os-system': '{"dockSize":"large"}' });

  beforeAll(async () => {
    Object.assign(globalThis, { window: { localStorage: saved, matchMedia: () => ({ matches: false }) } });
    system = await import('../../core/system');
  });

  test('stored settings load over the defaults, and changes are saved', () => {
    const { useSystem, SYSTEM_DEFAULTS } = system;
    expect(useSystem.getState().dockSize).toBe('large');
    expect(useSystem.getState().magnify).toBe(SYSTEM_DEFAULTS.magnify);
    useSystem.getState().set({ clock24: true });
    expect(JSON.parse(saved.getItem('os-system')!)).toMatchObject({ dockSize: 'large', clock24: true });
    useSystem.getState().reset();
    expect(useSystem.getState().dockSize).toBe('medium');
    expect(saved.getItem('os-system')).toBeNull();
  });
});
