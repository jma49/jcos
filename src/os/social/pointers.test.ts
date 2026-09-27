import { describe, expect, test } from 'vitest';
import { anyoneWatching, CALM, CROWD, isCrowded } from './Presence';
import { cleanInfo } from './types';

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
