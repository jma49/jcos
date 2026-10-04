import { describe, expect, test } from 'vitest';
import { apps } from '../../core/registry';
import { APPLETS } from '../../core/applets';
import type { FileNode } from '../../files/disk';
import type { AppId } from '../../core/types';
import { backupDays, cameBy, dayName, dayOf, diskOn, folderCame, namedTicks, notBefore, tickName } from './past';

// Time Machine's past (past.ts): the days it has, what a day's disk held,
// and how the days are named.

const Icon = () => null;
const node = (path: string, more: Partial<FileNode> = {}): FileNode => ({ path, name: path.split('/').pop() || 'Macintosh HD', kind: 'Folder', Icon, ...more });

/** A disk with a little of everything, as buildDisk makes it. */
const disk = node('/', {
  children: [
    node('/Applications', { children: [node('/Applications/Chess', { app: 'chess' }), node('/Applications/Photos', { app: 'photos' })] }),
    node('/Applets', { children: [node('/Applets/Pinball', { app: 'pinball' })] }),
    node('/Documents', { children: [node('/Documents/About Me', { app: 'about' })] }),
    node('/Movies', { children: [node('/Movies/disc')] }),
    node('/Music', {
      children: [
        node(`/Music/${encodeURIComponent('BTTB / 20th')}`, {
          children: [node(`/Music/${encodeURIComponent('BTTB / 20th')}/old-song-id`), node(`/Music/${encodeURIComponent('BTTB / 20th')}/new-song-id`)]
        }),
        node('/Music/single-id')
      ]
    }),
    node('/Pictures', { children: [node('/Pictures/one')] }),
    node('/Projects', { children: [node('/Projects/jmos')] }),
    node('/Users', { children: [node('/Users/jincheng')] })
  ]
});

const came: Record<string, string> = {
  chess: '2026-09-29',
  photos: '2026-09-25',
  pinball: '2026-09-27',
  about: '2026-09-24',
  appstore: '2026-09-25',
  dvdplayer: '2026-09-29',
  textedit: '2026-09-29'
};
const arrivals = {
  app: (id: AppId) => came[id],
  song: (id: string) => ({ 'old-song-id': '2026-09-27T05:13:00Z', 'new-song-id': '2026-09-29T20:00:00Z' })[id],
  album: (title: string) => (title === 'BTTB / 20th' ? '2026-09-27T05:13:00Z' : undefined)
};
const names = (folder: FileNode | undefined) => folder?.children?.map((n) => n.path.split('/').pop());
const folder = (d: FileNode, path: string) => d.children?.find((n) => n.path === path);

describe('days', () => {
  test('a moment is the day it was where this device is; a day is itself', () => {
    const noon = new Date(2026, 8, 26, 12).toISOString();
    expect(dayOf(noon)).toBe('2026-09-26');
    expect(dayOf('2026-09-24')).toBe('2026-09-24');
    expect(dayOf('someday')).toBe('');
    expect(dayOf(undefined)).toBe('');
  });

  test('backups are today and each earlier day something came, newest first, once each', () => {
    const at = (d: number, h = 12) => new Date(2026, 8, d, h).toISOString();
    expect(backupDays([at(24), '2026-09-25', at(25, 23), undefined, 'nonsense', at(30), '2026-09-29'], '2026-09-29')).toEqual([
      '2026-09-29',
      '2026-09-25',
      '2026-09-24'
    ]);
    expect(backupDays([], '2026-09-29')).toEqual(['2026-09-29']);
  });

  test('a thing is there from its day on; one without a date always was', () => {
    expect(cameBy('2026-09-26')('2026-09-26')).toBe(true);
    expect(cameBy('2026-09-26')('2026-09-27')).toBe(false);
    expect(cameBy('2026-09-26')(undefined)).toBe(true);
  });

  test('what lives in a folder counts from the day the folder came at the earliest', () => {
    // A document written (or restored) before /Users existed shows first on the day /Users came.
    const users = folderCame('/Users', arrivals);
    expect(users).toBe('2026-09-29');
    const inUsers = notBefore(users);
    const written = [new Date(2026, 8, 20, 12).toISOString(), '2026-09-18', '2026-09-30', undefined];
    expect(written.map(inUsers)).toEqual(['2026-09-29', '2026-09-29', '2026-09-30', undefined]);
    expect(backupDays(written.map(inUsers), '2026-10-01')).toEqual(['2026-10-01', '2026-09-30', '2026-09-29']);
    expect(folderCame('/Movies', arrivals)).toBe('2026-09-29');
    expect(folderCame('/Music', arrivals)).toBeUndefined();
    expect(notBefore(undefined)('2026-09-18')).toBe('2026-09-18');
  });
});

