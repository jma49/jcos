import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

// Where focus goes back to when Spotlight, the Dashboard, a full-screen app,
// an alert, a menu or a window closes. The page is a few plain elements
// that answer what focus.ts asks of them, since the unit tests have no DOM.

type Focus = typeof import('./focus');
type Store = typeof import('./store');
let focus: Focus;
let store: Store;

class El {
  parent: El | null = null;
  children: El[] = [];
  isConnected = true;
  shown = true;
  inert = false;
  dataset: Record<string, string> = {};
  constructor(public name: string) {}
  add(...els: El[]) {
    for (const e of els) {
      e.parent = this;
      this.children.push(e);
    }
    return this;
  }
  get parentElement() {
    return this.parent;
  }
  contains(other: El | null) {
    for (let e = other; e; e = e.parent) if (e === this) return true;
    return false;
  }
  closest(selector: string) {
    if (selector !== '[inert]') throw new Error(`unsupported selector: ${selector}`);
    for (let e: El | null = this; e; e = e.parent) if (e.inert) return e;
    return null;
  }
  getClientRects() {
    return this.shown ? [{}] : [];
  }
  focus() {
    page.activeElement = this;
  }
  blur() {
    page.activeElement = page.body;
  }
}

const body = new El('body');
const page = {
  body,
  activeElement: body as El,
  querySelectorAll: (selector: string) => {
    if (selector !== '.os-window') throw new Error(`unsupported selector: ${selector}`);
    const found: El[] = [];
    const walk = (e: El) => {
      if (e.name.startsWith('window:')) found.push(e);
      e.children.forEach(walk);
    };
    walk(body);
    return found;
  }
};
const frames: (() => void)[] = [];
const runFrames = () => frames.splice(0).forEach((fn) => fn());

/** A window as the page draws it, its id in data-id. */
const windowEl = (id: string) => {
  const w = new El(`window:${id}`);
  w.dataset.id = id;
  return w;
};

