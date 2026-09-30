import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { OSData } from './types';

// Links like /?open=resume: what each kind of target opens, and that a link
// is handled once, leaving the address (and a reset token) behind it. A
// 1280 × 800 desktop, not a phone.

type DeepLink = typeof import('./deepLink');
type Store = typeof import('./store');
let deepLink: DeepLink;
let store: Store;
const saved = new Map<string, string>();
const data = { projects: [{ slug: 'ocra', title: 'ocra' }] } as unknown as OSData;

const SITE = 'https://majincheng.com';
/** Arrives at `path`. */
const arrive = (path: string) => {
  window.location.href = `${SITE}${path}`;
};
/** What the address bar shows. */
const address = () => window.location.href.slice(SITE.length);

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
      },
      location: {
        href: `${SITE}/`,
        get search() {
          return new URL(this.href).search;
        }
      },
      history: {
        state: null,
        replaceState(_state: unknown, _title: string, url: URL) {
          window.location.href = String(url);
        }
      }
    }
  });
  store = await import('./store');
  deepLink = await import('./deepLink');
});

beforeEach(() => {
  saved.clear();
  store.useWindows.setState({ windows: {}, order: [], dashboardOpen: false, screensaverOn: false, fullScreen: null });
});

const ids = () => Object.keys(store.useWindows.getState().windows);

describe('openFromUrl', () => {
  test('opens an app, and the link leaves the address', () => {
    arrive('/?open=resume');
    expect(deepLink.openFromUrl(data)).toBe(true);
    expect(ids()).toEqual(['resume']);
    expect(address()).toBe('/');
  });

  test('a project by its slug, in any case', () => {
    arrive('/?open=OCRA');
    expect(deepLink.openFromUrl(data)).toBe(true);
    expect(store.useWindows.getState().windows['project:ocra']).toMatchObject({ app: 'project', props: { slug: 'ocra' } });
  });

  test('the Dashboard and the screen saver', () => {
    arrive('/?open=dashboard');
    expect(deepLink.openFromUrl(data)).toBe(true);
    expect(store.useWindows.getState().dashboardOpen).toBe(true);
    arrive('/?open=screensaver');
    expect(deepLink.openFromUrl(data)).toBe(true);
    expect(store.useWindows.getState().screensaverOn).toBe(true);
    expect(ids()).toEqual([]);
  });

  test('a reset token opens the Account window, and leaves the address with the link', () => {
    arrive('/?open=account&reset=tok&sky=dusk');
    expect(deepLink.openFromUrl(data)).toBe(true);
    expect(store.useWindows.getState().windows.account.props).toEqual({ tab: 'reset', reset: 'tok' });
    expect(address()).toBe('/?sky=dusk');
  });

  test('an unknown target opens nothing, and is handled once all the same', () => {
    arrive('/?open=napster');
    expect(deepLink.openFromUrl(data)).toBe(false);
    expect(ids()).toEqual([]);
    expect(address()).toBe('/');
  });

  test('without a link, nothing happens and the address stays', () => {
    arrive('/?sky=dusk');
    expect(deepLink.openFromUrl(data)).toBe(false);
    expect(address()).toBe('/?sky=dusk');
  });
});
