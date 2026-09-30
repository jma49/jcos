import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { AppId, Menus, Rect, WindowState } from './types';
import type { Place } from '../ambient/place';
import type { Visitor } from '../social/social';
import type { AccentChoice } from '../look/accent';
import { load, loadJSON, loadSettings, onStored, save, saveJSON } from './storage';

export const MENU_BAR_HEIGHT = 22;
export const DOCK_CLEARANCE = 78;
export const MOBILE_BREAKPOINT = 768;

/**
 * Phones get the iOS-style home screen and full-screen apps: anything
 * narrower than MOBILE_BREAKPOINT, and a touch screen too short for windows
 * (a phone held sideways). PHONE_QUERY is the same test for CSS; phone.css
 * repeats it.
 */
export const PHONE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px), (max-height: 500px) and (pointer: coarse)`;

export const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;

interface OpenOptions {
  /** Windows with the same key are reused instead of duplicated. Defaults to the app id. */
  key?: string;
  title: string;
  width: number;
  height: number;
  origin?: Rect;
  props?: Record<string, string>;
  /** Right in the middle of the screen, instead of cascading from it. */
  center?: boolean;
}

/** Light, dark, the system's setting, or dark from sunset to sunrise where the visitor is. */
export type Appearance = 'light' | 'dark' | 'system' | 'sun';
export type SaverStyle = 'photos' | 'flurry' | 'artwork' | 'starfield' | 'soapbox' | 'clock' | 'bounce';
export interface SaverPrefs {
  style: SaverStyle;
  /** Idle minutes before it starts; 0 for never. */
  idle: number;
}

/** Where a desktop icon was dragged: px from the top and from the right edge. */
export type IconPositions = Record<string, { top: number; right: number }>;

interface WindowStore {
  windows: Record<string, WindowState>;
  /** Window ids from back to front; the last one is focused. */
  order: string[];
  /** The theme on screen, worked out from `appearance`. */
  theme: 'light' | 'dark';
  appearance: Appearance;
  saver: SaverPrefs;
  /** Frosted glass windows and menus instead of pinstripes and metal. */
  glass: boolean;
  /** The accent colour: from the desktop picture, or a fixed one (see accent.ts). */
  accent: AccentChoice;
  /** Applets installed from the Applet Store (see applets.ts). */
  applets: AppId[];
  /** Desktop icons the visitor has arranged; null for the default column. */
  iconPositions: IconPositions | null;
  /** Interface sounds (see sound.ts); off by default. */
  soundOn: boolean;
  /** 0 to 1. */
  volume: number;
  spotlightOpen: boolean;
  dashboardOpen: boolean;
  /** Exposé: every open window laid out side by side. */
  exposeOpen: boolean;
  screensaverOn: boolean;
  /**
   * An app that takes the whole screen (a manifest's `fullScreen`: Time
   * Machine), and what it was opened with; null when none is. It isn't a
   * window, so the windows, the menu bar and the Dock wait under it, and
   * nothing of it is kept for the next visit.
   */
  fullScreen: { app: AppId; props?: Record<string, string> } | null;
  /** People on the desktop right now, this visitor included; null until known. */
  visitors: Visitor[] | null;
  /** Too many people here for pointers (see CROWD in social/online.tsx). */
  crowded: boolean;
  /** A photo URL chosen as the desktop picture, or null for the default. */
  wallpaper: string | null;
  /** Show another picture from the same collection each time the visitor comes back to the tab. */
  rotateWallpaper: boolean;
  /** Where the visitor is (see place.ts); null until located. */
  place: Place | null;
  /** Menus a window's app adds to the menu bar while it's in front, as Chess's Game menu; by window id. */
  menus: Record<string, Menus | undefined>;

  open: (app: AppId, options: OpenOptions) => string;
  /** Puts back windows from an earlier visit (see windowSession.ts), in their stacking order. */
  restore: (windows: WindowState[], order: string[]) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setBounds: (id: string, bounds: Partial<Pick<WindowState, 'x' | 'y' | 'width' | 'height'>>) => void;
  setTitle: (id: string, title: string) => void;
  /** Picks light or dark outright (and remembers it). */
  setTheme: (theme: 'light' | 'dark') => void;
  setAppearance: (appearance: Appearance) => void;
  /** Shows a theme without changing the preference; for `system` and `sun`. */
  applyTheme: (theme: 'light' | 'dark') => void;
  setSaver: (saver: Partial<SaverPrefs>) => void;
  setIconPositions: (positions: IconPositions | null) => void;
  /** Changes the installed applets, starting from what's stored now. */
  changeApplets: (change: (installed: AppId[]) => AppId[]) => void;
  setAccent: (accent: AccentChoice) => void;
  setGlass: (glass: boolean) => void;
  setSound: (on: boolean) => void;
  setVolume: (volume: number) => void;
  setSpotlight: (open: boolean) => void;
  setDashboard: (open: boolean) => void;
  setExpose: (open: boolean) => void;
  setScreensaver: (on: boolean) => void;
  /** Opens a full-screen app over everything, closing Spotlight, Exposé and the Dashboard. */
  openFullScreen: (app: AppId, props?: Record<string, string>) => void;
  closeFullScreen: () => void;
  setVisitors: (visitors: Visitor[] | null) => void;
  setCrowded: (crowded: boolean) => void;
  setWallpaper: (url: string | null) => void;
  setRotateWallpaper: (on: boolean) => void;
  setPlace: (place: Place) => void;
  /** Adds a window's own menus to the menu bar (phones show only the Apple menu), or takes them away. */
  setMenus: (id: string, menus: Menus | undefined) => void;
}

const WALLPAPER_KEY = 'os-wallpaper';
const ROTATE_KEY = 'os-wallpaper-rotate';
// Shared with the classic site, which stored 'light' or 'dark' here.
const APPEARANCE_KEY = 'theme';
const SAVER_KEY = 'os-screensaver';
const SOUND_KEY = 'os-sound';
const ICONS_KEY = 'os-icon-positions';
const APPLETS_KEY = 'os-applets';
const ACCENT_KEY = 'os-accent';
const GLASS_KEY = 'os-glass';
const ACCENT_CHOICES: AccentChoice[] = ['auto', 'blue', 'graphite', 'green', 'orange', 'purple', 'red'];

function savedAccent(): AccentChoice {
  const saved = load(ACCENT_KEY) as AccentChoice | null;
  return saved && ACCENT_CHOICES.includes(saved) ? saved : 'auto';
}
/** Applets everyone starts with. */
const DEFAULT_APPLETS: AppId[] = ['minesweeper'];

function savedApplets(): AppId[] {
  const saved = loadJSON<unknown>(APPLETS_KEY, null);
  return Array.isArray(saved) ? saved : DEFAULT_APPLETS;
}

const savedSaver = () => loadSettings<SaverPrefs>(SAVER_KEY, { style: 'photos', idle: 2 });

function savedAppearance(): Appearance {
  const saved = load(APPEARANCE_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'sun' ? saved : 'system';
}

function savedSound(): { soundOn: boolean; volume: number } {
  const saved = loadSettings(SOUND_KEY, { on: false, volume: 0.6 });
  return { soundOn: saved.on === true, volume: Math.min(1, Math.max(0, Number(saved.volume) || 0.6)) };
}

/** Where a new window goes: centred, then stepped down-right per open window. */
export function placement(width: number, height: number, openCount: number, center = false) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (isPhone()) {
    return { x: 0, y: MENU_BAR_HEIGHT, width: vw, height: vh - MENU_BAR_HEIGHT };
  }
  // Keep the whole window between the menu bar and the Dock.
  const top = MENU_BAR_HEIGHT + 12;
  const bottom = vh - DOCK_CLEARANCE;
  const w = Math.min(width, vw - 48);
  const h = Math.min(height, bottom - top);
  if (center) {
    return { x: Math.round((vw - w) / 2), y: Math.max(top, Math.round(top + (bottom - top - h) / 2)), width: w, height: h };
  }
  const step = (openCount % 6) * 28;
  const x = Math.min(vw - w - 16, Math.max(16, Math.round((vw - w) / 2) - 84 + step));
  const y = Math.min(bottom - h, Math.max(top, Math.round((vh - h) / 2) - 60 + step));
  return { x, y, width: w, height: h };
}

export const useWindows = create<WindowStore>((set, get) => ({
  windows: {},
  order: [],
  theme: 'light',
  appearance: savedAppearance(),
  saver: savedSaver(),
  ...savedSound(),
  iconPositions: loadJSON<IconPositions | null>(ICONS_KEY, null),
  applets: savedApplets(),
  accent: savedAccent(),
  glass: load(GLASS_KEY) === '1',
  spotlightOpen: false,
  dashboardOpen: false,
  fullScreen: null,
  exposeOpen: false,
  screensaverOn: false,
  visitors: null,
  crowded: false,
  // Jincheng's photos were desktop pictures once; they're only in Photos now.
  wallpaper: load(WALLPAPER_KEY)?.includes('images.unsplash.com') ? null : load(WALLPAPER_KEY),
  rotateWallpaper: load(ROTATE_KEY) !== '0',
  place: null,
  menus: {},

  open: (app, { key = app, title, width, height, origin, props, center }) => {
    const existing = get().windows[key];
    if (existing) {
      set((s) => ({
        windows: { ...s.windows, [key]: { ...existing, minimized: false, props: props ?? existing.props } },
        order: [...s.order.filter((id) => id !== key), key]
      }));
      return key;
    }
    const bounds = placement(width, height, get().order.length, center);
    set((s) => ({
      windows: {
        ...s.windows,
        [key]: { id: key, app, title, ...bounds, minimized: false, maximized: false, origin, props }
      },
      order: [...s.order, key]
    }));
    return key;
  },

  restore: (windows, order) =>
    set({ windows: Object.fromEntries(windows.map((w) => [w.id, w])), order: order.filter((id) => windows.some((w) => w.id === id)) }),

  close: (id) =>
    set((s) => {
      const { [id]: _removed, ...windows } = s.windows;
      return { windows, order: s.order.filter((w) => w !== id) };
    }),

  focus: (id) =>
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: win.minimized ? { ...s.windows, [id]: { ...win, minimized: false } } : s.windows,
        order: [...s.order.filter((w) => w !== id), id]
      };
    }),

  minimize: (id) =>
    set((s) => ({
      windows: { ...s.windows, [id]: { ...s.windows[id], minimized: true } },
      // Send it to the back so the next window up takes focus.
      order: [id, ...s.order.filter((w) => w !== id)]
    })),

  toggleMaximize: (id) =>
    set((s) => ({
      windows: { ...s.windows, [id]: { ...s.windows[id], maximized: !s.windows[id].maximized } }
    })),

  setBounds: (id, bounds) =>
    set((s) => (s.windows[id] ? { windows: { ...s.windows, [id]: { ...s.windows[id], ...bounds } } } : s)),

  setTitle: (id, title) =>
    set((s) => (s.windows[id] && s.windows[id].title !== title ? { windows: { ...s.windows, [id]: { ...s.windows[id], title } } } : s)),

  setTheme: (theme) => {
    save(APPEARANCE_KEY, theme);
    set({ theme, appearance: theme });
  },
  setAppearance: (appearance) => {
    save(APPEARANCE_KEY, appearance);
    set(appearance === 'light' || appearance === 'dark' ? { appearance, theme: appearance } : { appearance });
  },
  applyTheme: (theme) => set({ theme }),
  setIconPositions: (iconPositions) => {
    saveJSON(ICONS_KEY, iconPositions);
    set({ iconPositions });
  },
  setGlass: (glass) => {
    save(GLASS_KEY, glass ? '1' : '0');
    set({ glass });
  },
  setAccent: (accent) => {
    save(ACCENT_KEY, accent);
    set({ accent });
  },
  // Each builds on what's stored now, so another tab's change stands (see storage.ts).
  changeApplets: (change) => {
    const applets = change(savedApplets());
    saveJSON(APPLETS_KEY, applets);
    set({ applets });
  },
  setSound: (soundOn) => {
    saveJSON(SOUND_KEY, { on: soundOn, volume: savedSound().volume });
    set({ soundOn });
  },
  setVolume: (volume) => {
    saveJSON(SOUND_KEY, { on: savedSound().soundOn, volume });
    set({ volume });
  },
  setSaver: (saver) => {
    const next = { ...savedSaver(), ...saver };
    saveJSON(SAVER_KEY, next);
    set({ saver: next });
  },
  setSpotlight: (spotlightOpen) => set({ spotlightOpen }),
  setDashboard: (dashboardOpen) => set({ dashboardOpen }),
  openFullScreen: (app, props) => set({ fullScreen: { app, props }, spotlightOpen: false, exposeOpen: false, dashboardOpen: false }),
  closeFullScreen: () => set({ fullScreen: null }),
  setExpose: (exposeOpen) => set({ exposeOpen }),
  setScreensaver: (screensaverOn) => set({ screensaverOn }),
  setVisitors: (visitors) => set({ visitors }),
  setCrowded: (crowded) => set({ crowded }),
  setWallpaper: (wallpaper) => {
    save(WALLPAPER_KEY, wallpaper);
    set({ wallpaper });
  },
  setRotateWallpaper: (rotateWallpaper) => {
    save(ROTATE_KEY, rotateWallpaper ? '1' : '0');
    set({ rotateWallpaper });
  },
  setPlace: (place) => set({ place }),
  setMenus: (id, menus) => set((s) => ({ menus: { ...s.menus, [id]: menus } }))
}));

// What another tab of this visitor's changes, this one picks up.
onStored(APPLETS_KEY, () => useWindows.setState({ applets: savedApplets() }));
onStored(SOUND_KEY, () => useWindows.setState(savedSound()));
onStored(SAVER_KEY, () => useWindows.setState({ saver: savedSaver() }));
onStored(ACCENT_KEY, () => useWindows.setState({ accent: savedAccent() }));
onStored(GLASS_KEY, () => useWindows.setState({ glass: load(GLASS_KEY) === '1' }));
onStored(ICONS_KEY, () => useWindows.setState({ iconPositions: loadJSON<IconPositions | null>(ICONS_KEY, null) }));
onStored(APPEARANCE_KEY, () => {
  const appearance = savedAppearance();
  useWindows.setState(appearance === 'light' || appearance === 'dark' ? { appearance, theme: appearance } : { appearance });
});

/** The focused window: the frontmost one that isn't minimized. */
/** An open window as the chrome sees it: no position or size. */
export type WindowSummary = Pick<WindowState, 'id' | 'app' | 'title' | 'minimized' | 'maximized'>;

/**
 * The open windows without their positions or sizes, for the Dock, the
 * menu bar and the app switcher: dragging or resizing a window, which
 * updates the store every frame, doesn't re-render them.
 */
export function useWindowList(): WindowSummary[] {
  const keys = useWindows(
    useShallow((s) => Object.values(s.windows).map((w) => JSON.stringify([w.id, w.app, w.title, w.minimized, w.maximized])))
  );
  return useMemo(
    () =>
      keys.map((key) => {
        const [id, app, title, minimized, maximized] = JSON.parse(key);
        return { id, app, title, minimized, maximized };
      }),
    [keys]
  );
}

export function useFocusedId() {
  return useWindows((s) => {
    // A full-screen app covers every window: none has the keys meanwhile.
    if (s.fullScreen) return null;
    for (let i = s.order.length - 1; i >= 0; i--) {
      const id = s.order[i];
      if (!s.windows[id]?.minimized) return id;
    }
    return null;
  });
}