beforeAll(async () => {
  Object.assign(globalThis, {
    window: {
      innerWidth: 1280,
      innerHeight: 800,
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    document: page,
    HTMLElement: El,
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
    cancelAnimationFrame: () => {}
  });
  focus = await import('./focus');
  store = await import('./store');
});

beforeEach(() => {
  body.children = [];
  page.activeElement = body;
  frames.length = 0;
  store.useWindows.setState({ windows: {}, order: [], spotlightOpen: false, dashboardOpen: false, fullScreen: null });
});

describe('frontOf', () => {
  test('the last window in the order that isn’t minimized', () => {
    const w = (minimized: boolean) => ({ minimized });
    expect(focus.frontOf({ order: ['a', 'b', 'c'], windows: { a: w(false), b: w(false), c: w(true) } })).toBe('b');
    expect(focus.frontOf({ order: ['a'], windows: { a: w(true) } })).toBeNull();
    expect(focus.frontOf({ order: [], windows: {} })).toBeNull();
  });
});

describe('focusBackTo', () => {
  const finder = windowEl('finder');
  const about = windowEl('about');
  const item = new El('item');
  const windowOf = (id: string) => ({ finder, about })[id as 'finder' | 'about'] ?? null;
  const usable = (el: Element) => (el as unknown as El).isConnected && (el as unknown as El).shown;
  const back = (held: { el: El | null; front: string | null }, front: string | null) =>
    focus.focusBackTo(held as unknown as Parameters<Focus['focusBackTo']>[0], front, windowOf as never, usable);

  test('what had focus, if it can still take it', () => {
    expect(back({ el: item, front: 'finder' }, 'finder')).toBe(item);
  });

  test('the window in front, when what had focus is gone or hidden', () => {
    expect(back({ el: Object.assign(new El('gone'), { isConnected: false }), front: 'finder' }, 'finder')).toBe(finder);
    expect(back({ el: Object.assign(new El('hidden'), { shown: false }), front: 'finder' }, 'finder')).toBe(finder);
    // Focus was on the page itself.
    expect(back({ el: null, front: 'finder' }, 'finder')).toBe(finder);
  });

  test('a window that came to the front meanwhile takes it (a result, a command or Restore opened an app)', () => {
    expect(back({ el: item, front: 'finder' }, 'about')).toBe(about);
    expect(back({ el: item, front: null }, 'about')).toBe(about);
  });

  test('the page itself when there’s nothing to go back to', () => {
    expect(back({ el: null, front: null }, null)).toBeNull();
  });
});

describe('giveBack', () => {
  test('waits a frame, then gives focus back', () => {
    const item = new El('item');
    body.add(item);
    focus.giveBack({ el: item as never, front: null }, () => null);
    expect(page.activeElement).toBe(body);
    runFrames();
    expect(page.activeElement).toBe(item);
  });

  test('leaves focus that went somewhere else meanwhile', () => {
    const item = new El('item');
    const field = new El('field');
    const menu = new El('menu').add(new El('menu item'));
    body.add(item, field, menu);
    page.activeElement = field;
    focus.giveBack({ el: item as never, front: null }, () => null, menu as never);
    runFrames();
    expect(page.activeElement).toBe(field);
    // Still inside what's closing: it comes back.
    page.activeElement = menu.children[0];
    focus.giveBack({ el: item as never, front: null }, () => null, menu as never);
    runFrames();
    expect(page.activeElement).toBe(item);
  });

  test('nothing held, nothing done', () => {
    const field = new El('field');
    body.add(field);
    focus.giveBack(undefined, () => null);
    expect(frames).toHaveLength(0);
  });
});

describe('the store', () => {
  const open = (app: 'about' | 'finder') => store.useWindows.getState().open(app, { title: app, width: 600, height: 400 });

  test('an overlay gives back what had focus as it was opened, not what focused itself as it mounted', () => {
    const dockIcon = new El('dock icon');
    const sidebar = new El('Time Machine’s sidebar');
    body.add(dockIcon, sidebar);
    dockIcon.focus();
    store.useWindows.getState().openFullScreen('timemachine');
    // Its code was cached: it focused itself before its layer's effect ran.
    sidebar.focus();
    store.useWindows.getState().closeFullScreen();
    sidebar.isConnected = false;
    page.activeElement = body;
    store.releaseFocus('fullScreen');
    runFrames();
    expect(page.activeElement).toBe(dockIcon);
  });

  test('opened from Spotlight, a full-screen app gives back what had focus before Spotlight', () => {
    const item = new El('Finder item');
    const field = new El('Spotlight’s field');
    body.add(item, field);
    item.focus();
    store.useWindows.getState().setSpotlight(true);
    field.focus();
    store.useWindows.getState().openFullScreen('timemachine');
    // Spotlight closed under it: nothing of its own to give back.
    store.releaseFocus('spotlight');
    runFrames();
    expect(page.activeElement).toBe(field);
    store.useWindows.getState().closeFullScreen();
    page.activeElement = body;
    store.releaseFocus('fullScreen');
    runFrames();
    expect(page.activeElement).toBe(item);
  });

  test('a window closed with focus in it hands focus to the one in front', () => {
    const finder = windowEl('finder');
    const about = windowEl('about');
    const close = new El('close box');
    about.add(close);
    body.add(finder, about);
    open('finder');
    open('about');
    close.focus();
    store.useWindows.getState().close('about');
    runFrames();
    expect(page.activeElement).toBe(finder);
  });

  test('a window closed with focus elsewhere leaves it there', () => {
    const finder = windowEl('finder');
    const about = windowEl('about');
    const dockIcon = new El('dock icon');
    body.add(finder, about, dockIcon);
    open('finder');
    open('about');
    dockIcon.focus();
    store.useWindows.getState().close('about');
    runFrames();
    expect(page.activeElement).toBe(dockIcon);
  });

  test('the last window minimized: focus doesn’t stay on its button', () => {
    const about = windowEl('about');
    const minimize = new El('minimize box');
    about.add(minimize);
    body.add(about);
    open('about');
    minimize.focus();
    store.useWindows.getState().minimize('about');
    runFrames();
    expect(page.activeElement).toBe(body);
  });
});
