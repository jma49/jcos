// Applets: small extra apps that live in the Applet Store. Getting one
// "installs" it: it shows up in Finder's Applets folder and Spotlight.
// Installed applets are remembered in this browser.

import { useWindows } from './store';
import type { AppId } from './types';

export interface Applet {
  app: AppId;
  category: 'Games' | 'Utilities';
  /** One line for the store's list. */
  tagline: string;
  /** A paragraph for the detail page. */
  description: string;
  /** When it was added to the store, for "New". */
  added: string;
}

export const APPLETS: Applet[] = [
  {
    app: 'minesweeper',
    category: 'Games',
    tagline: 'Clear the board without setting anything off.',
    description:
      'The classic, in Aqua blue. Three board sizes, a safe first click, flags, chording and your best time for each level.',
    added: '2026-09-25'
  }
];

export const isApplet = (app: AppId) => APPLETS.some((a) => a.app === app);

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
