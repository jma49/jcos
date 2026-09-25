import { create } from 'zustand';
import type { AppId, Rect, WindowState } from './types';

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

interface WindowStore {
  windows: Record<string, WindowState>;
  /** Window ids from back to front; the last one is focused. */
  order: string[];
  theme: 'light' | 'dark';
  spotlightOpen: boolean;
  dashboardOpen: boolean;

  open: (app: AppId, options: OpenOptions) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setBounds: (id: string, bounds: Partial<Pick<WindowState, 'x' | 'y' | 'width' | 'height'>>) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setSpotlight: (open: boolean) => void;
  setDashboard: (open: boolean) => void;
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
  spotlightOpen: false,
  dashboardOpen: false,

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

  setTheme: (theme) => set({ theme }),
  setSpotlight: (spotlightOpen) => set({ spotlightOpen }),
  setDashboard: (dashboardOpen) => set({ dashboardOpen })
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
