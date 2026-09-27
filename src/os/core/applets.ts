// Applets: small extra apps that live in the Applet Store. Getting one
// "installs" it: it shows up in Finder's Applets folder and Spotlight.
// Installed applets are remembered in this browser.

import { catalog } from '../catalog';
import type { AppletListing } from '../kit/manifest';
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

export function installApplet(app: AppId) {
  const { applets, setApplets } = useWindows.getState();
  if (!applets.includes(app)) setApplets([...applets, app]);
}

export function removeApplet(app: AppId) {
  const { applets, setApplets } = useWindows.getState();
  setApplets(applets.filter((a) => a !== app));
}
