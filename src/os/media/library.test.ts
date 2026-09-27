import { afterEach, describe, expect, test, vi } from 'vitest';

// Loading the library: from /api/songs, else the snapshot; and when both
// fail, the next call tries again rather than failing for the whole visit.

const SNAPSHOT = { default: { albums: [], songs: [{ id: 'SNAPSHOT000', title: 'From the snapshot', artist: 'x' }] } };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../../data/songs.json');
  vi.resetModules();
});

const api = (answer: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(answer));

describe('loadLibrary', () => {
  test('reads /api/songs', async () => {
    vi.doMock('../../data/songs.json', () => SNAPSHOT);
    api(async () => Response.json({ albums: [], songs: [{ id: 'FROMTHEAPI0', title: 'From the API', artist: 'x' }] }));
    const library = await import('./library');
    await library.loadLibrary();
    expect(library.SONGS.map((s) => s.id)).toEqual(['FROMTHEAPI0']);
  });

  test('falls back to the snapshot', async () => {
    vi.doMock('../../data/songs.json', () => SNAPSHOT);
    api(async () => new Response('Not found', { status: 404 }));
    const library = await import('./library');
    await library.loadLibrary();
    expect(library.SONGS.map((s) => s.id)).toEqual(['SNAPSHOT000']);
  });

  test('tries again after both failed', async () => {
    api(async () => Promise.reject(new TypeError('Failed to fetch')));
    vi.doMock('../../data/songs.json', () => {
      throw new TypeError('Failed to fetch dynamically imported module: songs.js');
    });
    const library = await import('./library');
    await expect(library.loadLibrary()).rejects.toThrow();
    expect(library.libraryLoaded()).toBe(false);

    // The network is back.
    api(async () => Response.json({ albums: [], songs: [{ id: 'FROMTHEAPI0', title: 'From the API', artist: 'x' }] }));
    await library.loadLibrary();
    expect(library.SONGS.map((s) => s.id)).toEqual(['FROMTHEAPI0']);
  });
});
