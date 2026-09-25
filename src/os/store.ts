import { create } from 'zustand';
import type { AppId, Rect, WindowState } from './types';
import type { Place } from './place';
import type { Visitor } from './social';

export const MENU_BAR_HEIGHT = 22;
export const DOCK_CLEARANCE = 78;
export const MOBILE_BREAKPOINT = 768;

export interface OpenOptions {
  /** Windows with the same key are reused instead of duplicated. Defaults to the app id. */
  key?: string;
  title: string;
  width: number;
  height: number;
  origin?: Rect;
  props?: Record<string, string>;
}

/** Light, dark, the system's setting, or dark from sunset to sunrise where the visitor is. */
export type Appearance = 'light' | 'dark' | 'system' | 'sun';
export type SaverStyle = 'photos' | 'starfield' | 'clock';
export interface SaverPrefs {
  style: SaverStyle;
  /** Idle minutes before it starts; 0 for never. */
  idle: number;
}

interface WindowStore {
  windows: Record<string, WindowState>;
  /** Window ids from back to front; the last one is focused. */
  order: string[];
  /** The theme on screen, worked out from `appearance`. */
  theme: 'light' | 'dark';
  appearance: Appearance;
  saver: SaverPrefs;
  /** Interface sounds (see sound.ts); off by default. */
  soundOn: boolean;
  /** 0 to 1. */
  volume: number;
  spotlightOpen: boolean;
  dashboardOpen: boolean;
  /** Exposé: every open window laid out side by side. */
  exposeOpen: boolean;
  screensaverOn: boolean;
  /** People on the desktop right now, this visitor included; null until known. */
  visitors: Visitor[] | null;
  /** A photo URL chosen as the desktop picture, or null for the default. */
  wallpaper: string | null;
  /** Where the visitor is (see place.ts); null until located. */
  place: Place | null;

  open: (app: AppId, options: OpenOptions) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setBounds: (id: string, bounds: Partial<Pick<WindowState, 'x' | 'y' | 'width' | 'height'>>) => void;
  /** Picks light or dark outright (and remembers it). */
  setTheme: (theme: 'light' | 'dark') => void;
  setAppearance: (appearance: Appearance) => void;
  /** Shows a theme without changing the preference; for `system` and `sun`. */
  applyTheme: (theme: 'light' | 'dark') => void;
  setSaver: (saver: Partial<SaverPrefs>) => void;
  setSound: (on: boolean) => void;
  setVolume: (volume: number) => void;
  setSpotlight: (open: boolean) => void;
  setDashboard: (open: boolean) => void;
  setExpose: (open: boolean) => void;
  setScreensaver: (on: boolean) => void;
  setVisitors: (visitors: Visitor[] | null) => void;
  setWallpaper: (url: string | null) => void;
  setPlace: (place: Place) => void;
}

