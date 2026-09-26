// Open windows survive a reload: where they were, how big, minimized or
// zoomed, in what order, and what they showed (a project, a folder). Saved
// as they change; put back when the desktop starts, unless a link asks for
// something else (?open=).

import { apps } from './registry';
import { loadJSON, saveJSON } from './storage';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, MOBILE_BREAKPOINT, placement, useWindows } from './store';
import type { WindowState } from './types';

const KEY = 'os-windows';

interface Saved {
  windows: WindowState[];
  order: string[];
}

/** Brings a saved window back on screen if the browser is smaller now; phones get the usual full-screen place. */
function fit(win: WindowState, index: number): WindowState {
  const { origin: _drop, ...rest } = win;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < MOBILE_BREAKPOINT) return { ...rest, ...placement(win.width, win.height, index) };
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
  // Only windows of apps that still exist, and nothing half-formed.
  const windows = (saved?.windows ?? []).filter((w) => w && typeof w.id === 'string' && w.app in apps);
  if (!windows.length || !saved) return false;
  useWindows.getState().restore(windows.map(fit), saved.order);
  return true;
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
