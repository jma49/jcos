// Open windows survive a reload: where they were, how big, minimized or
// zoomed, in what order, and what they showed (a project, a folder). Saved
// as they change; put back when the desktop starts, with whatever a link
// asks for (?open=, deepLink.ts) opened on top of them.

import { openFromUrl } from './deepLink';
import { apps, launch } from './registry';
import { load, loadJSON, save, saveJSON } from './storage';
import { useWindows } from './store';
import type { OSData, WindowState } from './types';

const KEY = 'os-windows';
/** Set once the first visit's welcome has been shown. */
const WELCOMED_KEY = 'os-welcomed';

interface Saved {
  windows: WindowState[];
  order: string[];
}

/** Puts back the windows of the last visit. Returns whether there were any. */
export function restoreWindows(): boolean {
  const saved = loadJSON<Saved | null>(KEY, null);
  // Only windows of apps that still exist (own keys: not "constructor"),
  // applets that are still installed, and nothing half-formed.
  const { applets, restore, fitToViewport } = useWindows.getState();
  const windows = (saved?.windows ?? []).filter(
    (w) => w && typeof w.id === 'string' && Object.hasOwn(apps, w.app) && (!apps[w.app].applet || applets.includes(w.app))
  );
  if (!windows.length || !saved) return false;
  // Where they were, but not where they opened from; then brought back on
  // screen if the browser is smaller now (phones get the full-screen place).
  restore(
    windows.map(({ origin: _drop, ...w }) => w),
    saved.order
  );
  fitToViewport();
  return true;
}

/**
 * What's on screen as the desktop comes up: the windows of the last visit,
 * then what the link asks for (?open=) on top of them, so a reload brings
 * both back (the link is handled once: deepLink.ts). With neither, the
 * very first visit gets the welcome alone, in the middle; otherwise the
 * desktop starts clear, the way a Mac does.
 */
export function openSession(data: OSData) {
  const restored = restoreWindows();
  const opened = openFromUrl(data);
  if (restored || opened || load(WELCOMED_KEY)) return;
  save(WELCOMED_KEY, '1');
  launch('welcome', { center: true });
}

let watching = false;

/** Saves the open windows whenever they change (at most a few times a second). Call once. */
export function saveWindowsAsTheyChange() {
  if (watching) return;
  watching = true;
  let timer = 0;
  useWindows.subscribe((state, prev) => {
    if (state.windows === prev.windows && state.order === prev.order) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const { windows, order } = useWindows.getState();
      saveJSON(KEY, { windows: Object.values(windows), order });
    }, 400);
  });
}
