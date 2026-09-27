// What an app declares about itself: its manifest. Every app, built in or
// applet, has a `manifest.ts` beside its code, listed once in
// src/os/catalog.ts. The catalog is part of the first load, so a manifest
// holds only data and a way to load the app: it imports this module (and
// its own icon), never its component, which `load` fetches on first open.

import type { ComponentType } from 'react';
import type { AppProps } from '../core/types';

export { pngIcon } from '../core/icons';

/** An applet's page in the Applet Store. */
export interface AppletListing {
  category: 'Games' | 'Utilities';
  /** One line for the store's list. */
  tagline: string;
  /** A paragraph for the detail page. */
  description: string;
  /** When it was added to the store, for "New". */
  added: string;
}

/** A place inside an app that Spotlight finds by name, such as a System Preferences pane. */
export interface AppShortcut {
  id: string;
  name: string;
  Icon: ComponentType<{ size?: number }>;
  /** What the app is opened with to show it. */
  props: Record<string, string>;
}

export interface AppManifest<Id extends string = string> {
  id: Id;
  name: string;
  Icon: ComponentType<{ size?: number }>;
  /** The window's default and smallest size. */
  window: { width: number; height: number; minWidth: number; minHeight: number };
  /** Brushed metal instead of pinstripes, as Tiger's Finder, Safari and iTunes had. */
  material?: 'metal';
  /** The app itself, fetched when it's first opened (or an applet is installed). */
  load: () => Promise<{ default: ComponentType<AppProps> }>;
  /** Kept in the Dock, at this position from the left. */
  dock?: number;
  /** Also in the phone's four-slot Dock (with the Dashboard). */
  phoneDock?: boolean;
  /** Listed in Finder's Applications folder. */
  inApplications?: boolean;
  /** Installed from the Applet Store rather than always there. */
  applet?: AppletListing;
  /** Only opens for something (a project), never by name. */
  internal?: boolean;
  /** A panel rather than an app (About This Mac, the welcome): no Dock icon while open. */
  noDock?: boolean;
  /** Opened from a menu (System Preferences, from the Apple menu), so not listed as an app. */
  menuOnly?: boolean;
  /** Places inside the app that Spotlight lists under the app's name. */
  shortcuts?: AppShortcut[];
}

/** Declares an app, keeping its id as a literal type for `AppId`. */
export const defineApp = <const Id extends string>(manifest: AppManifest<Id>) => manifest;
