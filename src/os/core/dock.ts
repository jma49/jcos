// Which apps the visitor keeps in the Dock, and in what order. Apps come
// and go by dragging (out of the Dock, in from Finder's Applications or
// Applets, or a running app's slot moved left) or from the Dock menu's
// Keep in Dock and Remove from Dock. Finder stays, first, as on a Mac.
//
// Kept in os-dock, as the list of app ids; nothing stored means the
// catalog's own Dock (`dock` in the manifests). Every change builds on
// what's stored now, and the visitor's other tabs follow.

import { create } from 'zustand';
import { apps, dockApps } from './registry';
import { loadJSON, onStored, saveJSON, updateJSON } from './storage';
import { useWindows } from './store';
import type { AppId } from './types';

const KEY = 'os-dock';

/** What Finder puts on a drag of an application, for the Dock to take. */
export const APP_MIME = 'application/x-jmos-app';
const FIRST: AppId = 'finder';

/** Whether an app can have a place in the Dock: a real app, and an applet only while installed. */
export function dockable(app: string): app is AppId {
  const def = apps[app as AppId];
  if (!def || def.internal || def.noDock || def.menuOnly) return false;
  return !def.applet || useWindows.getState().applets.includes(app as AppId);
}

/** A stored list made safe: known, dockable apps once each, Finder first. */
export function cleanDock(stored: unknown): AppId[] {
  if (!Array.isArray(stored)) return dockApps;
  const kept = stored.filter((a, i): a is AppId => typeof a === 'string' && dockable(a) && stored.indexOf(a) === i && a !== FIRST);
  return [FIRST, ...kept];
}

/** `list` with `app` placed at `index` (among the apps after Finder), wherever it was before. */
export function placeIn(list: AppId[], app: AppId, index: number): AppId[] {
  if (app === FIRST) return list;
  const rest = list.filter((a) => a !== app && a !== FIRST);
  const at = Math.max(0, Math.min(rest.length, index - 1));
  return [FIRST, ...rest.slice(0, at), app, ...rest.slice(at)];
}

const load = () => cleanDock(loadJSON<unknown>(KEY, null));

export const useDock = create<{ apps: AppId[] }>(() => ({ apps: load() }));

function change(next: (current: AppId[]) => AppId[]) {
  const stored = updateJSON<unknown>(KEY, null, (current) => next(cleanDock(current)));
  useDock.setState({ apps: cleanDock(stored) });
}

/** Keeps `app` in the Dock at `index` (0 is Finder's place), or moves it there. */
export const keepInDock = (app: AppId, index: number) => dockable(app) && change((list) => placeIn(list, app, index));

/** Takes `app` out of the Dock. Finder stays. */
export const removeFromDock = (app: AppId) => app !== FIRST && change((list) => list.filter((a) => a !== app));

/** Back to the catalog's Dock. */
export function resetDock() {
  saveJSON(KEY, null);
  useDock.setState({ apps: dockApps });
}

export const canRemoveFromDock = (app: AppId) => app !== FIRST;

// Changed in another tab, or an applet removed (here or there): follow.
onStored(KEY, () => useDock.setState({ apps: load() }));
useWindows.subscribe((s, prev) => {
  if (s.applets !== prev.applets) useDock.setState({ apps: load() });
});
