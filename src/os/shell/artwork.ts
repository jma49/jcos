import type { Album, Song } from '../../lib/library';

// The iTunes Artwork screen saver's arithmetic (the saver is in
// savers.tsx): which covers there are, how the wall is laid out, where
// each cover goes, and which tile turns over next. Every cover is dealt
// once before any comes round again, no cover sits beside itself while
// there are others, and a tile that has just turned sits out the next
// few turns.

/** About how wide a tile is on the screen, in pixels. */
const TILE = 180;

/**
 * The library's artwork, each cover once: the albums', then songs' own.
 * A song without art (the iPod shows its video's frame) has none to show.
 */
export function coversOf(albums: Album[], songs: Song[]) {
  return [...new Set([...albums.map((a) => a.cover), ...songs.map((s) => s.cover)].filter((c): c is string => !!c))];
}

/** `items` in a random order, so each time the wall starts it's dealt differently. */
export function shuffled<T>(items: T[], random: () => number = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The wall on a stage `width` × `height`: as many columns as a screen
 * `screen` pixels wide has, so the preview in System Preferences is the
 * screen in miniature, and enough square tiles to cover the stage (a
 * last row may run off the edges).
 */
export function wallFor(width: number, height: number, screen: number) {
  const cols = Math.max(4, Math.round(screen / TILE));
  const tile = width / cols;
  const rows = Math.max(1, Math.ceil(height / tile - 0.01));
  return { cols, rows, tile };
}

/** The tiles touching one, corners included, among `count` tiles `cols` to a row. */
export function around(index: number, count: number, cols: number) {
  const out: number[] = [];
  const row = Math.floor(index / cols);
  const col = index % cols;
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      const i = r * cols + c;
      if (i !== index && r >= 0 && c >= 0 && c < cols && i < count) out.push(i);
    }
  }
  return out;
}

/** Of `choices`, one of those the wall shows least (`shown` counts them), at random. */
function leastShown(choices: string[], shown: Map<string, number>, random: () => number) {
  const least = Math.min(...choices.map((c) => shown.get(c) ?? 0));
  const best = choices.filter((c) => (shown.get(c) ?? 0) === least);
  return best[Math.floor(random() * best.length)];
}

/**
 * The first wall: `count` tiles, `cols` to a row, left to right and top
 * to bottom. Each takes a cover the wall shows least, and not one the
 * tiles already dealt around it show: so every cover is on the wall
 * once before any is there twice.
 */
export function initialTiles(covers: string[], count: number, cols: number, random: () => number = Math.random): string[] {
  if (!covers.length) return [];
  const tiles: string[] = [];
  const shown = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const nearby = new Set(around(i, i, cols).map((n) => tiles[n]));
    const apart = covers.filter((c) => !nearby.has(c));
    const pick = leastShown(apart.length ? apart : covers, shown, random);
    tiles.push(pick);
    shown.set(pick, (shown.get(pick) ?? 0) + 1);
  }
  return tiles;
}

/**
 * The next turn: a tile that isn't among the `resting` ones (those that
 * turned lately), and the cover it turns to: not the one it shows, if
 * possible none that the tiles around it show, and of those one the wall
 * shows least. Null when there's no other cover to turn to.
 */
export function pickTurn(
  tiles: string[],
  cols: number,
  covers: string[],
  resting: number[],
  random: () => number = Math.random
): { index: number; cover: string } | null {
  if (!tiles.length || covers.length < 2) return null;
  const all = tiles.map((_, i) => i);
  const rested = all.filter((i) => !resting.includes(i));
  const pool = rested.length ? rested : all;
  const index = pool[Math.floor(random() * pool.length)];
  const nearby = new Set([tiles[index], ...around(index, tiles.length, cols).map((n) => tiles[n])]);
  const apart = covers.filter((c) => !nearby.has(c));
  const choices = apart.length ? apart : covers.filter((c) => c !== tiles[index]);
  if (!choices.length) return null;
  const shown = new Map<string, number>();
  for (const t of tiles) shown.set(t, (shown.get(t) ?? 0) + 1);
  return { index, cover: leastShown(choices, shown, random) };
}
