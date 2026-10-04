import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cachedAccent, cachedTopBrightness, remember } from './accent';

// The accent and brightness caches remember the last dozen pictures by a
// short key: a Photo Booth picture is a data URL of several kilobytes,
// which mustn't be stored (and parsed on every lookup) as a key.

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

/** A picture as Photo Booth keeps it: a JPEG data URL of about 11 KB. */
const photo = (seed: string) => `data:image/jpeg;base64,${seed}${'A'.repeat(11_000)}`;

describe('the picture caches', () => {
  test('a data URL is remembered under a short key and found again', () => {
    remember(photo('one'), '#3875d7');
    remember(photo('one'), 0.42, 'os-brightness-cache');
    expect(map.get('os-accent-cache')!.length).toBeLessThan(200);
    expect(map.get('os-brightness-cache')!.length).toBeLessThan(200);
    expect(cachedAccent(photo('one'))).toBe('#3875d7');
    expect(cachedTopBrightness(photo('one'))).toBe(0.42);
  });

  test('two data URLs that differ only at the start are told apart', () => {
    remember(photo('one'), '#3875d7');
    remember(photo('two'), '#cf4a40');
    expect(cachedAccent(photo('one'))).toBe('#3875d7');
    expect(cachedAccent(photo('two'))).toBe('#cf4a40');
  });

  test('an address is its own key', () => {
    remember('/os/wallpapers/photos/a.webp', '#3f9a4c');
    expect(JSON.parse(map.get('os-accent-cache')!)).toEqual({ '/os/wallpapers/photos/a.webp': '#3f9a4c' });
  });

  test('an entry an older version kept under a whole data URL goes at the next one remembered', () => {
    map.set('os-accent-cache', JSON.stringify({ [photo('old')]: '#8656c4', '/a.webp': '#3f9a4c' }));
    remember('/b.webp', '#d9762a');
    expect(JSON.parse(map.get('os-accent-cache')!)).toEqual({ '/a.webp': '#3f9a4c', '/b.webp': '#d9762a' });
  });

  test('only the last dozen pictures are kept', () => {
    for (let i = 0; i < 14; i++) remember(`/${i}.webp`, '#3875d7');
    expect(Object.keys(JSON.parse(map.get('os-accent-cache')!))).toEqual(Array.from({ length: 12 }, (_, i) => `/${i + 2}.webp`));
  });
});
