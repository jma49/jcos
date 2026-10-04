import { afterEach, describe, expect, test, vi } from 'vitest';
import { GET } from '../../api/lyrics';

// The NetEase lyrics relay, under a fake NetEase: what it refuses, which
// search result it trusts, and what it takes out of the lyrics. It once
// returned another song's lyrics because it took the search's first hit.

type Song = { id: number; name: string; duration: number; artists: { name: string }[] };

const LYRICS = '[00:00.00] 作词 : 某人\n[00:00.50] 作曲 : 某人\n[00:12.00] 让我们红尘作伴\n[00:16.00] 活得潇潇洒洒';

/** Answers NetEase's search with `songs`, and its lyric endpoint with `lyrics[id]`. */
function fakeNetEase(songs: Song[], lyrics: Record<number, string> = {}) {
  const fetch = vi.fn(async (url: string) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/api/search/get') return Response.json({ result: { songs } });
    if (pathname === '/api/song/lyric') return Response.json({ lrc: { lyric: lyrics[Number(searchParams.get('id'))] } });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const ask = (query: Record<string, string>) => GET(new Request(`https://www.majincheng.com/api/lyrics?${new URLSearchParams(query)}`));

afterEach(() => vi.unstubAllGlobals());

describe('what it refuses', () => {
  test.each([
    [{}, 'no title'],
    [{ title: 'x'.repeat(201) }, 'a title longer than any song'],
    [{ title: '寧夏', artist: 'x'.repeat(201) }, 'an artist longer than any artist'],
    [{ title: '寧夏', duration: '-1' }, 'a negative length'],
    [{ title: '寧夏', duration: '7201' }, 'a length over two hours']
  ] as [Record<string, string>, string][])('%o (%s) without asking NetEase', async (query) => {
    const fetch = fakeNetEase([]);
    expect((await ask(query)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('which song it trusts', () => {
  test('the same title and artist, not the first result', async () => {
    fakeNetEase(
      [
        { id: 1, name: '宁夏 (Live)', duration: 300_000, artists: [{ name: '别人' }] },
        { id: 2, name: '青花瓷', duration: 240_000, artists: [{ name: '梁静茹' }] },
        { id: 3, name: '宁夏', duration: 241_000, artists: [{ name: '梁静茹' }] }
      ],
      { 1: '[00:01.00] wrong artist', 2: '[00:01.00] wrong song', 3: LYRICS }
    );
    const res = await ask({ title: '寧夏', artist: '梁靜茹', duration: '240' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duration).toBe(241);
    expect(body.lrc).toContain('讓我們紅塵作伴');
  });

  test('of several versions, the one closest in length', async () => {
    fakeNetEase(
      [
        { id: 1, name: '宁夏', duration: 320_000, artists: [{ name: '梁静茹' }] },
        { id: 2, name: '宁夏', duration: 242_000, artists: [{ name: '梁静茹' }] }
      ],
      { 1: '[00:01.00] long edit', 2: LYRICS }
    );
    expect((await (await ask({ title: '寧夏', artist: '梁靜茹', duration: '240' })).json()).duration).toBe(242);
  });

  test('nothing by that title is a 404, not the closest thing', async () => {
    fakeNetEase([{ id: 2, name: '青花瓷', duration: 240_000, artists: [{ name: '周杰伦' }] }], { 2: LYRICS });
    expect((await ask({ title: '寧夏', artist: '梁靜茹' })).status).toBe(404);
  });

  test('lyrics without time stamps are skipped', async () => {
    fakeNetEase([{ id: 3, name: '宁夏', duration: 241_000, artists: [{ name: '梁静茹' }] }], { 3: '纯音乐，请欣赏' });
    expect((await ask({ title: '寧夏', artist: '梁靜茹' })).status).toBe(404);
  });
});

describe('what it returns', () => {
  test('Traditional characters, without the credits NetEase adds', async () => {
    fakeNetEase([{ id: 3, name: '宁夏', duration: 241_000, artists: [{ name: '梁静茹' }] }], { 3: LYRICS });
    const { lrc } = await (await ask({ title: '寧夏', artist: '梁靜茹' })).json();
    expect(lrc).not.toMatch(/作词|作曲|作詞/);
    expect(lrc.split('\n')).toEqual(['[00:12.00] 讓我們紅塵作伴', '[00:16.00] 活得瀟瀟灑灑']);
  });

  test('NetEase not answering is a 502 that is not cached, and is logged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await ask({ title: '寧夏' });
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'NetEase didn’t answer.' });
    expect(log).toHaveBeenCalledWith('/api/lyrics: NetEase failed:', 'timed out');
    log.mockRestore();
  });
});

describe('an answer of another shape', () => {
  /** Answers NetEase's search with `search`, and its lyric endpoint with `lyric`, as they are. */
  function oddNetEase(search: unknown, lyric: unknown = { lrc: { lyric: LYRICS } }) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => Response.json(new URL(url).pathname === '/api/search/get' ? search : lyric))
    );
  }
  const song = { id: 3, name: '宁夏', duration: 241_000, artists: [{ name: '梁静茹' }] };

  test.each([
    ['songs that aren’t a list', { result: { songs: 'none' } }, undefined, '/api/search/get at result.songs'],
    ['a song without a name', { result: { songs: [{ ...song, name: undefined }] } }, undefined, '/api/search/get at result.songs.0.name'],
    ['a length that isn’t a number', { result: { songs: [{ ...song, duration: '241' }] } }, undefined, '/api/search/get at result.songs.0.duration'],
    ['an artist without a name', { result: { songs: [{ ...song, artists: [{}] }] } }, undefined, '/api/search/get at result.songs.0.artists.0.name'],
    ['a search answer that isn’t an object', 'busy', undefined, '/api/search/get at the top'],
    ['lyrics that aren’t text', { result: { songs: [song] } }, { lrc: { lyric: 42 } }, '/api/song/lyric at lrc.lyric']
  ])('%s is the 502 NetEase failing gives, logged without the query', async (_, search, lyric, where) => {
    oddNetEase(search, lyric);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await ask({ title: '寧夏', artist: '梁靜茹' });
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'NetEase didn’t answer.' });
    expect(log).toHaveBeenCalledWith('/api/lyrics: NetEase failed:', expect.stringContaining(`unexpected answer from ${where}:`));
    expect(log.mock.calls[0][1]).not.toContain('寧夏');
    log.mockRestore();
  });

  test('a search or song with nothing to give, as NetEase leaves it out or null, is a 404', async () => {
    for (const [search, lyric] of [
      [{}, undefined],
      [{ result: null }, undefined],
      [{ result: { songs: null } }, undefined],
      [{ result: { songs: [song] } }, { nolyric: true }],
      [{ result: { songs: [song] } }, { lrc: null }],
      [{ result: { songs: [song] } }, { lrc: { lyric: null } }]
    ]) {
      oddNetEase(search, lyric);
      expect((await ask({ title: '寧夏', artist: '梁靜茹' })).status).toBe(404);
    }
  });

  test('fields it doesn’t read are let through', async () => {
    oddNetEase({ result: { songs: [{ ...song, album: { id: 1 }, fee: 8 }], songCount: 1 }, code: 200 }, { lrc: { lyric: LYRICS, version: 3 }, code: 200 });
    expect((await ask({ title: '寧夏', artist: '梁靜茹' })).status).toBe(200);
  });
});
