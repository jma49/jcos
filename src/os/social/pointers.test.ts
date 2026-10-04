import { describe, expect, test } from 'vitest';
import { CALM, CROWD, isCrowded } from './online';
import { anyoneWatching, MAX_CURSORS, placeCursor } from './Presence';
import { cleanCursor, cleanInfo, CURSOR_COLORS } from './types';

// Other visitors' pointers: drawn only for those who ask, sent only while
// someone does, and stopped while too many people are here (coming back
// later than they went, so a count at the limit doesn't flicker).

describe('isCrowded', () => {
  test('pointers stop once more than CROWD people are here', () => {
    expect(isCrowded(CROWD, false)).toBe(false);
    expect(isCrowded(CROWD + 1, false)).toBe(true);
  });

  test('and come back only once the crowd is down to CALM', () => {
    expect(CALM).toBeLessThan(CROWD);
    expect(isCrowded(CROWD, true)).toBe(true);
    expect(isCrowded(CALM + 1, true)).toBe(true);
    expect(isCrowded(CALM, true)).toBe(false);
  });

  test('a count going back and forth at the limit switches once', () => {
    let crowded = false;
    let switches = 0;
    for (const count of [12, 13, 12, 13, 12, 11, 12, 13, 11]) {
      const now = isCrowded(count, crowded);
      if (now !== crowded) switches++;
      crowded = now;
    }
    expect(switches).toBe(1);
  });
});

describe('anyoneWatching', () => {
  test('nobody has asked to see pointers: none are sent', () => {
    expect(anyoneWatching(null)).toBe(false);
    expect(anyoneWatching([{ self: true }, {}, { watching: undefined }])).toBe(false);
  });

  test('someone else has asked: pointers are sent', () => {
    expect(anyoneWatching([{ self: true }, { watching: true }])).toBe(true);
  });

  test('this browser asking doesn’t count', () => {
    expect(anyoneWatching([{ self: true, watching: true }])).toBe(false);
  });
});

describe('what a visitor says about pointers', () => {
  test('watching is true or nothing', () => {
    expect(cleanInfo({ watching: true }, '#000').watching).toBe(true);
    expect(cleanInfo({ watching: 'yes' }, '#000').watching).toBeUndefined();
    expect(cleanInfo({}, '#000').watching).toBeUndefined();
  });
});

describe('a pointer someone sends', () => {
  const here = (id: string) => id === 'a';
  const color = CURSOR_COLORS[0];

  test('from someone on the desktop, in range, in one of our colours: kept', () => {
    expect(cleanCursor({ id: 'a', x: 0.5, y: 0, color }, here)).toEqual({ id: 'a', x: 0.5, y: 0, color });
    expect(cleanCursor({ id: 'a', x: 1, y: 1, color }, here)).toEqual({ id: 'a', x: 1, y: 1, color });
  });

  test('leaving the page (-1, -1) is kept, to take the pointer away', () => {
    expect(cleanCursor({ id: 'a', x: -1, y: -1, color }, here)).toEqual({ id: 'a', x: -1, y: -1, color });
  });

  test.each([
    [null, 'nothing'],
    ['a', 'not an object'],
    [{ id: 'b', x: 0.5, y: 0.5, color }, 'someone not on the desktop'],
    [{ id: 7, x: 0.5, y: 0.5, color }, 'an id that isn’t text'],
    [{ id: 'a', x: Number.NaN, y: 0.5, color }, 'a coordinate that isn’t a number'],
    [{ id: 'a', x: Infinity, y: 0.5, color }, 'an infinite coordinate'],
    [{ id: 'a', x: '0.5', y: 0.5, color }, 'a coordinate as text'],
    [{ id: 'a', x: 1.5, y: 0.5, color }, 'a coordinate past the edge'],
    [{ id: 'a', x: 0.5, y: -0.5, color }, 'a negative coordinate that isn’t leaving'],
    [{ id: 'a', x: -1, y: 0.5, color }, 'half leaving'],
    [{ id: 'a', x: 0.5, y: 0.5, color: '#123456' }, 'a colour that isn’t ours'],
    [{ id: 'a', x: 0.5, y: 0.5, color: 'red;background:url(x)' }, 'a colour that isn’t a colour'],
    [{ id: 'a', x: 0.5, y: 0.5 }, 'no colour']
  ] as [unknown, string][])('refused: %o (%s)', (raw) => expect(cleanCursor(raw, here)).toBeNull());
});

describe('the pointers kept', () => {
  const cursor = { x: 0.5, y: 0.5, color: CURSOR_COLORS[1] };
  const full = Object.fromEntries(Array.from({ length: MAX_CURSORS }, (_, i) => [`v${i}`, { ...cursor, at: 1 }]));

  test('a new one is added and a known one moves', () => {
    const one = placeCursor({}, { id: 'a', ...cursor }, 5);
    expect(one).toEqual({ a: { ...cursor, at: 5 } });
    expect(placeCursor(one, { id: 'a', ...cursor, x: 0.25 }, 6).a).toEqual({ ...cursor, x: 0.25, at: 6 });
  });

  test('leaving takes it away', () => {
    expect(placeCursor({ a: { ...cursor, at: 1 } }, { id: 'a', ...cursor, x: -1, y: -1 }, 2)).toEqual({});
  });

  test('no more than MAX_CURSORS are kept, while those already kept still move', () => {
    expect(MAX_CURSORS).toBeLessThanOrEqual(50);
    expect(placeCursor(full, { id: 'new', ...cursor }, 2)).toBe(full);
    expect(placeCursor(full, { id: 'v3', ...cursor }, 2).v3.at).toBe(2);
  });
});
