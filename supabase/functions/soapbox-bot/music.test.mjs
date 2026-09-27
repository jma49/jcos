// Tests for the music commands' pieces (`npm test`): reading a video id
// out of a link, guessing a song from a video's title, and choosing Apple
// Music's match. The commands themselves are walked in bot.test.mjs.

import { describe, expect, test } from 'vitest';
import { coverOf, guessFromVideo, parseAdd, pickTrack, videoIdOf } from './music.ts';

describe('videoIdOf', () => {
  test.each([
    ['https://www.youtube.com/watch?v=OxtZF0WGXtE', 'OxtZF0WGXtE'],
    ['https://youtube.com/watch?v=OxtZF0WGXtE&list=RD&t=30s', 'OxtZF0WGXtE'],
    ['https://youtu.be/OxtZF0WGXtE?si=abc', 'OxtZF0WGXtE'],
    ['https://m.youtube.com/watch?v=OxtZF0WGXtE', 'OxtZF0WGXtE'],
    ['https://music.youtube.com/watch?v=OxtZF0WGXtE', 'OxtZF0WGXtE'],
    ['https://www.youtube.com/shorts/OxtZF0WGXtE', 'OxtZF0WGXtE'],
    ['https://www.youtube-nocookie.com/embed/OxtZF0WGXtE', 'OxtZF0WGXtE'],
    ['OxtZF0WGXtE', 'OxtZF0WGXtE']
  ])('%s', (link, id) => expect(videoIdOf(link)).toBe(id));

  test.each([
    ['https://evil.example.com/watch?v=OxtZF0WGXtE', 'another site'],
    ['https://youtube.com.evil.example/watch?v=OxtZF0WGXtE', 'a look-alike host'],
    ['https://www.youtube.com/watch?v=short', 'a malformed id'],
    ['https://www.youtube.com/watch?v=OxtZF0WGXtE%22%3E', 'an id with more on it'],
    ['http://169.254.169.254/latest/meta-data', 'an internal address'],
    ['not a link', 'words']
  ])('refuses %s (%s)', (link) => expect(videoIdOf(link)).toBeNull());
});

describe('guessFromVideo', () => {
  test('a Topic channel names the artist; the title is the song', () => {
    expect(guessFromVideo('寧夏', '梁靜茹 - Topic')).toEqual({ title: '寧夏', artist: '梁靜茹' });
  });

  test('"Artist - Song (Official Video)"', () => {
    expect(guessFromVideo('Frank Ocean - White Ferrari (Official Video)', 'Frank Ocean')).toEqual({ title: 'White Ferrari', artist: 'Frank Ocean' });
  });

  test('"Artist【Song】Official MV"', () => {
    expect(guessFromVideo('梁靜茹 Fish Leong【寧夏】Official MV', 'Rock Records')).toEqual({ title: '寧夏', artist: '梁靜茹 Fish Leong' });
  });

  test('otherwise the title, by the channel', () => {
    expect(guessFromVideo('energy flow [HD]', 'Ryuichi Sakamoto')).toEqual({ title: 'energy flow', artist: 'Ryuichi Sakamoto' });
  });

  test('keeps within the database’s 200 characters', () => {
    expect(guessFromVideo('x'.repeat(500), 'y').title).toHaveLength(200);
  });
});

describe('pickTrack', () => {
  const results = [
    { trackName: '寧夏 (Live)', artistName: '某翻唱', collectionName: 'Covers' },
    { trackName: '寧夏', artistName: '梁靜茹', collectionName: '燕尾蝶', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.jpg' }
  ];

  test('takes the same song by the same artist, not the first hit', () => {
    expect(pickTrack(results, '寧夏', '梁靜茹 Fish Leong')?.collectionName).toBe('燕尾蝶');
  });

  test('nothing when no result is the song', () => {
    expect(pickTrack(results, '勇氣', '梁靜茹')).toBeNull();
  });
});

describe('coverOf', () => {
  test('asks Apple for 600 × 600', () => {
    expect(coverOf({ artworkUrl100: 'https://is3-ssl.mzstatic.com/image/thumb/a/b.jpg/100x100bb.jpg' })).toBe(
      'https://is3-ssl.mzstatic.com/image/thumb/a/b.jpg/600x600bb.jpg'
    );
  });

  test('refuses artwork from anywhere the library doesn’t accept', () => {
    expect(coverOf({ artworkUrl100: 'https://evil.example.com/100x100bb.jpg' })).toBeNull();
    expect(coverOf({})).toBeNull();
  });
});

describe('parseAdd', () => {
  test('a link alone', () => expect(parseAdd('https://youtu.be/OxtZF0WGXtE')).toEqual({ id: 'OxtZF0WGXtE' }));
  test('a link with what to look for', () =>
    expect(parseAdd('https://youtu.be/OxtZF0WGXtE  寧夏 - 梁靜茹')).toEqual({ id: 'OxtZF0WGXtE', hint: { title: '寧夏', artist: '梁靜茹' } }));
});
