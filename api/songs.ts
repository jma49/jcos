// GET /api/songs: the music library, read from Supabase and cached at the
// edge, so visitors don't each query the database (and the free plan's
// egress stays small). The iPod, Karaoke and Finder's Music folder load it
// when they first open.
//
// Supabase is fresh for five minutes, then served stale while it's read
// again for a day. When Supabase can't be read (paused after a quiet
// week, not set up, or slow), the snapshot in the repository is served
// instead, cached for a minute only, so the library comes back soon after
// Supabase does. Vercel's CDN doesn't honour stale-if-error, so the
// snapshot is the fallback rather than an older cached answer.

import snapshot from '../src/data/songs.json' with { type: 'json' };
import { fetchLibrary, type Library } from '../src/lib/library.js';

const FRESH = 'public, s-maxage=300, stale-while-revalidate=86400';
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
    } catch {
      // Fall through to the snapshot.
    }
  }
  return Response.json(snapshot as Library, { headers: { 'cache-control': FALLBACK, 'x-library': 'snapshot' } });
}
