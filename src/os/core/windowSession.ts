// Open windows survive a reload: where they were, how big, minimized or
// zoomed, in what order, and what they showed (a project, a folder). Saved
// as they change; put back when the desktop starts, with whatever a link
// asks for (?open=, deepLink.ts) opened on top of them.

import { openFromUrl } from './deepLink';
import { apps, launch } from './registry';
import { load, loadJSON, save, saveJSON } from './storage';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, isPhone, placement, useWindows } from './store';
import type { OSData, WindowState } from './types';

const KEY = 'os-windows';
/** Set once the first visit's welcome has been shown. */
const WELCOMED_KEY = 'os-welcomed';

interface Saved {
  windows: WindowState[];
  order: string[];
}

/** Brings a saved window back on screen if the browser is smaller now; phones get the usual full-screen place. */
function fit(win: WindowState, index: number): WindowState {
  const { origin: _drop, ...rest } = win;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (isPhone()) return { ...rest, ...placement(win.width, win.height, index) };
  const width = Math.min(win.width, vw - 32);
  const height = Math.min(win.height, vh - MENU_BAR_HEIGHT - DOCK_CLEARANCE);
  return {
    ...rest,
    width,
    height,
    x: Math.min(Math.max(0, win.x), vw - width),
    y: Math.min(Math.max(MENU_BAR_HEIGHT, win.y), vh - DOCK_CLEARANCE - 40)
  };
}

/** Puts back the windows of the last visit. Returns whether there were any. */
export function restoreWindows(): boolean {
  const saved = loadJSON<Saved | null>(KEY, null);
  // Only windows of apps that still exist (own keys: not "constructor"),
  // applets that are still installed, and nothing half-formed.
  const { applets } = useWindows.getState();
  const windows = (saved?.windows ?? []).filter(
    (w) =>
      w && typeof w.id === 'string' && Object.hasOwn(apps, w.app) && (!apps[w.app].applet || applets.includes(w.app))
  );
  if (!windows.length || !saved) return false;
  useWindows.getState().restore(windows.map(fit), saved.order);
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
