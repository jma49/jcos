import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  AboutIcon,
  AccountIcon,
  ChatIcon,
  AppletStoreIcon,
  CalculatorIcon,
  TileGameIcon,
  BrowserIcon,
  DiskIcon,
  FolderIcon,
  IPodIcon,
  KaraokeIcon,
  MinesweeperIcon,
  PhotosIcon,
  PreferencesIcon,
  ProjectIcon,
  ResumeIcon,
  SoapboxIcon,
  StickiesIcon,
  TerminalIcon
} from './icons';
import { useWindows } from './store';
import type { AppId, Rect, WindowState } from './types';

export interface AppProps {
  win: WindowState;
}

export interface AppDefinition {
  name: string;
  Icon: ComponentType<{ size?: number }>;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  /** Brushed metal instead of pinstripes, as Tiger's Finder, Safari and iTunes had. */
  material?: 'metal';
  /** Loaded on first open, so the desktop itself stays small. */
  Component: LazyExoticComponent<ComponentType<AppProps>>;
  /** Kept in the Dock, at this position from the left. */
  dock?: number;
  /** Also in the phone's four-slot Dock (with the Dashboard). */
  phoneDock?: boolean;
  /** Listed in Finder's Applications folder. */
  inApplications?: boolean;
  /** Installed from the Applet Store (see applets.ts) rather than always there. */
  applet?: boolean;
  /** Only opens for something (a project), never by name. */
  internal?: boolean;
}

