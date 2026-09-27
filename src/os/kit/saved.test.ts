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

describe('update', () => {
  test('builds on what’s stored now, not on what this tab last read', () => {
    const best = saved<number>('pinball', 'best');
    best.save(3000); // this tab read 3000…
    map.set('os-pinball-best', '5000'); // …then another tab scored 5000
    expect(best.update(0, (stored) => Math.max(stored, 4000))).toBe(5000);
    expect(map.get('os-pinball-best')).toBe('5000');
  });

  test('merges an object’s fields, keeping another tab’s', () => {
    const settings = saved<{ suits: number; best: Record<string, number> }>('spider');
    map.set('os-spider', JSON.stringify({ suits: 1, best: { 4: 900 } }));
    settings.update({ suits: 1, best: {} }, (s) => ({ ...s, best: { ...s.best, 1: 700 } }));
    expect(JSON.parse(map.get('os-spider')!)).toEqual({ suits: 1, best: { 1: 700, 4: 900 } });
  });
});
