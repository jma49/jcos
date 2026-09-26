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
  },
  {
    app: 'tilegame',
    category: 'Games',
    tagline: 'One of Jincheng’s photos, cut into sixteen tiles.',
    description:
      'After the Tile Game widget in Mac OS X Tiger: a sliding puzzle made from a photo in the Photos library. Slide the tiles back into place with the mouse or the arrow keys, then try another photo.',
    added: '2026-09-26'
  },
  {
    app: 'calculator',
    category: 'Utilities',
    tagline: 'Add, subtract, multiply, divide. Nicely.',
    description:
      'A four-function calculator with an LCD and Aqua keys. It chains operations, repeats the last one when you press = again, rounds away floating-point noise, and follows your keyboard.',
    added: '2026-09-26'
  },
  {
    app: 'synth',
    category: 'Utilities',
    tagline: 'A little synthesizer you play with your keyboard.',
    description:
      'Two octaves of keys, played with the mouse or with your computer’s keys (A to K for the white notes, W to U for the black). Pick a waveform or a preset, shape the attack and release, add some echo, and watch the wave on the oscilloscope. It follows the sound switch in the menu bar.',
    added: '2026-09-27'
  }
];

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
