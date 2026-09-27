import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { catalog } from '../catalog';
import type { AppManifest } from '../kit/manifest';
import { adoptStyles } from './appStyles';
import { useWindows } from './store';
import type { AppId, AppProps, OSProject, Rect } from './types';

// The apps as the OS uses them, built from their manifests (src/os/catalog.ts).

export type { AppProps };

export interface AppDefinition extends Omit<AppManifest<AppId>, 'window' | 'load' | 'styles' | 'data'> {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

/** Fetches an app's code, stylesheet and data together, and adopts the stylesheet before the app renders. */
async function loadApp({ id, load, styles, data }: AppManifest<AppId>) {
  const [app, css] = await Promise.all([load(), styles?.(), data?.()]);
  if (css) adoptStyles(id, css.default);
  return app;
}

const manifests = Object.fromEntries(catalog.map((m) => [m.id, m])) as Record<AppId, AppManifest<AppId>>;
const loading = new Map<AppId, ReturnType<typeof loadApp>>();
const ready = new Map<AppId, ComponentType<AppProps>>();

/**
 * An app whose code has arrived, to render directly: React holds back a
 * lazy component that suspends for about 300 ms, even when its code is
 * already here, so an installed applet would open no faster than a new
 * one. A window chooses once, when it mounts (switching would remount the
 * app).
 */
export function readyApp(id: AppId): ComponentType<AppProps> | undefined {
  return ready.get(id);
}

/**
 * Fetches an app ahead of its first window: installing an applet does, so
 * it opens at once. Each app is fetched once; a fetch that fails (offline,
 * or code replaced by a deploy) is forgotten, so it can be tried again.
 */
export function preloadApp(id: AppId) {
  let app = loading.get(id);
  if (!app) {
    app = loadApp(manifests[id]).then(
      (loaded) => {
        ready.set(id, loaded.default);
        return loaded;
      },
      (error) => {
        loading.delete(id);
        throw error;
      }
    );
    loading.set(id, app);
  }
  return app;
}

const lazies = new Map<AppId, LazyExoticComponent<ComponentType<AppProps>>>();

/**
 * What a window renders: the app itself once its code has arrived
 * (readyApp), or a lazy one that loads it, so the desktop stays small.
 * A download that failed can't be tried again in this page: the browser
 * remembers a failed module import for the page's life and doesn't even
 * ask again (pitfalls.md), so AppBoundary offers a reload instead.
 */
export function appComponent(id: AppId): ComponentType<AppProps> {
  const ready = readyApp(id);
  if (ready) return ready;
  let app = lazies.get(id);
  if (!app) {
    app = lazy(() => preloadApp(id));
    lazies.set(id, app);
  }
  return app;
}

export const apps = Object.fromEntries(
  catalog.map(({ window, load: _load, styles: _styles, data: _data, ...app }): [AppId, AppDefinition] => [
    app.id,
    { ...app, ...window }
  ])
) as Record<AppId, AppDefinition>;

const appIds = Object.keys(apps) as AppId[];

/** Apps kept in the Dock, left to right. Others show up there while they're open. */
export const dockApps = appIds.filter((id) => apps[id].dock).sort((a, b) => apps[a].dock! - apps[b].dock!);

/** Dock apps that also appear in the phone's Dock. */
export const mobileDockApps = appIds.filter((id) => apps[id].phoneDock);

/** Every app that opens by name: from the Terminal's `open` and `?open=`. */
export const openableApps = appIds.filter((id) => !apps[id].internal);

/** What Spotlight and a phone's home screen list as applications (applets are listed separately). */
export const launcherApps = openableApps.filter((id) => !apps[id].applet && !apps[id].menuOnly);

/** Finder's Applications folder. */
export const applicationApps = appIds.filter((id) => apps[id].inApplications);

// An applet that's no longer installed, whether removed here or in another
// tab (store.ts picks that up), has its windows closed.
useWindows.subscribe((state, prev) => {
  if (state.applets === prev.applets) return;
  for (const w of Object.values(state.windows)) {
    if (apps[w.app]?.applet && !state.applets.includes(w.app)) state.close(w.id);
  }
});

interface LaunchOptions {
  key?: string;
  title?: string;
  origin?: Rect;
  props?: Record<string, string>;
  center?: boolean;
}

/**
 * Opens (or focuses) an app window with its registered defaults. An applet
 * that isn't installed opens its page in the Applet Store instead, however
 * it was asked for (a link, the Terminal, a shortcut).
 */
export function launch(app: AppId, { key, title, origin, props, center }: LaunchOptions = {}): string {
  const def = apps[app];
  if (def.applet && !useWindows.getState().applets.includes(app)) return launch('appstore', { origin, props: { applet: app } });
  return useWindows.getState().open(app, {
    key,
    title: title ?? def.name,
    width: def.width,
    height: def.height,
    origin,
    props,
    center
  });
}

/** Opens a project's window, growing from `el` if given. */
export function openProject(p: OSProject, el?: Element | null) {
  launch('project', { key: `project:${p.slug}`, title: p.title, origin: rectOf(el ?? null), props: { slug: p.slug } });
}

/** The on-screen rect of an element, for launch animations. */
export function rectOf(el: Element | null): Rect | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
