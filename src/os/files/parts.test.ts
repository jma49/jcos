import { describe, expect, test } from 'vitest';
import type { FileNode } from './disk';
import { usersFolder } from './home';
import { lockedOn, parentOf } from './parts';

// Which folder on the way to a place this visitor may not open: Finder
// goes to the one above it, with its alert, whether the place was clicked,
// typed, restored with the window or reached by Back.

const empty = { documents: [], diary: [] };
const diskFor = (owner: boolean): FileNode => ({
  path: '/',
  name: 'Macintosh HD',
  kind: 'Folder',
  Icon: () => null,
  children: [usersFolder(empty, owner, [], () => {})]
});

describe('lockedOn', () => {
  test('a locked folder, or a place inside it, is shut to anyone but the owner', () => {
    const disk = diskFor(false);
    expect(lockedOn(disk, '/Users/jincheng/Documents')?.path).toBe('/Users/jincheng/Documents');
    expect(lockedOn(disk, '/Users/jincheng/Documents/Diary 2026.rtf')?.path).toBe('/Users/jincheng/Documents');
    expect(parentOf(lockedOn(disk, '/Users/jincheng/Documents')!.path)).toBe('/Users/jincheng');
  });

  test('open folders, and every folder for the owner, are not', () => {
    expect(lockedOn(diskFor(false), '/Users/jincheng/Public')).toBeNull();
    expect(lockedOn(diskFor(false), '/Users/jincheng')).toBeNull();
    expect(lockedOn(diskFor(false), '/')).toBeNull();
    expect(lockedOn(diskFor(true), '/Users/jincheng/Documents')).toBeNull();
  });
});
