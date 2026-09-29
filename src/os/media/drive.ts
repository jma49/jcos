// The drive: which disc is in it. Finder inserts one (a double-click, or
// Play DVD in Quick Look) and DVD Player plays it; ejecting takes it out.
// Per tab, as the playing song is: a disc in one tab's drive isn't in
// another's.

import { create } from 'zustand';
import { launch } from '../core/registry';
import type { Rect } from '../core/types';
import type { ShelfDisc } from './discs';

interface Drive {
  /** The disc in the drive, or null. */
  disc: ShelfDisc | null;
  /** Counts insertions, so a disc put in again starts over at its menu. */
  inserted: number;
}

export const useDrive = create<Drive>(() => ({ disc: null, inserted: 0 }));

/** Puts a disc in the drive and opens DVD Player, growing from `origin`. */
export function insertDisc(disc: ShelfDisc, origin?: Rect) {
  useDrive.setState((d) => ({ disc, inserted: d.inserted + 1 }));
  launch('dvdplayer', { origin });
}

/** Takes the disc out: DVD Player stops and waits for another. */
export function ejectDisc() {
  useDrive.setState({ disc: null });
}
