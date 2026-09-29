import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanDock, keepInDock, placeIn, removeFromDock, resetDock, useDock } from './dock';
import { dockApps } from './registry';
import { useWindows } from './store';

describe('cleanDock', () => {
  test('nothing stored is the catalog’s Dock', () => {
    expect(cleanDock(null)).toEqual(dockApps);
    expect(cleanDock('junk')).toEqual(dockApps);
  });
  test('Finder first, unknown or duplicate apps dropped, and an applet only while installed', () => {
    useWindows.setState({ applets: [] });
    expect(cleanDock(['ipod', 'nope', 'ipod', 'finder', 'minesweeper', 'photos'])).toEqual(['finder', 'ipod', 'photos']);
    useWindows.setState({ applets: ['minesweeper'] });
    expect(cleanDock(['minesweeper'])).toEqual(['finder', 'minesweeper']);
  });
});

describe('placeIn', () => {
  const list = ['finder', 'projects', 'photos', 'ipod'] as const;
  test('moves an app, keeping Finder first', () => {
    expect(placeIn([...list], 'ipod', 1)).toEqual(['finder', 'ipod', 'projects', 'photos']);
    expect(placeIn([...list], 'projects', 3)).toEqual(['finder', 'photos', 'ipod', 'projects']);
    expect(placeIn([...list], 'photos', 0)).toEqual(['finder', 'photos', 'projects', 'ipod']);
  });
  test('adds a new one, and never moves Finder', () => {
    expect(placeIn([...list], 'chat', 99)).toEqual([...list, 'chat']);
    expect(placeIn([...list], 'finder', 3)).toEqual([...list]);
  });
});

describe('keeping and removing', () => {
  let map: Map<string, string>;
  beforeEach(() => {
    map = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => void map.set(key, value),
        removeItem: (key: string) => void map.delete(key)
      }
    });
    resetDock();
  });
  afterEach(() => vi.unstubAllGlobals());
  test('remove, keep again, and it’s remembered', () => {
    removeFromDock('photos');
    expect(useDock.getState().apps).not.toContain('photos');
    keepInDock('photos', 1);
    expect(useDock.getState().apps.slice(0, 2)).toEqual(['finder', 'photos']);
    expect(JSON.parse(map.get('os-dock')!)).toEqual(useDock.getState().apps);
  });
  test('Finder can’t be removed', () => {
    removeFromDock('finder');
    expect(useDock.getState().apps[0]).toBe('finder');
  });
});