export const apps: Record<AppId, AppDefinition> = {
  about: {
    name: 'About Me',
    Icon: AboutIcon,
    width: 560,
    height: 520,
    minWidth: 360,
    minHeight: 280,
    Component: lazy(() => import('../apps/About'))
  },
  resume: {
    name: 'Résumé',
    Icon: ResumeIcon,
    width: 900,
    height: 760,
    minWidth: 420,
    minHeight: 320,
    Component: lazy(() => import('../apps/Resume'))
  },
  projects: {
    dock: 1,
    phoneDock: true,
    name: 'Projects',
    Icon: FolderIcon,
    width: 700,
    height: 460,
    minWidth: 420,
    minHeight: 280,
    Component: lazy(() => import('../apps/Projects'))
  },
  project: {
    internal: true,
    name: 'Project',
    Icon: ProjectIcon,
    width: 640,
    height: 640,
    minWidth: 380,
    minHeight: 300,
    Component: lazy(() => import('../apps/ProjectDetail'))
  },
  browser: {
    inApplications: true,
    material: 'metal',
    name: 'Browser',
    Icon: BrowserIcon,
    width: 1040,
    height: 700,
    minWidth: 420,
    minHeight: 300,
    Component: lazy(() => import('../apps/Browser'))
  },
  terminal: {
    dock: 7,
    phoneDock: true,
    inApplications: true,
    name: 'Terminal',
    Icon: TerminalIcon,
    width: 640,
    height: 420,
    minWidth: 360,
    minHeight: 220,
    Component: lazy(() => import('../apps/Terminal'))
  },
  photos: {
    dock: 2,
    phoneDock: true,
    inApplications: true,
    material: 'metal',
    name: 'Photos',
    Icon: PhotosIcon,
    width: 1000,
    height: 680,
    minWidth: 420,
    minHeight: 320,
    Component: lazy(() => import('../apps/Photos'))
  },
  stickies: {
    dock: 4,
    inApplications: true,
    name: 'Stickies',
    Icon: StickiesIcon,
    width: 720,
    height: 540,
    minWidth: 360,
    minHeight: 320,
    Component: lazy(() => import('../apps/Stickies'))
  },
  soapbox: {
    dock: 5,
    inApplications: true,
    name: 'Soapbox',
    Icon: SoapboxIcon,
    width: 560,
    height: 600,
    minWidth: 360,
    minHeight: 300,
    Component: lazy(() => import('../apps/Soapbox'))
  },
  finder: {
    material: 'metal',
    name: 'Finder',
    Icon: DiskIcon,
    width: 760,
    height: 480,
    minWidth: 440,
    minHeight: 300,
    Component: lazy(() => import('../apps/Finder'))
  },
  appstore: {
    inApplications: true,
    name: 'Applet Store',
    Icon: AppletStoreIcon,
    width: 680,
    height: 540,
    minWidth: 420,
    minHeight: 360,
    Component: lazy(() => import('../apps/AppletStore'))
  },
  calculator: {
    applet: true,
    material: 'metal',
    name: 'Calculator',
    Icon: CalculatorIcon,
    width: 250,
    height: 360,
    minWidth: 230,
    minHeight: 340,
    Component: lazy(() => import('../apps/Calculator'))
  },
  tilegame: {
    applet: true,
    name: 'Tile Game',
    Icon: TileGameIcon,
    width: 380,
    height: 470,
    minWidth: 360,
    minHeight: 450,
    Component: lazy(() => import('../apps/TileGame'))
  },
  minesweeper: {
    applet: true,
    name: 'Minesweeper',
    Icon: MinesweeperIcon,
    width: 400,
    height: 470,
    minWidth: 300,
    minHeight: 360,
    Component: lazy(() => import('../apps/Minesweeper'))
  },
  ipod: {
    dock: 3,
    inApplications: true,
    name: 'iPod',
    Icon: IPodIcon,
    width: 300,
    height: 492,
    minWidth: 300,
    minHeight: 492,
    Component: lazy(() => import('../apps/ipod/IPod'))
  },
  karaoke: {
    inApplications: true,
    name: 'Karaoke',
    Icon: KaraokeIcon,
    width: 760,
    height: 500,
    minWidth: 460,
    minHeight: 320,
    Component: lazy(() => import('../apps/Karaoke'))
  },
  chat: {
    dock: 6,
    inApplications: true,
    name: 'Chat',
    Icon: ChatIcon,
    width: 560,
    height: 600,
    minWidth: 360,
    minHeight: 340,
    Component: lazy(() => import('../apps/Chat'))
  },
  account: {
    name: 'Account',
    Icon: AccountIcon,
    width: 420,
    height: 470,
    minWidth: 380,
    minHeight: 400,
    Component: lazy(() => import('../apps/Account'))
  },
  welcome: {
    internal: true,
    name: 'Welcome',
    Icon: ProjectIcon,
    width: 440,
    height: 470,
    minWidth: 360,
    minHeight: 420,
    Component: lazy(() => import('../apps/Welcome'))
  },
  preferences: {
    dock: 8,
    inApplications: true,
    name: 'System Preferences',
    Icon: PreferencesIcon,
    width: 660,
    height: 560,
    minWidth: 480,
    minHeight: 360,
    Component: lazy(() => import('../apps/Preferences'))
  }
};

const appIds = Object.keys(apps) as AppId[];

/** Apps kept in the Dock, left to right. Others show up there while they're open. */
export const dockApps = appIds.filter((id) => apps[id].dock).sort((a, b) => apps[a].dock! - apps[b].dock!);

/** Dock apps that also appear in the phone's Dock. */
export const mobileDockApps = appIds.filter((id) => apps[id].phoneDock);

/** Every app that opens by name: from the Terminal's `open` and `?open=`. */
export const openableApps = appIds.filter((id) => !apps[id].internal);

/** What Spotlight lists as applications (applets are listed separately). */
export const launcherApps = openableApps.filter((id) => !apps[id].applet);

/** Finder's Applications folder. */
export const applicationApps = appIds.filter((id) => apps[id].inApplications);

interface LaunchOptions {
  key?: string;
  title?: string;
  origin?: Rect;
  props?: Record<string, string>;
}

/** Opens (or focuses) an app window with its registered defaults. */
export function launch(app: AppId, { key, title, origin, props }: LaunchOptions = {}) {
  const def = apps[app];
  return useWindows.getState().open(app, {
    key,
    title: title ?? def.name,
    width: def.width,
    height: def.height,
    origin,
    props
  });
}

/** The on-screen rect of an element, for launch animations. */
export function rectOf(el: Element | null): Rect | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
