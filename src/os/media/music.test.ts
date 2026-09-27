import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// ⏭ and ⏮ before anything has played: the queue is empty until then (the
// library loads on demand), and stepping along an empty queue once gave
// an index of undefined, which blanked the desktop.

const library = vi.hoisted(() => ({ SONGS: [] as { id: string; title: string; artist: string }[] }));
vi.mock('./library', () => library);

let music: typeof import('./music');

beforeAll(async () => {
  Object.assign(globalThis, { window: { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) } });
  music = await import('./music');
});

beforeEach(() => {
  library.SONGS = ['a', 'b', 'c'].map((id) => ({ id: id.repeat(11), title: id, artist: 'x' }));
  music.useMusic.setState({ index: 0, queue: [], owner: null, playing: false, resume: null, shuffle: false, repeat: 'all' });
});

describe('before anything has played', () => {
  test('⏭ steps through the whole library', () => {
    music.useMusic.getState().next('ipod');
    const s = music.useMusic.getState();
    expect([s.index, s.queue]).toEqual([1, [0, 1, 2]]);
  });

  test('⏮ wraps round to the last song', () => {
    music.useMusic.getState().previous('karaoke');
    expect(music.useMusic.getState().index).toBe(2);
  });

  test('with shuffle on, it picks another song', () => {
    music.useMusic.setState({ shuffle: true });
    music.useMusic.getState().next('ipod');
    expect([1, 2]).toContain(music.useMusic.getState().index);
  });

  test('without a library, nothing happens', () => {
    library.SONGS = [];
    music.useMusic.getState().next('ipod');
    music.useMusic.getState().previous('ipod');
    const s = music.useMusic.getState();
    expect([s.index, s.owner]).toEqual([0, null]);
  });
});
