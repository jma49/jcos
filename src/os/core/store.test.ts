import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

// The window manager: opening, stacking, focusing, minimizing and closing
// windows, and where new ones go. A 1280 × 800 desktop, not a phone.

type Store = typeof import('./store');
let store: Store;

beforeAll(async () => {
  Object.assign(globalThis, {
    window: { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) }
  });
  store = await import('./store');
});

beforeEach(() => store.useWindows.setState({ windows: {}, order: [] }));

const open = (app: 'about' | 'terminal' | 'photos', key?: string, center = false) =>
  store.useWindows.getState().open(app, { key, title: app, width: 600, height: 400, center });

const front = () => {
  const { order, windows } = store.useWindows.getState();
  return [...order].reverse().find((id) => !windows[id].minimized) ?? null;
};

describe('windows', () => {
  test('opening puts a window in front; opening it again reuses it', () => {
    open('about');
    open('terminal');
    expect(front()).toBe('terminal');
    open('about');
    expect(Object.keys(store.useWindows.getState().windows)).toHaveLength(2);
    expect(front()).toBe('about');
  });

  test('different keys make separate windows of one app', () => {
    open('terminal', 'terminal-1');
    open('terminal', 'terminal-2');
    expect(store.useWindows.getState().order).toEqual(['terminal-1', 'terminal-2']);
  });

  test('minimizing hands the front to the next window; focusing brings it back', () => {
    open('about');
    open('photos');
    store.useWindows.getState().minimize('photos');
    expect(front()).toBe('about');
    store.useWindows.getState().focus('photos');
    expect(front()).toBe('photos');
    expect(store.useWindows.getState().windows.photos.minimized).toBe(false);
  });

  test('closing removes a window from the stack', () => {
    open('about');
    open('photos');
    store.useWindows.getState().close('photos');
    expect(store.useWindows.getState().order).toEqual(['about']);
    expect(front()).toBe('about');
  });

  test('new windows fit between the menu bar and the Dock, and cascade', () => {
    open('about');
    open('photos');
    const { about, photos } = store.useWindows.getState().windows;
    for (const w of [about, photos]) {
      expect(w.y).toBeGreaterThanOrEqual(store.MENU_BAR_HEIGHT);
      expect(w.y + w.height).toBeLessThanOrEqual(800 - store.DOCK_CLEARANCE);
      expect(w.x + w.width).toBeLessThanOrEqual(1280);
    }
    expect(photos.x - about.x).toBe(28);
  });

  test('a centred window sits in the middle', () => {
    open('about', undefined, true);
    const { about } = store.useWindows.getState().windows;
    expect(about.x).toBe((1280 - 600) / 2);
  });
});
