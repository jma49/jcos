import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { AppId, Menus, Rect, WindowState } from './types';
import type { Place } from '../ambient/place';
import type { Visitor } from '../social/social';
import type { AccentChoice } from '../look/accent';
import { load, loadJSON, loadSettings, onStored, save, saveJSON } from './storage';
import { frontOf, giveBack, hold, type Held } from './focus';

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

// matchMedia is missing where there's no page (the tests' stand-in window).
export const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;

/** The browser's inner size, in CSS pixels. */
export interface Viewport {
  width: number;
  height: number;
}

const viewportNow = (): Viewport =>
  typeof window === 'undefined' ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight };

/** Where a zoomed window sits: the desktop between the menu bar and the Dock, with a small margin. */
export const zoomedFrame = ({ width, height }: Viewport): Rect => ({
  x: 8,
  y: MENU_BAR_HEIGHT + 8,
  width: width - 16,
  height: height - MENU_BAR_HEIGHT - DOCK_CLEARANCE
});

/** A phone's app fills the screen under the menu bar. */
export const phoneFrame = ({ width, height }: Viewport): Rect => ({ x: 0, y: MENU_BAR_HEIGHT, width, height: height - MENU_BAR_HEIGHT });

/**
 * Brings a window back on screen when the browser is smaller than it was
 * (a reload, a resize, a rotation): its size where it still fits, its
 * title bar within reach; on a phone, the full-screen place. A window
 * that fits is returned as it is, so nothing that shows it renders again.
 */
export function fitWindow(win: WindowState, viewport: Viewport, phone = isPhone()): WindowState {
  const { width: vw, height: vh } = viewport;
  let next: Rect;
  if (phone) {
    next = phoneFrame(viewport);
  } else {
    const width = Math.min(win.width, vw - 32);
    const height = Math.min(win.height, vh - MENU_BAR_HEIGHT - DOCK_CLEARANCE);
    next = {
      width,
      height,
      x: Math.max(0, Math.min(win.x, vw - width)),
      y: Math.max(MENU_BAR_HEIGHT, Math.min(win.y, vh - DOCK_CLEARANCE - 40))
    };
  }
  const same = next.x === win.x && next.y === win.y && next.width === win.width && next.height === win.height;
  return same ? win : { ...win, ...next };
}

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
  /**
   * The browser's inner size, which zoomed windows, a phone's apps and
   * Exposé follow; kept current by watchViewport(). Select it only where
   * the frame depends on it, so a resize renders only those.
   */
  viewport: Viewport;
  /** Whether the desktop is a phone's (isPhone()), as of the last change of the viewport. */
  phone: boolean;

  open: (app: AppId, options: OpenOptions) => string;
  /** Puts back windows from an earlier visit (see windowSession.ts), in their stacking order. */
  restore: (windows: WindowState[], order: string[]) => void;
  /**
   * The browser's size changed (a resize, a rotation, the restore of a
   * session): every window is fitted to it (fitWindow) and the viewport
   * noted, in one change. Windows that fit keep their objects.
   */
  fitToViewport: () => void;
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
  /**
   * Opens a full-screen app over everything, closing Spotlight, Exposé and
   * the Dashboard. Spotlight, the Dashboard and a full-screen app note what
   * had focus as they open and give it back as they close (focus.ts):
   * their layers call releaseFocus().
   */
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

/**
 * What had focus before Spotlight, the Dashboard or a full-screen app
 * took it, noted by the store's action that opens it, before anything of
 * it mounts (a full-screen app's code, once cached, focuses itself in the
 * same render as its layer mounts).
 */
type Overlay = 'spotlight' | 'dashboard' | 'fullScreen';
const held = new Map<Overlay, Held>();

/**
 * Gives focus back to what had it before `overlay` opened, or to the
 * window in front (focus.ts); `from` is the overlay's element. Its layer
 * calls this as it closes, once what's under it can take focus again.
 */
export function releaseFocus(overlay: Overlay, from?: Element | null) {
  const was = held.get(overlay);
  held.delete(overlay);
  giveBack(was, () => frontOf(useWindows.getState()), from);
}

/** A window that closed or went to the Dock hands focus to the one in front (if it had it). */
function leaveWindow(id: string) {
  if (typeof document === 'undefined') return;
  const el = [...document.querySelectorAll('.os-window')].find((w) => (w as HTMLElement).dataset.id === id);
  giveBack({ el: null, front: id }, () => frontOf(useWindows.getState()), el);
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
  if (isPhone()) return phoneFrame({ width: vw, height: vh });
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
  viewport: viewportNow(),
  phone: isPhone(),

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

  fitToViewport: () =>
    set((s) => {
      const viewport = viewportNow();
      const phone = isPhone();
      const fitted = Object.values(s.windows).map((w) => fitWindow(w, viewport, phone));
      const moved = fitted.some((w) => w !== s.windows[w.id]);
      return { viewport, phone, windows: moved ? Object.fromEntries(fitted.map((w) => [w.id, w])) : s.windows };
    }),

  close: (id) => {
    set((s) => {
      const { [id]: _removed, ...windows } = s.windows;
      return { windows, order: s.order.filter((w) => w !== id) };
    });
    leaveWindow(id);
  },

  focus: (id) =>
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: win.minimized ? { ...s.windows, [id]: { ...win, minimized: false } } : s.windows,
        order: [...s.order.filter((w) => w !== id), id]
      };
    }),

  minimize: (id) => {
    set((s) => ({
      windows: { ...s.windows, [id]: { ...s.windows[id], minimized: true } },
      // Send it to the back so the next window up takes focus.
      order: [id, ...s.order.filter((w) => w !== id)]
    }));
    leaveWindow(id);
  },

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
  setSpotlight: (spotlightOpen) => {
    if (spotlightOpen && !get().spotlightOpen) held.set('spotlight', hold(frontOf(get())));
    set({ spotlightOpen });
  },
  setDashboard: (dashboardOpen) => {
    if (dashboardOpen && !get().dashboardOpen) held.set('dashboard', hold(frontOf(get())));
    set({ dashboardOpen });
  },
  openFullScreen: (app, props) => {
    const s = get();
    if (!s.fullScreen) {
      // Opened from Spotlight or the Dashboard, which close: what had focus before them.
      const before = (s.spotlightOpen && held.get('spotlight')) || (s.dashboardOpen && held.get('dashboard'));
      held.set('fullScreen', before || hold(frontOf(s)));
      held.delete('spotlight');
      held.delete('dashboard');
    }
    set({ fullScreen: { app, props }, spotlightOpen: false, exposeOpen: false, dashboardOpen: false });
  },
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

/**
 * Follows the browser's size: on a resize or a rotation, the windows are
 * fitted to it (fitToViewport) once per animation frame, however many
 * events arrive in it; between resizes nothing runs. Call once, from an
 * effect; returns a function that stops.
 */
export function watchViewport() {
  let frame = 0;
  const onResize = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      useWindows.getState().fitToViewport();
    });
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    cancelAnimationFrame(frame);
  };
}

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
  // A full-screen app covers every window: none has the keys meanwhile.
  return useWindows((s) => (s.fullScreen ? null : frontOf(s)));
}
