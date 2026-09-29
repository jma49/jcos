import { describe, expect, test } from 'vitest';
import { addressToUrl, back, forward, hostOf, pastYears, start, visit, waybackUrl } from './navigation';

describe('addressToUrl', () => {
  test('adds https to a bare address', () => {
    expect(addressToUrl('apple.com')).toBe('https://apple.com/');
    expect(addressToUrl('  en.wikipedia.org/wiki/Aqua ')).toBe('https://en.wikipedia.org/wiki/Aqua');
    expect(addressToUrl('http://example.com')).toBe('http://example.com/');
  });
  test('refuses what isn’t a web address', () => {
    for (const typed of ['', 'hello world', 'javascript:alert(1)', 'file:///etc/hosts', 'localhost', 'data:text/html,hi']) {
      expect(addressToUrl(typed), typed).toBeNull();
    }
  });
});

describe('history', () => {
  const a = { url: 'https://a.com/', year: null };
  const b = { url: 'https://b.com/', year: 2001 };
  const c = { url: 'https://c.com/', year: null };
  test('back and forward step through visits, and stop at the ends', () => {
    const h = visit(visit(start(a), b), c);
    expect(back(back(back(h))).visits[back(back(back(h))).at]).toEqual(a);
    expect(forward(h)).toBe(h);
  });
  test('a new visit after going back drops what was ahead', () => {
    const h = visit(back(visit(start(a), b)), c);
    expect(h.visits).toEqual([a, c]);
    expect(forward(h)).toBe(h);
  });
  test('visiting where you are adds nothing; another year of it does', () => {
    const h = start(a);
    expect(visit(h, { ...a })).toBe(h);
    expect(visit(h, { ...a, year: 1999 }).visits).toHaveLength(2);
  });
});

test('pastYears runs from last year back to 1996', () => {
  const years = pastYears(new Date('2026-09-28'));
  expect(years[0]).toBe(2025);
  expect(years.at(-1)).toBe(1996);
});

test('waybackUrl asks for mid-year in the archive’s framed mode', () => {
  expect(waybackUrl('https://www.apple.com/', 2001)).toBe('https://web.archive.org/web/20010701if_/https://www.apple.com/');
});

test('hostOf drops www', () => {
  expect(hostOf('https://www.apple.com/mac')).toBe('apple.com');
  expect(hostOf('not a url')).toBe('not a url');
});
