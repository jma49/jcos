import { describe, expect, test } from 'vitest';
import type { FileNode } from '../../core/files';
import { resolve, words } from './paths';

// The Terminal's command line: words split as zsh splits them, and paths
// looked up on the disk Finder shows, its locked folders included.

describe('words', () => {
  test('spaces separate words, however many', () => {
    expect(words('  ls   -l  Documents ')).toEqual(['ls', '-l', 'Documents']);
    expect(words('')).toEqual([]);
  });

  test('quotes keep a name with spaces in one word', () => {
    expect(words('cat "Documents/About Me.txt"')).toEqual(['cat', 'Documents/About Me.txt']);
    expect(words("cat 'Documents/About Me.txt'")).toEqual(['cat', 'Documents/About Me.txt']);
    expect(words('cat Documents/"About Me".txt')).toEqual(['cat', 'Documents/About Me.txt']);
  });

  test('a backslash escapes the next character outside quotes', () => {
    expect(words('cat Documents/About\\ Me.txt')).toEqual(['cat', 'Documents/About Me.txt']);
    expect(words('echo \\"hi\\"')).toEqual(['echo', '"hi"']);
  });

  test('inside double quotes a backslash escapes only \\ " $ and `; inside single quotes nothing', () => {
    expect(words('echo "a \\"b\\" \\n"')).toEqual(['echo', 'a "b" \\n']);
    expect(words("echo 'a \\ b'")).toEqual(['echo', 'a \\ b']);
  });

  test('empty quotes are a word; a quote left open runs to the end', () => {
    expect(words('echo "" x')).toEqual(['echo', '', 'x']);
    expect(words('cat "About Me')).toEqual(['cat', 'About Me']);
  });
});

const Icon = () => null;
const node = (path: string, more: Partial<FileNode> = {}): FileNode => ({ path, name: path.split('/').pop() || 'Macintosh HD', kind: 'Folder', Icon, ...more });
const documents = node('/Users/jincheng/Documents', { locked: true, children: [] });
const disk = node('/', {
  children: [
    node('/Documents', { children: [node('/Documents/About Me', { name: 'About Me.txt', kind: 'Text' })] }),
    node('/Users', { children: [node('/Users/jincheng', { name: 'jincheng', children: [documents, node('/Users/jincheng/Public', { children: [] })] })] })
  ]
});

describe('resolve', () => {
  test('finds a node by its name or its path, without regard to case, from the working folder', () => {
    expect(resolve(disk, '/', 'documents/about me.txt')).toEqual({ node: disk.children![0].children![0] });
    expect(resolve(disk, '/Users/jincheng', '../../Documents/About Me')).toMatchObject({ node: { path: '/Documents/About Me' } });
    expect(resolve(disk, '/Documents', '~')).toEqual({ node: disk });
    expect(resolve(disk, '/', 'Nowhere')).toBeNull();
  });

  test('a locked folder can be seen from outside, but not entered or listed', () => {
    expect(resolve(disk, '/', '/Users/jincheng')).toMatchObject({ node: { path: '/Users/jincheng' } });
    expect(resolve(disk, '/', '/Users/jincheng/Documents')).toEqual({ denied: documents });
    expect(resolve(disk, '/Users/jincheng', 'Documents/Diary 2026.rtf')).toEqual({ denied: documents });
    expect(resolve(disk, '/Users/jincheng', 'Public')).toMatchObject({ node: { path: '/Users/jincheng/Public' } });
  });
});