describe('a day’s disk', () => {
  test('keeps what had come by then, and leaves out Pictures and Projects', () => {
    const then = diskOn(disk, '2026-09-27', arrivals);
    // Movies and Users came with DVD Player and TextEdit, on the 29th.
    expect(names(then)).toEqual(['Applications', 'Applets', 'Documents', 'Music']);
    expect(names(folder(then, '/Applications'))).toEqual(['Photos']);
    expect(names(folder(then, '/Applets'))).toEqual(['Pinball']);
    expect(names(folder(then, '/Documents'))).toEqual(['About Me']);
    const music = folder(then, '/Music');
    expect(music?.children).toHaveLength(2);
    expect(names(music?.children?.[0])).toEqual(['old-song-id']);
  });

  test('an album or a song not yet added isn’t there, and nothing was on the first day', () => {
    const first = diskOn(disk, '2026-09-24', arrivals);
    expect(names(folder(first, '/Applications'))).toEqual([]);
    // The Applets folder came with the Applet Store, the next day.
    expect(folder(first, '/Applets')).toBeUndefined();
    // The single has no date (the repository's snapshot): it's always there.
    expect(names(folder(first, '/Music'))).toEqual(['single-id']);
    expect(names(folder(first, '/Documents'))).toEqual(['About Me']);
  });

  test('today’s is everything but Pictures and Projects', () => {
    const now = diskOn(disk, '2026-09-29', arrivals);
    expect(names(now)).toEqual(['Applications', 'Applets', 'Documents', 'Movies', 'Music', 'Users']);
    expect(names(folder(now, '/Applications'))).toEqual(['Chess', 'Photos']);
    expect(names(folder(now, '/Music')?.children?.[0])).toEqual(['old-song-id', 'new-song-id']);
  });
});

describe('names', () => {
  test('under the front window', () => {
    expect(dayName('2026-09-29', '2026-09-29')).toBe('Today (Now)');
    expect(dayName('2026-09-28', '2026-09-29')).toBe('Yesterday');
    expect(dayName('2026-09-26', '2026-09-29')).toBe('Saturday, September 26, 2026');
    expect(dayName('2026-12-31', '2027-01-01')).toBe('Yesterday');
  });

  test('on the timeline', () => {
    expect(tickName('2026-09-26', '2026-09-29')).toBe('Sep 26');
    expect(tickName('2025-12-24', '2026-09-29')).toBe('Dec 24, 2025');
    expect(tickName('2026-09-28', '2026-09-29')).toBe('Yesterday');
  });

  test('with too many days to name them all, months and years, and the days that matter', () => {
    const days = ['2026-10-02', '2026-10-01', '2026-09-30', '2026-09-26', '2026-09-25', '2025-12-24'];
    expect([...namedTicks(days, '2026-10-02', '2026-09-26', 10).values()]).toHaveLength(6);
    const named = namedTicks(days, '2026-10-02', '2026-09-26', 3);
    expect(Object.fromEntries(named)).toEqual({
      '2025-12-24': '2025',
      '2026-09-25': '2026',
      '2026-10-01': 'Yesterday',
      '2026-10-02': 'Today (Now)',
      '2026-09-26': 'Sep 26'
    });
  });
});

test('every app knows the day it came, so Time Machine can place it', () => {
  const undated = (Object.keys(apps) as AppId[]).filter((id) => {
    const listing = APPLETS.find((a) => a.app === id);
    return !/^\d{4}-\d{2}-\d{2}$/.test(listing?.added ?? apps[id].added ?? '');
  });
  expect(undated).toEqual([]);
});
