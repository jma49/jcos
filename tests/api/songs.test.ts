import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GET } from '../../api/songs';
import snapshot from '../../src/data/songs.json' with { type: 'json' };

// The library relay, under a fake Supabase: what it serves, how long the
// edge keeps it, and that the snapshot stands in whenever Supabase can't
// be read, so the iPod is never empty.

const SONG = {
  id: 'dQw4w9WgXcQ',
  title: 'A Song',
  artist: 'Someone',
  album: null,
  cover: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  track: null,
  instrumental: false,
  lyrics_offset: -850,
  lyrics_id: null
};
const ALBUM = { title: 'An Album', artist: 'Someone', year: 1998, cover: 'https://is1-ssl.mzstatic.com/a.jpg', note: null };

function fakeSupabase(answer: (path: string) => Response) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('apikey')).toBe('public-key');
    return answer(new URL(url).pathname);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', 'public-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('from Supabase', () => {
  test('serves the library as the site uses it, cached at the edge', async () => {
    fakeSupabase((path) => Response.json(path.endsWith('/songs') ? [SONG] : [ALBUM]));
    const res = await GET();
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=86400');
    expect(res.headers.get('x-library')).toBeNull();
    expect(await res.json()).toEqual({
      albums: [{ title: 'An Album', artist: 'Someone', year: 1998, cover: 'https://is1-ssl.mzstatic.com/a.jpg' }],
      songs: [{ id: 'dQw4w9WgXcQ', title: 'A Song', artist: 'Someone', cover: SONG.cover, offset: -850 }]
    });
  });

  test('reads with the public key and asks for songs in the order they were added', async () => {
    const fetch = fakeSupabase((path) => Response.json(path.endsWith('/songs') ? [SONG] : []));
    await GET();
    const songs = fetch.mock.calls.map(([url]) => new URL(url)).find((u) => u.pathname.endsWith('/songs'))!;
    expect(songs.searchParams.get('order')).toBe('added_at.asc,id.asc');
  });
});

describe('the snapshot stands in', () => {
  const servesSnapshot = async () => {
    const res = await GET();
    expect(res.headers.get('x-library')).toBe('snapshot');
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60');
    expect(await res.json()).toEqual(snapshot);
  };

  test('when Supabase fails', async () => {
    fakeSupabase(() => new Response('paused', { status: 503 }));
    await servesSnapshot();
  });

  test('when the tables aren’t there yet', async () => {
    fakeSupabase(() => Response.json({ code: 'PGRST205' }, { status: 404 }));
    await servesSnapshot();
  });

  test('when Supabase answers with something other than a list', async () => {
    fakeSupabase(() => Response.json({ songs: [] }));
    await servesSnapshot();
  });

  test('when the library is empty', async () => {
    fakeSupabase(() => Response.json([]));
    await servesSnapshot();
  });

  test('when Supabase isn’t configured', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const fetch = fakeSupabase(() => Response.json([]));
    await servesSnapshot();
    expect(fetch).not.toHaveBeenCalled();
  });
});
