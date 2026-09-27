import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { saved } from './saved';

// What applets remember lives under the keys they have always used, so
// moving an applet onto the kit loses nobody's best score or settings.

let map: Map<string, string>;

beforeEach(() => {
  map = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key)
    }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('saved', () => {
  test('keeps the keys applets already used', () => {
    saved<number>('pinball', 'best').save(9);
    saved('minesweeper', 'best').save({ beginner: 12 });
    saved('spider').save({ suits: 2, best: {} });
    saved('synth').save({ octave: 4 });
    expect([...map.keys()].sort()).toEqual(['os-minesweeper-best', 'os-pinball-best', 'os-spider', 'os-synth']);
  });

  test('reads back what was saved, or the fallback', () => {
    const best = saved<number>('pinball', 'best');
    expect(best.load(0)).toBe(0);
    best.save(1200);
    expect(best.load(0)).toBe(1200);
  });

  test('merges stored settings over their defaults, so new settings get theirs', () => {
    map.set('os-spider', JSON.stringify({ suits: 4 }));
    expect(saved('spider').load({ suits: 1, best: {} })).toEqual({ suits: 4, best: {} });
  });

  test('falls back on anything unreadable', () => {
    map.set('os-pinball-best', '{not json');
    expect(saved<number>('pinball', 'best').load(0)).toBe(0);
    map.set('os-spider', '[1,2]');
    expect(saved('spider').load({ suits: 1 })).toEqual({ suits: 1 });
  });
});
