// The bot's home folder commands (home.ts): which day an entry is on, and
// what a document from Telegram is called.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { dayIn, dayName, freeName, nameFrom } from './home.ts';

test('a diary day is the day where Jincheng is', () => {
  const at = new Date('2026-09-30T06:30:00Z');
  assert.equal(dayIn('America/Los_Angeles', at), '2026-09-29');
  assert.equal(dayIn('Asia/Tokyo', at), '2026-09-30');
  // A place the device can't place counts as UTC.
  assert.equal(dayIn('Not/AZone', at), '2026-09-30');
  assert.equal(dayName('2026-09-29'), 'Tuesday, September 29');
});

test('a document is named after its first line, as a name may be', () => {
  assert.equal(nameFrom('Packing list\n- tent'), 'Packing list.txt');
  assert.equal(nameFrom('  a/b: c\tlater  '), 'a-b- c later.txt');
  assert.equal(nameFrom('...hidden'), 'hidden.txt');
  assert.equal(nameFrom('notes.TXT\nmore'), 'notes.txt');
  assert.equal(nameFrom('\n\nsecond line'), 'Untitled.txt');
  assert.equal(nameFrom('bell\u0007 and tab\u0009'), 'bell and tab.txt');
});

test('a long first line is cut at a word, and never through an emoji', () => {
  const long = nameFrom(`${'word '.repeat(20)}end`);
  assert.ok(long.length <= 64, long);
  assert.match(long, /^word( word)*\.txt$/);
  const emoji = nameFrom('😀'.repeat(70));
  assert.equal(Array.from(emoji.replace(/\.txt$/, '')).length, 60);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(emoji), 'no half of a surrogate pair');
});

test('a name already in Documents takes the next number, whatever the case', () => {
  assert.equal(freeName('Notes.txt', []), 'Notes.txt');
  assert.equal(freeName('Notes.txt', ['notes.txt', 'NOTES 2.txt']), 'Notes 3.txt');
});
