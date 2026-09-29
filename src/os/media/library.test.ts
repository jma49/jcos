import { afterEach, describe, expect, test, vi } from 'vitest';

// Loading the library: from /api/songs, else the snapshot; and when both
// fail, the next call tries again rather than failing for the whole visit.

/** One song the database has that the edge-cached library doesn't yet. */
const database = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock('../social/social', () => ({
  getSocial: async () => ({
    song: async (id: string) => {
      database.asked.push(id);
      await new Promise((done) => setTimeout(done, 5));
      return id === 'JUSTADDED00' ? { id, title: 'Just added', artist: 'x' } : null;
    }
  })
}));

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

describe('findSong', () => {
  const fromApi = () => api(async () => Response.json({ albums: [], songs: [{ id: 'FROMTHEAPI0', title: 'From the API', artist: 'x' }] }));

  test('fetches a song added after the library was read, and appends it', async () => {
    fromApi();
    database.asked = [];
    const library = await import('./library');
    expect(await library.findSong('FROMTHEAPI0')).toBe(0);
    expect(await library.findSong('JUSTADDED00')).toBe(1);
    expect(library.SONGS.map((s) => s.id)).toEqual(['FROMTHEAPI0', 'JUSTADDED00']);
    expect(database.asked).toEqual(['JUSTADDED00']);
  });

  test('asked twice at once, it adds the song once', async () => {
    fromApi();
    const library = await import('./library');
    const [a, b] = await Promise.all([library.findSong('JUSTADDED00'), library.findSong('JUSTADDED00')]);
    expect([a, b]).toEqual([1, 1]);
    expect(library.SONGS).toHaveLength(2);
  });

  test('a song nobody has, or something that isn’t an id, is -1', async () => {
    fromApi();
    database.asked = [];
    const library = await import('./library');
    expect(await library.findSong('NOSUCHSONG0')).toBe(-1);
    expect(await library.findSong('../../etc')).toBe(-1);
    expect(database.asked).toEqual(['NOSUCHSONG0']);
  });
});

describe('refreshLibrary', () => {
  const A = { id: 'AAAAAAAAAAA', title: 'A', artist: 'x' };
  const B = { id: 'BBBBBBBBBBB', title: 'B', artist: 'x' };
  const NEW = { id: 'NEWNEWNEW00', title: 'New', artist: 'x' };

  /** A library loaded at `now`, with /api/songs then answering `next` (counting the asks). */
  async function loaded(next: unknown[] | Error) {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const asks = { count: 0 };
    let answer: unknown = { albums: [], songs: [A, B] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        asks.count++;
        if (answer instanceof Error) throw answer;
        return Response.json(answer);
      })
    );
    const library = await import('./library');
    const refresh = await import('./refresh');
    await library.loadLibrary();
    answer = next instanceof Error ? next : { albums: [], songs: next };
    asks.count = 0;
    return { library, refresh, asks, later: (ms: number) => (now += ms) };
  }

  afterEach(() => vi.restoreAllMocks());

  test('asks again only once the library is a minute old', async () => {
    const { library, refresh, asks, later } = await loaded([A, B, NEW]);
    await refresh.refreshLibrary();
    expect(asks.count).toBe(0);
    later(refresh.REFRESH_AFTER_MS);
    await refresh.refreshLibrary();
    expect(asks.count).toBe(1);
  });

  test('appends new songs and updates changed ones in place; a removed one stays for the visit', async () => {
    const { library, refresh, later } = await loaded([{ ...B, title: 'B (fixed)' }, NEW]);
    const titles = library.fromLibrary(() => library.SONGS.map((s) => s.title));
    expect(titles()).toEqual(['A', 'B']);
    later(refresh.REFRESH_AFTER_MS);
    await refresh.refreshLibrary();
    // Every song keeps its place: indexes are the visit's handles.
    expect(library.SONGS.map((s) => s.id)).toEqual([A.id, B.id, NEW.id]);
    expect(library.SONGS[1].title).toBe('B (fixed)');
    // What was worked out from the library is worked out again.
    expect(titles()).toEqual(['A', 'B (fixed)', 'New']);
  });

  test('asked twice at once, it reads once', async () => {
    const { library, refresh, asks, later } = await loaded([A, B, NEW]);
    later(refresh.REFRESH_AFTER_MS);
    await Promise.all([refresh.refreshLibrary(), refresh.refreshLibrary()]);
    expect(asks.count).toBe(1);
    expect(library.SONGS).toHaveLength(3);
  });

  test('a failed read leaves the library as it was', async () => {
    const { library, refresh, later } = await loaded(new TypeError('Failed to fetch'));
    later(refresh.REFRESH_AFTER_MS);
    await refresh.refreshLibrary();
    expect(library.SONGS.map((s) => s.id)).toEqual([A.id, B.id]);
  });
});
