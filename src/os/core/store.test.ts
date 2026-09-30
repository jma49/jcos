import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { WindowState } from './types';

// The window manager: opening, stacking, focusing, minimizing and closing
// windows, where new ones go, and how they follow the browser's size. A
// 1280 × 800 desktop, not a phone, unless a test says otherwise.

type Store = typeof import('./store');
let store: Store;
/** What the stand-in window says it is. */
const screen = { width: 1280, height: 800, phone: false };
/** Listeners on the stand-in window, and animation frames asked for but not yet run. */
const listeners = new Map<string, Set<() => void>>();
const frames = new Map<number, () => void>();
let nextFrame = 1;

beforeAll(async () => {
  Object.assign(globalThis, {
    window: {
      get innerWidth() {
        return screen.width;
      },
      get innerHeight() {
        return screen.height;
      },
      matchMedia: () => ({ matches: screen.phone }),
      addEventListener: (type: string, fn: () => void) => listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
      removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn)
    },
    requestAnimationFrame: (fn: () => void) => {
      frames.set(nextFrame, fn);
      return nextFrame++;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id)
  });
  store = await import('./store');
});

beforeEach(() => store.useWindows.setState({ windows: {}, order: [] }));
afterEach(() => {
  Object.assign(screen, { width: 1280, height: 800, phone: false });
  store.useWindows.getState().fitToViewport();
});

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

describe('the browser’s size', () => {
  const win = (rest: Partial<WindowState>): WindowState =>
    ({ id: 'a', app: 'about', title: 'About Me', x: 100, y: 100, width: 600, height: 400, minimized: false, maximized: false, ...rest }) as WindowState;
  const desktop = { width: 1280, height: 800 };
  const bounds = ({ x, y, width, height }: WindowState) => ({ x, y, width, height });

  test('a window that fits is left as it is, the very same object', () => {
    const w = win({});
    expect(store.fitWindow(w, desktop, false)).toBe(w);
  });

  test('one past the right or bottom edge comes back within reach of its title bar', () => {
    expect(bounds(store.fitWindow(win({ x: 1000, y: 750 }), desktop, false))).toEqual({ x: 680, y: 682, width: 600, height: 400 });
  });

  test('one larger than the desktop shrinks to it, and keeps its place where it can', () => {
    expect(bounds(store.fitWindow(win({ width: 1800, height: 1200 }), desktop, false))).toEqual({ x: 32, y: 100, width: 1248, height: 700 });
  });

  test('never off the left or under the menu bar', () => {
    expect(bounds(store.fitWindow(win({ x: -50, y: 0 }), desktop, false))).toMatchObject({ x: 0, y: store.MENU_BAR_HEIGHT });
  });

  test('a phone’s app takes the screen under the menu bar; a zoomed window the desktop between the menu bar and the Dock', () => {
    const phone = { width: 390, height: 664 };
    expect(bounds(store.fitWindow(win({}), phone, true))).toEqual({ x: 0, y: 22, width: 390, height: 642 });
    expect(store.phoneFrame(phone)).toEqual({ x: 0, y: 22, width: 390, height: 642 });
    expect(store.zoomedFrame(desktop)).toEqual({ x: 8, y: 30, width: 1264, height: 700 });
  });

  test('fitting to the viewport moves only the windows that need it, and notes the size', () => {
    open('about');
    store.useWindows.getState().setBounds('about', { x: 40, y: 60 });
    open('terminal');
    store.useWindows.getState().setBounds('terminal', { x: 1000, y: 700 });
    const { about, terminal } = store.useWindows.getState().windows;
    Object.assign(screen, { width: 900, height: 600 });
    store.useWindows.getState().fitToViewport();
    const s = store.useWindows.getState();
    expect(s.viewport).toEqual({ width: 900, height: 600 });
    expect(s.phone).toBe(false);
    expect(s.windows.about).toBe(about);
    expect(s.windows.terminal).not.toBe(terminal);
    expect(bounds(s.windows.terminal)).toEqual({ x: 300, y: 482, width: 600, height: 400 });
  });

  test('with nothing to move, the windows are the same map', () => {
    open('about');
    const before = store.useWindows.getState().windows;
    Object.assign(screen, { width: 1279, height: 799 });
    store.useWindows.getState().fitToViewport();
    expect(store.useWindows.getState().windows).toBe(before);
  });

  test('turned into a phone, every window takes the screen', () => {
    open('about');
    open('terminal');
    Object.assign(screen, { width: 390, height: 664, phone: true });
    store.useWindows.getState().fitToViewport();
    const s = store.useWindows.getState();
    expect(s.phone).toBe(true);
    expect(Object.values(s.windows).map(bounds)).toEqual([
      { x: 0, y: 22, width: 390, height: 642 },
      { x: 0, y: 22, width: 390, height: 642 }
    ]);
  });

  test('watching the viewport fits once per animation frame, and stops cleanly', () => {
    open('terminal');
    store.useWindows.getState().setBounds('terminal', { x: 1000, y: 700 });
    frames.clear();
    const stop = store.watchViewport();
    expect(listeners.get('resize')?.size).toBe(1);
    expect(listeners.get('orientationchange')?.size).toBe(1);
    const resize = () => listeners.get('resize')?.forEach((fn) => fn());
    Object.assign(screen, { width: 900, height: 600 });
    resize();
    resize();
    resize();
    // Three events, one frame; nothing has moved yet.
    expect(frames.size).toBe(1);
    expect(store.useWindows.getState().viewport).toEqual({ width: 1280, height: 800 });
    frames.forEach((fn) => fn());
    frames.clear();
    expect(store.useWindows.getState().viewport).toEqual({ width: 900, height: 600 });
    expect(bounds(store.useWindows.getState().windows.terminal)).toEqual({ x: 300, y: 482, width: 600, height: 400 });
    // The next burst gets a frame of its own; stopping drops it and the listeners.
    resize();
    expect(frames.size).toBe(1);
    stop();
    expect(frames.size).toBe(0);
    expect(listeners.get('resize')?.size).toBe(0);
    expect(listeners.get('orientationchange')?.size).toBe(0);
  });
});
