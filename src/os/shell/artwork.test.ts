import { describe, expect, test } from 'vitest';
import type { Album, Song } from '../../lib/library';
import { around, coversOf, initialTiles, pickTurn, shuffled, wallFor } from './artwork';

// The iTunes Artwork screen saver: which covers, where they go, and which
// tile turns over next.

/** A random number generator that always answers the same, for picks that can be predicted. */
const always = (n: number) => () => n;
const ascending = (a: number, b: number) => a - b;

describe('coversOf', () => {
  const album: Album = { title: 'Blond', artist: 'Frank Ocean', year: 2016, cover: 'blond.jpg' };
  const song = (id: string, extra: Partial<Song> = {}): Song => ({ id, title: id, artist: 'Someone', ...extra });

  test('albums first, then songs with their own art, each cover once', () => {
    const songs = [song('a', { cover: 'a.jpg' }), song('b', { album: 'Blond' }), song('c', { cover: 'blond.jpg' }), song('d', { cover: 'a.jpg' })];
    expect(coversOf([album], songs)).toEqual(['blond.jpg', 'a.jpg']);
  });

  test('a song without art brings none', () => {
    expect(coversOf([], [song('x')])).toEqual([]);
  });
});

describe('shuffled', () => {
  test('keeps every item and leaves the original alone', () => {
    const items = ['a', 'b', 'c', 'd'];
    const out = shuffled(items, always(0));
    expect([...out].sort()).toEqual(items);
    expect(out).not.toEqual(items);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('wallFor', () => {
  test('a 1440 × 900 screen is eight tiles of 180 by five', () => {
    expect(wallFor(1440, 900, 1440)).toEqual({ cols: 8, rows: 5, tile: 180 });
  });

  test('the preview is the same wall in miniature', () => {
    expect(wallFor(288, 175, 1440)).toMatchObject({ cols: 8, rows: 5, tile: 36 });
  });

  test('a last row may run off the edges; a narrow screen still has four columns', () => {
    expect(wallFor(1920, 1080, 1920)).toMatchObject({ cols: 11, rows: 7 });
    expect(wallFor(390, 844, 390)).toMatchObject({ cols: 4, rows: 9 });
  });
});

describe('around', () => {
  // 0 1 2
  // 3 4 5
  // 6 7 8
  test('the tiles touching one, corners included', () => {
    expect(around(4, 9, 3).sort(ascending)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(around(0, 9, 3).sort(ascending)).toEqual([1, 3, 4]);
  });

  test('not across the end of a row, nor past the last tile', () => {
    expect(around(2, 9, 3).sort(ascending)).toEqual([1, 4, 5]);
    expect(around(5, 6, 3).sort(ascending)).toEqual([1, 2, 4]);
  });
});

describe('initialTiles', () => {
  test('deals the covers in turn, again from the start when they run out', () => {
    expect(initialTiles(['a', 'b', 'c'], 5, 5, always(0))).toEqual(['a', 'b', 'c', 'a', 'b']);
  });

  test('every cover once before any comes round again, and never touching itself', () => {
    const covers = Array.from({ length: 16 }, (_, i) => `cover-${i}`);
    for (let run = 0; run < 50; run++) {
      const tiles = initialTiles(covers, 40, 8);
      expect(new Set(tiles.slice(0, 16)).size).toBe(16);
      tiles.forEach((cover, i) => around(i, 40, 8).forEach((n) => expect(tiles[n]).not.toBe(cover)));
    }
  });

  test('one cover fills the wall; none leaves it empty', () => {
    expect(initialTiles(['a'], 3, 3)).toEqual(['a', 'a', 'a']);
    expect(initialTiles([], 3, 3)).toEqual([]);
  });
});

describe('pickTurn', () => {
  // a b c
  // d e f
  // g h i
  const tiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

  test('turns a tile to a cover that none of the tiles around it shows', () => {
    // always(0) picks tile 0 ("a"), touching b, d and e: so c, f, g, h or i, and of those the first.
    expect(pickTurn(tiles, 3, tiles, [], always(0))).toEqual({ index: 0, cover: 'c' });
  });

  test('prefers a cover the wall doesn’t show yet', () => {
    const covers = [...tiles, 'j', 'k'];
    for (const n of [0, 0.3, 0.6, 0.99]) expect(['j', 'k']).toContain(pickTurn(tiles, 3, covers, [], always(n))?.cover);
  });

  test('lets the tiles that turned lately rest', () => {
    for (const n of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      expect([0, 8]).toContain(pickTurn(tiles, 3, tiles, [1, 2, 3, 4, 5, 6, 7], always(n))?.index);
    }
  });

  test('when every tile has turned lately, any may turn', () => {
    expect(pickTurn(['a', 'b'], 2, ['a', 'b'], [0, 1], always(0))).toEqual({ index: 0, cover: 'b' });
  });

  test('never turns a tile to the cover it shows', () => {
    // Two covers: the only other one is also its neighbour's, and that's allowed.
    expect(pickTurn(['a', 'b', 'a'], 3, ['a', 'b'], [], always(0))).toEqual({ index: 0, cover: 'b' });
  });

  test('with one cover or none, nothing turns', () => {
    expect(pickTurn(['a', 'a'], 2, ['a'], [])).toBeNull();
    expect(pickTurn([], 2, ['a', 'b'], [])).toBeNull();
  });
});
