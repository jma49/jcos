import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Listening along: "Listen along" plays Jincheng's song on the iPod from
// where he is in it, as the database tells it, and says so when the song
// has finished instead.

const launch = vi.fn();
vi.mock('../core/registry', () => ({ launch: (...args: unknown[]) => launch(...args) }));
/** The library arrives when the test lets it. */
const gate = vi.hoisted(() => ({ wait: Promise.resolve() }));
/** The social backend's side of listening along, driven by the test. */
const social = vi.hoisted(() => ({
  now: null as null | { songId: string; elapsedMs: number; remainingMs: number },
  watcher: (_now: unknown) => {}
}));
vi.mock('../social/social', () => ({
  getSocial: async () => ({
    nowPlaying: async () => social.now,
    watchNowPlaying: (onChange: (now: unknown) => void) => {
      social.watcher = onChange;
      return () => {};
    }
  })
}));
vi.mock('./library', () => ({
  loadLibrary: () => gate.wait,
  SONGS: [
    { id: 'AAAAAAAAAAA', title: 'First', artist: 'A' },
    { id: 'OxtZF0WGXtE', title: '寧夏', artist: '梁靜茹' }
  ]
}));

let together: typeof import('./together');
let music: typeof import('./music');
let notices: typeof import('../core/notices');

beforeAll(async () => {
  Object.assign(globalThis, {
    window: { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }), setTimeout, clearTimeout }
  });
  // One after another, so every module binds the mocks (see pitfalls.md).
  notices = await import('../core/notices');
  music = await import('./music');
  together = await import('./together');
});

beforeEach(() => {
  launch.mockReset();
  notices.useNotices.setState({ notices: [] });
  music.useMusic.setState({ index: 0, queue: [], owner: null, playing: false, resume: null });
});

describe('listenAlong', () => {
  test('plays the song on the iPod from where Jincheng is', async () => {
    await together.listenAlong({ nowPlaying: async () => ({ songId: 'OxtZF0WGXtE', elapsedMs: 83_500, remainingMs: 160_000 }) });
    const s = music.useMusic.getState();
    expect([s.index, s.owner, s.playing]).toEqual([1, 'ipod', true]);
    expect(s.resume).toEqual({ index: 1, time: 83.5 });
    expect(launch).toHaveBeenCalledWith('ipod');
  });

  test('says so when the song has finished, and plays nothing', async () => {
    await together.listenAlong({ nowPlaying: async () => null });
    expect(music.useMusic.getState().playing).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(notices.useNotices.getState().notices.map((n) => n.title)).toEqual(['That song has finished']);
  });

  test('a song taken out of the library since isn’t played', async () => {
    await together.listenAlong({ nowPlaying: async () => ({ songId: 'ZZZZZZZZZZZ', elapsedMs: 1, remainingMs: 1 }) });
    expect(launch).not.toHaveBeenCalled();
  });

  test('a database that can’t be reached is a song that has finished', async () => {
    await together.listenAlong({ nowPlaying: async () => Promise.reject(new Error('paused')) });
    expect(launch).not.toHaveBeenCalled();
  });
});

describe('the notification', () => {
  const settle = () => new Promise((done) => setTimeout(done, 0));
  const shown = () => notices.useNotices.getState().notices.map((n) => n.title);

  test('a stop that arrives while a play waits for the library wins', async () => {
    let arrive = () => {};
    gate.wait = new Promise<void>((done) => (arrive = done));
    const stopWatching = together.startListeningAlong();
    await settle();
    social.watcher({ songId: 'OxtZF0WGXtE', remainingMs: 200_000 });
    social.watcher(null);
    arrive();
    await settle();
    expect(shown()).toEqual([]);
    stopWatching();
    gate.wait = Promise.resolve();
  });

  test('the latest play is the one shown', async () => {
    const stopWatching = together.startListeningAlong();
    await settle();
    social.watcher({ songId: 'AAAAAAAAAAA', remainingMs: 200_000 });
    social.watcher({ songId: 'OxtZF0WGXtE', remainingMs: 200_000 });
    await settle();
    expect(notices.useNotices.getState().notices.map((n) => n.body)).toEqual(['寧夏 — 梁靜茹']);
    stopWatching();
  });
});
