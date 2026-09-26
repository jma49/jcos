// GET /api/lyrics?title=&artist=&duration=: time-synced lyrics from NetEase
// Cloud Music, for songs lrclib.net doesn't have (older Mandarin songs,
// mostly). NetEase can't be called from a browser, so this relays it: search
// for the song, take the match whose length is closest to the video's, and
// return its LRC. NetEase writes Simplified Chinese; the lyrics come back in
// Traditional to match the songs' own titles.
//
// Responds 404 when nothing matches and 502 when NetEase doesn't answer in
// time (each request gets five seconds). Answers are cached at the edge for
// a day, misses for an hour, so NetEase sees each song about once a day.

import { Converter } from 'opencc-js';

const toTraditional = Converter({ from: 'cn', to: 'tw' });

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  referer: 'https://music.163.com/'
};

interface SearchResult {
  result?: { songs?: { id: number; name: string; duration: number; artists: { name: string }[] }[] };
}

interface LyricResult {
  lrc?: { lyric?: string };
}

/** Credits NetEase puts in the first lines ("作词 : …"), which aren't sung. */
const CREDIT = /^\[[\d:.]+\]\s*(作词|作曲|编曲|制作人|作詞|編曲|製作人|词|曲)\s*[:：]/;

/** A NetEase request that gives up after five seconds rather than holding the visitor's lyrics up. */
async function netease<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://music.163.com${path}`, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
  return res.ok ? ((await res.json()) as T) : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = params.get('title')?.trim();
  const artist = params.get('artist')?.trim() ?? '';
  const duration = Number(params.get('duration')) || 0;
  if (!title) return Response.json({ error: 'title is required' }, { status: 400 });
  // Song titles and artists are short; anything longer isn't a lookup this site makes.
  if (title.length > 200 || artist.length > 200 || duration < 0 || duration > 7200) {
    return Response.json({ error: 'bad request' }, { status: 400, headers: { 'cache-control': 'public, s-maxage=86400' } });
  }

  try {
    return await lookUp(title, artist, duration);
  } catch {
    return Response.json({ error: 'NetEase didn’t answer' }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}

async function lookUp(title: string, artist: string, duration: number) {
  const search = await netease<SearchResult>(`/api/search/get?${new URLSearchParams({ s: `${title} ${artist}`, type: '1', limit: '10' })}`);
  const songs = search?.result?.songs ?? [];
  // The same song (title, then artist), then the closest length. Titles are
  // compared without brackets, spaces or case, in Traditional characters.
  const plain = (s: string) => toTraditional(s).toLowerCase().replace(/[(（[【].*?[)）\]】]/g, '').replace(/[\s&＆]/g, '');
  const related = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a));
  const pool = songs
    .filter((s) => related(plain(s.name), plain(title)))
    .filter((s) => !artist || s.artists.some((a) => related(plain(a.name), plain(artist))))
    .sort((a, b) => (duration ? Math.abs(a.duration / 1000 - duration) - Math.abs(b.duration / 1000 - duration) : 0));

  for (const song of pool.slice(0, 3)) {
    const lrc = (await netease<LyricResult>(`/api/song/lyric?id=${song.id}&lv=1`))?.lrc?.lyric;
    if (!lrc || !/\[\d+:\d+/.test(lrc)) continue;
    const lines = lrc.split('\n').filter((line) => !CREDIT.test(line));
    return Response.json(
      { source: 'netease', duration: song.duration / 1000, lrc: toTraditional(lines.join('\n')) },
      { headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    );
  }
  return Response.json({ error: 'no synced lyrics' }, { status: 404, headers: { 'cache-control': 'public, s-maxage=3600' } });
}
