// The drive: which disc is in it. Finder inserts one (a double-click, or
// Play DVD in Quick Look) and DVD Player plays it; ejecting takes it out.
// A disc slides into the slot on the screen's right edge on its way in
// and back out on its way out (insertion.ts). It never goes on the
// desktop: Jincheng wants no icons added there (2026-09-29). Per tab, as
// the playing song is: a disc in one tab's drive isn't in another's.

import { create } from 'zustand';
import { launch } from '../core/registry';
import type { Rect } from '../core/types';
import type { ShelfDisc } from './discs';
import { bounce, slideIn, slideOut } from './insertion';

interface Drive {
  /** The disc in the drive, or null. */
  disc: ShelfDisc | null;
  /** Counts insertions, so a disc put in again starts over at its menu. */
  inserted: number;
}

export const useDrive = create<Drive>(() => ({ disc: null, inserted: 0 }));

/** A disc on its way in: a second double-click meanwhile doesn't start another. */
let going: Promise<void> | null = null;

/** Puts a disc in the drive, sliding it in from `origin`, and opens DVD Player. */
export function insertDisc(disc: ShelfDisc, origin?: Rect) {
  going ??= slideIn(disc, origin)
    .then((slot) => {
      useDrive.setState((d) => ({ disc, inserted: d.inserted + 1 }));
      launch('dvdplayer', { origin: slot });
      bounce('dvdplayer');
    })
    .finally(() => {
      going = null;
    });
  return going;
}

/** Takes the disc out: DVD Player stops and waits for another. */
export function ejectDisc() {
  const { disc } = useDrive.getState();
  if (!disc) return;
  useDrive.setState({ disc: null });
  void slideOut(disc);
}
