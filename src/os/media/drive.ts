// The drive: which disc is in it. Finder inserts one (a double-click, or
// Play DVD in Quick Look) and DVD Player plays it; ejecting takes it out.
// A disc slides into the slot on the screen's right edge on its way in
// and back out on its way out (insertion.ts), and while it's in it's on
// the desktop too, under Macintosh HD (the window store's `disc`, which
// the desktop reads without loading this). Per tab, as the playing song
// is: a disc in one tab's drive isn't in another's.

import { create } from 'zustand';
import { launch } from '../core/registry';
import { useWindows, type IconPositions } from '../core/store';
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

/**
 * Where a disc goes on a desktop whose icons have been moved: the first
 * free place down the right, then the next column in, as a Mac puts a new
 * disc. (Icons still in their column make room for it by themselves.)
 */
export function freePlace(taken: IconPositions, height: number): { top: number; right: number } {
  const spots = Object.values(taken);
  for (let column = 0; column < 12; column++) {
    for (let top = 36; top <= height - 200; top += 100) {
      const right = 14 + column * 106;
      if (!spots.some((p) => Math.abs(p.top - top) < 80 && Math.abs(p.right - right) < 90)) return { top, right };
    }
  }
  return { top: 36, right: 14 };
}

/** A disc on its way in: a second double-click meanwhile doesn't start another. */
let going: Promise<void> | null = null;

/** Puts a disc in the drive, sliding it in from `origin`, and opens DVD Player. */
export function insertDisc(disc: ShelfDisc, origin?: Rect) {
  going ??= slideIn(disc, origin)
    .then((slot) => {
      useDrive.setState((d) => ({ disc, inserted: d.inserted + 1 }));
      const { iconPositions, setIconPositions } = useWindows.getState();
      if (iconPositions && !iconPositions.disc) setIconPositions({ ...iconPositions, disc: freePlace(iconPositions, window.innerHeight) });
      useWindows.setState({ disc: { title: disc.title } });
      launch('dvdplayer', { origin: slot });
      bounce('dvdplayer');
    })
    .finally(() => {
      going = null;
    });
  return going;
}

/** Takes the disc out: it leaves the desktop, DVD Player stops and waits for another. */
export function ejectDisc() {
  const { disc } = useDrive.getState();
  useWindows.setState({ disc: null, ejecting: false });
  // The next disc finds a place of its own.
  const { iconPositions, setIconPositions } = useWindows.getState();
  if (iconPositions?.disc) {
    const rest = { ...iconPositions };
    delete rest.disc;
    setIconPositions(rest);
  }
  if (!disc) return;
  useDrive.setState({ disc: null });
  void slideOut(disc);
}
