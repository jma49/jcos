// GET /api/songs: the music library, read from Supabase and cached at the
// edge, so visitors don't each query the database (and the free plan's
// egress stays small). The iPod, Karaoke and Finder's Music folder load it
// when they first open.
//
// Supabase is fresh for thirty seconds, then served stale for thirty more
// while it's read again, so a song Jincheng adds is on the site within a
// minute. The edge is there for bursts of visitors, not to keep the
// library for long: it once served stale for a day, and on a quiet site
// the first visitor after any pause got whatever the edge had last, so a
// new song took a reload or two to show (added 05:13, first served 05:31,
// 2026-09-29). A miss costs about 0.2 s; the library is 7 KB (2.4 gzipped).
//
// When Supabase can't be read (paused after a quiet week, not set up, or
// slow), the snapshot in the repository is served instead, cached for a
// minute only, so the library comes back soon after Supabase does.
// Vercel's CDN doesn't honour stale-if-error, so the snapshot is the
// fallback rather than an older cached answer.

import snapshot from '../src/data/songs.json' with { type: 'json' };
import { fetchLibrary, type Library } from '../src/lib/library.js';

const FRESH = 'public, s-maxage=30, stale-while-revalidate=30';
const FALLBACK = 'public, s-maxage=60';

export async function GET() {
  const url = process.env.PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const library = await fetchLibrary(url, key, AbortSignal.timeout(5000));
      // Empty isn't served: the bot keeps at least one song (music.ts), so an
      // empty library is a database not seeded yet, or emptied by hand in
      // the Table editor, and the snapshot stands in.
      if (library.songs.length) return Response.json(library, { headers: { 'cache-control': FRESH } });
    } catch (error) {
      // Say why in the function's logs: a refused query looks like a
      // working site that never shows new songs.
      console.error('/api/songs: serving the snapshot, Supabase failed:', error instanceof Error ? error.message : error);
    }
  }
  return Response.json(snapshot as Library, { headers: { 'cache-control': FALLBACK, 'x-library': 'snapshot' } });
}
