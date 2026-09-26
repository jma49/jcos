import { describe, expect, test } from 'vitest';
import { lineAt, parseLrc, pick, toCandidate } from './lyrics';

// Reading LRC files and choosing between lrclib's entries: crowd-sourced
// lyrics come in several edits of a song, and some are placeholders.

const lrc = (n: number, start = 0) =>
  Array.from({ length: n }, (_, i) => `[00:${String(start + i * 2).padStart(2, '0')}.00] line ${i + 1}`).join('\n');

describe('parseLrc', () => {
  test('reads minutes, seconds and hundredths, sorted by time', () => {
    expect(parseLrc('[01:02.50] later\n[00:03.25] first')).toEqual([
      { time: 3.25, text: 'first' },
      { time: 62.5, text: 'later' }
    ]);
  });

  test('a line with several stamps is sung each time', () => {
    expect(parseLrc('[00:10.00][00:40.00] chorus').map((l) => l.time)).toEqual([10, 40]);
  });

  test('skips tags and blank lines, keeps instrumental breaks', () => {
    expect(parseLrc('[ar:Someone]\n\n[00:05.00]\n[00:07.00] words\r\n')).toEqual([
      { time: 5, text: '' },
      { time: 7, text: 'words' }
    ]);
  });
});

describe('toCandidate', () => {
  test('an entry without synced lyrics, or with a handful of lines, is not lyrics', () => {
    expect(toCandidate({ id: 1, duration: 200, syncedLyrics: null })).toBeNull();
    expect(toCandidate({ id: 1, duration: 200, syncedLyrics: lrc(5) })).toBeNull();
    expect(toCandidate({ id: 1, duration: 200, syncedLyrics: lrc(6) })?.lines).toHaveLength(6);
  });
});

describe('pick', () => {
  const radio = { duration: 180, lines: parseLrc(lrc(6)) };
  const album = { duration: 245, lines: parseLrc(lrc(6, 10)) };

  test('prefers the entry closest in length to the video', () => {
    expect(pick([radio, album], 243)).toBe(album.lines);
    expect(pick([album, radio], 181)).toBe(radio.lines);
  });

  test('before the video length is known, takes the first', () => {
    expect(pick([radio, album], 0)).toBe(radio.lines);
  });

  test('nothing to pick from', () => {
    expect(pick([], 200)).toBeNull();
  });
});

describe('lineAt', () => {
  const lines = parseLrc('[00:01.00] a\n[00:05.00] b\n[00:09.00] c');

  test('the line being sung, including exactly on its stamp', () => {
    expect(lineAt(lines, 0.5)).toBe(-1);
    expect(lineAt(lines, 1)).toBe(0);
    expect(lineAt(lines, 8.99)).toBe(1);
    expect(lineAt(lines, 600)).toBe(2);
  });

  test('no lines', () => {
    expect(lineAt([], 10)).toBe(-1);
  });
});
