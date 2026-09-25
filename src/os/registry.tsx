import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  AboutIcon,
  BrowserIcon,
  FolderIcon,
  PhotosIcon,
  PreferencesIcon,
  ProjectIcon,
  ResumeIcon,
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
  /** Loaded on first open, so the desktop itself stays small. */
  Component: LazyExoticComponent<ComponentType<AppProps>>;
}

export const apps: Record<AppId, AppDefinition> = {
  about: {
    name: 'About Me',
    Icon: AboutIcon,
    width: 560,
    height: 520,
    minWidth: 360,
    minHeight: 280,
    Component: lazy(() => import('./apps/About'))
  },
  resume: {
    name: 'Résumé',
    Icon: ResumeIcon,
    width: 900,
    height: 760,
    minWidth: 420,
    minHeight: 320,
    Component: lazy(() => import('./apps/Resume'))
  },
  projects: {
    name: 'Projects',
    Icon: FolderIcon,
    width: 700,
    height: 460,
    minWidth: 420,
    minHeight: 280,
    Component: lazy(() => import('./apps/Projects'))
  },
  project: {
    name: 'Project',
    Icon: ProjectIcon,
    width: 640,
    height: 640,
    minWidth: 380,
    minHeight: 300,
    Component: lazy(() => import('./apps/ProjectDetail'))
  },
  browser: {
    name: 'Browser',
    Icon: BrowserIcon,
    width: 1040,
    height: 700,
    minWidth: 420,
    minHeight: 300,
    Component: lazy(() => import('./apps/Browser'))
  },
  terminal: {
    name: 'Terminal',
    Icon: TerminalIcon,
    width: 640,
    height: 420,
    minWidth: 360,
    minHeight: 220,
    Component: lazy(() => import('./apps/Terminal'))
  },
  photos: {
    name: 'Photos',
    Icon: PhotosIcon,
    width: 1000,
    height: 680,
    minWidth: 420,
    minHeight: 320,
    Component: lazy(() => import('./apps/Photos'))
  },
  stickies: {
    name: 'Stickies',
    Icon: StickiesIcon,
    width: 720,
    height: 540,
    minWidth: 360,
    minHeight: 320,
    Component: lazy(() => import('./apps/Stickies'))
  },
  preferences: {
    name: 'System Preferences',
    Icon: PreferencesIcon,
    width: 660,
    height: 560,
    minWidth: 480,
    minHeight: 360,
    Component: lazy(() => import('./apps/Preferences'))
  }
};

/** Apps shown in the Dock, left to right. */
export const dockApps: AppId[] = ['about', 'resume', 'projects', 'photos', 'stickies', 'terminal', 'browser', 'preferences'];

/** Dock apps that also appear in the four-slot Dock on phones. */
export const mobileDockApps: AppId[] = ['projects', 'photos', 'terminal'];

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
