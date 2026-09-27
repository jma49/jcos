// Applets: small extra apps that live in the Applet Store. Getting one
// installs it: its code and styles are fetched then (never before), and it
// shows up in Finder's Applets folder and Spotlight. Installed applets are
// remembered in this browser.

import { catalog } from '../catalog';
import type { AppletListing } from '../kit/manifest';
import { preloadApp } from './registry';
import { useWindows } from './store';
import type { AppId } from './types';

export interface Applet extends AppletListing {
  app: AppId;
}

/** Every applet in the store, in the catalog's order. */
export const APPLETS: Applet[] = catalog.flatMap((m) => (m.applet ? [{ app: m.id, ...m.applet }] : []));

/** The applet the store's banner shows. */
export const FEATURED: AppId = 'tilegame';

export function useInstalledApplets() {
  return useWindows((s) => s.applets);
}

/**
 * Installs an applet: fetches its code and styles, then lists it. If the
 * fetch fails it stays uninstalled, and the promise rejects.
 */
export async function installApplet(app: AppId) {
  await preloadApp(app);
  useWindows.getState().changeApplets((installed) => (installed.includes(app) ? installed : [...installed, app]));
}

/**
 * Removes an applet; its windows close, here and in the visitor's other
 * tabs (registry.tsx). What it saved stays, as a Mac keeps an app's
 * preferences.
 */
export function removeApplet(app: AppId) {
  useWindows.getState().changeApplets((installed) => installed.filter((a) => a !== app));
}
