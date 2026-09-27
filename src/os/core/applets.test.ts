import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Installing applets: an applet arrives when it's got, not before; a
// failed download leaves it uninstalled; one that isn't installed opens
// its page in the Applet Store however it's asked for.

const preload = vi.fn();
vi.mock('./registry', async (original) => {
  const registry = await original<typeof import('./registry')>();
  return { ...registry, preloadApp: (id: string) => preload(id) };
});

type Modules = [typeof import('./applets'), typeof import('./registry'), typeof import('./store')];
let applets: Modules[0];
let registry: Modules[1];
let store: Modules[2];

beforeAll(async () => {
  Object.assign(globalThis, {
    window: { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) }
  });
  // One after another: loaded together, applets.ts could bind the real
  // registry before the mock is in place.
  store = await import('./store');
  registry = await import('./registry');
  applets = await import('./applets');
});

beforeEach(() => {
  preload.mockReset();
  store.useWindows.setState({ windows: {}, order: [], applets: ['minesweeper'] });
});

const openApps = () => Object.values(store.useWindows.getState().windows).map((w) => [w.app, w.props]);

describe('applets', () => {
  test('one that isn’t installed opens its page in the Applet Store', () => {
    registry.launch('pinball');
    expect(openApps()).toEqual([['appstore', { applet: 'pinball' }]]);
  });

  test('an installed one opens itself', () => {
    registry.launch('minesweeper');
    expect(openApps()).toEqual([['minesweeper', undefined]]);
  });

  test('getting one downloads it, then lists it', async () => {
    let arrive = () => {};
    preload.mockReturnValue(new Promise<void>((done) => (arrive = done)));
    const installing = applets.installApplet('pinball');
    expect(preload).toHaveBeenCalledWith('pinball');
    expect(store.useWindows.getState().applets).not.toContain('pinball');
    arrive();
    await installing;
    expect(store.useWindows.getState().applets).toContain('pinball');
  });

  test('a failed download leaves it uninstalled', async () => {
    preload.mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    await expect(applets.installApplet('pinball')).rejects.toThrow();
    expect(store.useWindows.getState().applets).toEqual(['minesweeper']);
  });

  test('removing one closes its windows and unlists it', () => {
    registry.launch('minesweeper');
    registry.launch('about');
    applets.removeApplet('minesweeper');
    expect(openApps().map(([app]) => app)).toEqual(['about']);
    expect(store.useWindows.getState().applets).toEqual([]);
  });
});
