import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { WindowState } from './types';

// Windows coming back after a reload: what's put back, what's dropped, and
// where a window goes when the browser is smaller than when it was saved.
// A 1280 × 800 desktop, not a phone.

type Session = typeof import('./windowSession');
type Store = typeof import('./store');
let session: Session;
let store: Store;
const saved = new Map<string, string>();

beforeAll(async () => {
  Object.assign(globalThis, {
    window: {
      innerWidth: 1280,
      innerHeight: 800,
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem: (k: string) => saved.get(k) ?? null,
        setItem: (k: string, v: string) => saved.set(k, v),
        removeItem: (k: string) => saved.delete(k)
      }
    }
  });
  store = await import('./store');
  session = await import('./windowSession');
});

beforeEach(() => {
  saved.clear();
  store.useWindows.setState({ windows: {}, order: [] });
});

const win = (id: string, app: string, rest: Partial<WindowState> = {}) =>
  ({ id, app, title: app, x: 100, y: 100, width: 600, height: 400, minimized: false, maximized: false, ...rest }) as WindowState;

const put = (windows: unknown[], order: string[]) => saved.set('os-windows', JSON.stringify({ windows, order }));

describe('restoreWindows', () => {
  test('nothing saved, or unreadable, restores nothing', () => {
    expect(session.restoreWindows()).toBe(false);
    saved.set('os-windows', '{not json');
    expect(session.restoreWindows()).toBe(false);
    expect(store.useWindows.getState().windows).toEqual({});
  });

  test('puts windows back in their stacking order, with what they showed', () => {
    put([win('a', 'about'), win('p', 'project', { props: { slug: 'ocra' }, minimized: true })], ['p', 'a']);
    expect(session.restoreWindows()).toBe(true);
    const { windows, order } = store.useWindows.getState();
    expect(order).toEqual(['p', 'a']);
    expect(windows.p).toMatchObject({ props: { slug: 'ocra' }, minimized: true });
  });

  test('drops windows of apps that no longer exist, and half-formed ones', () => {
    put([win('a', 'about'), win('gone', 'napster'), null, { app: 'about' }], ['gone', 'a']);
    expect(session.restoreWindows()).toBe(true);
    const { windows, order } = store.useWindows.getState();
    expect(Object.keys(windows)).toEqual(['a']);
    expect(order).toEqual(['a']);
  });

  test('only apps that no longer exist restores nothing', () => {
    put([win('gone', 'napster')], ['gone']);
    expect(session.restoreWindows()).toBe(false);
  });

  test('a window saved on a bigger screen comes back on this one', () => {
    put([win('a', 'about', { x: 2400, y: 1300, width: 1800, height: 1200 })], ['a']);
    session.restoreWindows();
    const { x, y, width, height } = store.useWindows.getState().windows.a;
    expect(width).toBe(1280 - 32);
    expect(height).toBe(800 - store.MENU_BAR_HEIGHT - store.DOCK_CLEARANCE);
    expect(x + width).toBeLessThanOrEqual(1280);
    expect(y).toBeLessThanOrEqual(800 - store.DOCK_CLEARANCE - 40);
  });

  test('never under the menu bar, and forgets where it opened from', () => {
    put([win('a', 'about', { x: -50, y: 0, origin: { x: 1, y: 1, width: 1, height: 1 } })], ['a']);
    session.restoreWindows();
    const restored = store.useWindows.getState().windows.a;
    expect(restored).toMatchObject({ x: 0, y: store.MENU_BAR_HEIGHT });
    expect(restored.origin).toBeUndefined();
  });
});