const WALLPAPER_KEY = 'os-wallpaper';
// Shared with the classic site, which stored 'light' or 'dark' here.
const APPEARANCE_KEY = 'theme';
const SAVER_KEY = 'os-screensaver';
const SOUND_KEY = 'os-sound';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function savedAppearance(): Appearance {
  const saved = read(APPEARANCE_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'sun' ? saved : 'system';
}

function savedSound(): { soundOn: boolean; volume: number } {
  try {
    const saved = JSON.parse(read(SOUND_KEY) ?? 'null');
    if (saved) return { soundOn: saved.on === true, volume: Math.min(1, Math.max(0, Number(saved.volume) || 0.6)) };
  } catch {}
  return { soundOn: false, volume: 0.6 };
}

function savedSaver(): SaverPrefs {
  const fallback: SaverPrefs = { style: 'photos', idle: 2 };
  try {
    const saved = JSON.parse(read(SAVER_KEY) ?? 'null');
    return saved ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

function savedWallpaper() {
  try {
    return localStorage.getItem(WALLPAPER_KEY);
  } catch {
    return null;
  }
}

/** Where a new window goes: centred, then stepped down-right per open window. */
function placement(width: number, height: number, openCount: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < MOBILE_BREAKPOINT) {
    return { x: 0, y: MENU_BAR_HEIGHT, width: vw, height: vh - MENU_BAR_HEIGHT };
  }
  // Keep the whole window between the menu bar and the Dock.
  const top = MENU_BAR_HEIGHT + 12;
  const bottom = vh - DOCK_CLEARANCE;
  const w = Math.min(width, vw - 48);
  const h = Math.min(height, bottom - top);
  const step = (openCount % 6) * 28;
  const x = Math.min(vw - w - 16, Math.max(16, Math.round((vw - w) / 2) - 84 + step));
  const y = Math.min(bottom - h, Math.max(top, Math.round((vh - h) / 2) - 60 + step));
  return { x, y, width: w, height: h };
}

export const useWindows = create<WindowStore>((set, get) => ({
  windows: {},
  order: [],
  theme: 'light',
  appearance: typeof window === 'undefined' ? 'system' : savedAppearance(),
  saver: typeof window === 'undefined' ? { style: 'photos', idle: 2 } : savedSaver(),
  ...(typeof window === 'undefined' ? { soundOn: false, volume: 0.6 } : savedSound()),
  spotlightOpen: false,
  dashboardOpen: false,
  exposeOpen: false,
  screensaverOn: false,
  visitors: null,
  wallpaper: typeof window === 'undefined' ? null : savedWallpaper(),
  place: null,

  open: (app, { key = app, title, width, height, origin, props }) => {
    const existing = get().windows[key];
    if (existing) {
      set((s) => ({
        windows: { ...s.windows, [key]: { ...existing, minimized: false, props: props ?? existing.props } },
        order: [...s.order.filter((id) => id !== key), key]
      }));
      return key;
    }
    const bounds = placement(width, height, get().order.length);
    set((s) => ({
      windows: {
        ...s.windows,
        [key]: { id: key, app, title, ...bounds, minimized: false, maximized: false, origin, props }
      },
      order: [...s.order, key]
    }));
    return key;
  },

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

  setTheme: (theme) => {
    write(APPEARANCE_KEY, theme);
    set({ theme, appearance: theme });
  },
  setAppearance: (appearance) => {
    write(APPEARANCE_KEY, appearance);
    set(appearance === 'light' || appearance === 'dark' ? { appearance, theme: appearance } : { appearance });
  },
  applyTheme: (theme) => set({ theme }),
  setSound: (soundOn) => {
    write(SOUND_KEY, JSON.stringify({ on: soundOn, volume: get().volume }));
    set({ soundOn });
  },
  setVolume: (volume) => {
    write(SOUND_KEY, JSON.stringify({ on: get().soundOn, volume }));
    set({ volume });
  },
  setSaver: (saver) => {
    const next = { ...get().saver, ...saver };
    write(SAVER_KEY, JSON.stringify(next));
    set({ saver: next });
  },
  setSpotlight: (spotlightOpen) => set({ spotlightOpen }),
  setDashboard: (dashboardOpen) => set({ dashboardOpen }),
  setExpose: (exposeOpen) => set({ exposeOpen }),
  setScreensaver: (screensaverOn) => set({ screensaverOn }),
  setVisitors: (visitors) => set({ visitors }),
  setWallpaper: (wallpaper) => {
    try {
      if (wallpaper) localStorage.setItem(WALLPAPER_KEY, wallpaper);
      else localStorage.removeItem(WALLPAPER_KEY);
    } catch {}
    set({ wallpaper });
  },
  setPlace: (place) => set({ place })
}));

/** The focused window: the frontmost one that isn't minimized. */
export function useFocusedId() {
  return useWindows((s) => {
    for (let i = s.order.length - 1; i >= 0; i--) {
      const id = s.order[i];
      if (!s.windows[id]?.minimized) return id;
    }
    return null;
  });
}
