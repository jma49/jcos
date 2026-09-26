import { describe, expect, test } from 'vitest';
import { CALM, CROWD, isCrowded } from './Presence';

// When pointers stop because too many people are here, and when they come
// back: later than they went, so a count at the limit doesn't flicker.

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
