// The desktop pictures from ryOS's photo collections (public/os/wallpapers,
// see NOTICE), stored as the picture's path like any photo: what
// Preferences offers, what the default picture moves on to and what the
// Desktop Pictures screen saver shows. Apart from wallpapers.ts, which
// draws the one chosen, so the list (2 KB) comes when it's wanted, not
// with the desktop.

import catalogue from '../../data/wallpapers.json' with { type: 'json' };
import { PATTERNS, ROOT, SOLID_COLORS, TILES, type PictureSet, type SetPicture } from './wallpapers';

export const PICTURE_SETS: PictureSet[] = catalogue.sets.map((set) => ({
  id: set.id,
  name: set.name,
  items: set.items.map((item) => ({
    value: `${ROOT}/photos/${set.id}/${item.file}.webp`,
    name: item.name,
    thumb: `${ROOT}/thumbs/${set.id}/${item.file}.webp`
  }))
}));

/** The set (a ryOS collection, or Tiles) a stored picture belongs to. */
export const setOf = (value: string | null) => [...PICTURE_SETS, TILES].find((set) => set.items.some((item) => item.value === value));

/**
 * Mac OS X's photographic desktop pictures: what the default picture moves
 * on to, and what the Desktop Pictures screen saver shows. (Jincheng's own
 * photos stay in Photos.)
 */
export const SCENIC: SetPicture[] = PICTURE_SETS.filter((set) =>
  ['nature', 'landscapes', 'plants', 'nostalgia', 'black_and_white'].includes(set.id)
).flatMap((set) => set.items);

/**
 * The picture to show next when the desktop changes by itself: another one
 * from the collection the current one belongs to. The default picture moves
 * on to the scenic ones; the dynamic ones (sky, cover) change anyway, so
 * they stay.
 */
export function nextPicture(current: string | null): string | null {
  let pool: string[];
  const set = setOf(current);
  if (set) pool = set.items.map((item) => item.value);
  else if (current?.startsWith('color:')) pool = SOLID_COLORS.map((c) => `color:${c.id}`);
  else if (current?.startsWith('pattern:')) pool = PATTERNS.map((p) => `pattern:${p.id}`);
  else if (current?.startsWith('dynamic:')) return null;
  // A picture of the visitor's own (from Photo Booth) stays put.
  else if (current?.startsWith('data:')) return null;
  else pool = SCENIC.map((item) => item.value);
  const others = pool.filter((value) => value !== current);
  return others.length ? others[Math.floor(Math.random() * others.length)] : null;
}
