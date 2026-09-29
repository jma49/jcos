import { describe, expect, test } from 'vitest';
import { freePlace } from './drive';

// Where a disc lands on a desktop whose icons have been moved: the first
// free place down the right edge, then the next column in.

describe('freePlace', () => {
  test('the top of the right edge when it’s free', () => {
    expect(freePlace({ hd: { top: 300, right: 400 } }, 800)).toEqual({ top: 36, right: 14 });
  });

  test('below the icons already down the right edge', () => {
    const column = { hd: { top: 36, right: 14 }, about: { top: 136, right: 14 }, resume: { top: 236, right: 14 } };
    expect(freePlace(column, 800)).toEqual({ top: 336, right: 14 });
  });

  test('the next column in when the edge is full', () => {
    const full = Object.fromEntries([36, 136, 236, 336, 436, 536].map((top, i) => [`i${i}`, { top, right: 14 }]));
    expect(freePlace(full, 800)).toEqual({ top: 36, right: 120 });
  });

  test('an icon only near a place still takes it', () => {
    expect(freePlace({ hd: { top: 50, right: 30 } }, 800)).toEqual({ top: 136, right: 14 });
  });
});
