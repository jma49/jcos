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
  /** Counts insertions, so each disc put in (after another, or an eject) starts at its menu. */
  inserted: number;
}

export const useDrive = create<Drive>(() => ({ disc: null, inserted: 0 }));

/** The same disc: Jincheng's and a visitor's DVD-R of the same video are two. */
export const sameDisc = (a: ShelfDisc, b: ShelfDisc) => a.id === b.id && !!a.burnedHere === !!b.burnedHere;

/** The disc on its way in, and the one asked for last meanwhile, which goes in after it. */
let going: { disc: ShelfDisc; done: Promise<void> } | null = null;
let next: { disc: ShelfDisc; origin?: Rect } | null = null;

/**
 * Puts a disc in the drive, sliding it in from `origin`, and opens DVD
 * Player. The disc already in the drive stays as it is, playing if it
 * was, and DVD Player comes forward, as double-clicking a Mac's disc did.
 * While a disc slides in the drive is busy: a second double-click on it
 * changes nothing, and a different disc asked for goes in after it (the
 * last one asked for, if several).
 */
export function insertDisc(disc: ShelfDisc, origin?: Rect): Promise<void> {
  if (going) {
    next = sameDisc(going.disc, disc) ? null : { disc, origin };
    return going.done;
  }
  const inDrive = useDrive.getState().disc;
  if (inDrive && sameDisc(inDrive, disc)) {
    launch('dvdplayer');
    return Promise.resolve();
  }
  const done = slideIn(disc, origin)
    .then((slot) => {
      useDrive.setState((d) => ({ disc, inserted: d.inserted + 1 }));
      launch('dvdplayer', { origin: slot });
      bounce('dvdplayer');
    })
    .finally(() => {
      going = null;
      const then = next;
      next = null;
      if (then) void insertDisc(then.disc, then.origin);
    });
  going = { disc, done };
  return done;
}

/** Takes the disc out: DVD Player stops and waits for another. */
export function ejectDisc() {
  const { disc } = useDrive.getState();
  if (!disc) return;
  useDrive.setState({ disc: null });
  void slideOut(disc);
}
