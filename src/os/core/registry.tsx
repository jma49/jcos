import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { catalog } from '../catalog';
import type { AppManifest } from '../kit/manifest';
import { adoptStyles } from './appStyles';
import { useWindows } from './store';
import type { AppId, AppProps, OSProject, Rect } from './types';

// The apps as the OS uses them, built from their manifests (src/os/catalog.ts).

export type { AppProps };

export interface AppDefinition extends Omit<AppManifest<AppId>, 'window' | 'load' | 'styles'> {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  /** Loaded on first open, so the desktop itself stays small. */
  Component: LazyExoticComponent<ComponentType<AppProps>>;
}

/** Fetches an app's code and stylesheet together, and adopts the stylesheet before the app renders. */
async function loadApp({ id, load, styles }: AppManifest<AppId>) {
  const [app, css] = await Promise.all([load(), styles?.()]);
  if (css) adoptStyles(id, css.default);
  return app;
}

export const apps = Object.fromEntries(
  catalog.map(({ window, load, styles, ...app }): [AppId, AppDefinition] => [
    app.id,
    { ...app, ...window, Component: lazy(() => loadApp({ ...app, window, load, styles })) }
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

interface LaunchOptions {
  key?: string;
  title?: string;
  origin?: Rect;
  props?: Record<string, string>;
  center?: boolean;
}

/** Opens (or focuses) an app window with its registered defaults. */
export function launch(app: AppId, { key, title, origin, props, center }: LaunchOptions = {}) {
  const def = apps[app];
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
