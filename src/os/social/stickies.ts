// A member's own stickies, on their own desktop, which only they read.
// The Supabase side is supabase/stickies.ts, the stand-in's
// local/stickies.ts; the desktop uses them through stickies/mine.ts.

import type { NoteColor } from './notes';

/** A member's own sticky note on their desktop, which only they read. */
export interface Sticky {
  id: string;
  body: string;
  color: NoteColor;
  /** Where it sits on the desktop, in CSS pixels from its top left corner, and its size. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rolled up to its title bar. */
  collapsed: boolean;
  /** Counts saves of its text alone. */
  version: number;
  /** When it last changed (ISO 8601). */
  updated: string;
}

/** What a sticky is put up with, or changed by. */
export type StickyChange = Partial<Pick<Sticky, 'body' | 'color' | 'x' | 'y' | 'width' | 'height' | 'collapsed'>>;

/** How many stickies a member may keep, and how much each holds (the database's sticky_limit and check). */
export const STICKY_MOST = 50;
export const STICKY_MAX = 4000;

export interface StickiesSocial {
  /** The signed-in member's own stickies (nobody else's, the owner's included); none signed out. */
  myStickies: () => Promise<Sticky[]>;
  /** Puts up a sticky of the member's own. */
  addSticky: (sticky: StickyChange) => Promise<Sticky>;
  /**
   * Changes one of the member's stickies. Moving, sizing, colouring or
   * rolling it up is never out of date; a change of its text names the
   * `version` it was typed over, refused ('conflict') if the text was
   * saved elsewhere since or the sticky taken down.
   */
  changeSticky: (id: string, change: StickyChange, version?: number) => Promise<Sticky>;
  /** Takes one of the member's stickies down. */
  removeSticky: (id: string) => Promise<void>;
}
