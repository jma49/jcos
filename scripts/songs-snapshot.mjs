// Saves the music library, as Supabase has it now, to src/data/songs.json:
// the snapshot /api/songs serves while Supabase can't be read (a paused
// project) and `astro dev` uses without it. Run it by hand after adding
// songs worth keeping in the snapshot; it isn't run on a schedule, since
// each commit to src/ spends one of the day's deployments.
//
//   npm run songs:snapshot     # reads PUBLIC_SUPABASE_URL and the public key from .env
//
// It reads with the public key, as any visitor could, through the same
// code as /api/songs (src/lib/library.ts).

import { writeFile } from 'node:fs/promises';
import { fetchLibrary } from '../src/lib/library.ts';

const url = process.env.PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY (in .env, or as NEXT_PUBLIC_ variables).');
  process.exit(1);
}

const library = await fetchLibrary(url, key, AbortSignal.timeout(10_000));
if (!library.songs.length) {
  console.error('Supabase has no songs; keeping the snapshot as it is.');
  process.exit(1);
}
await writeFile(new URL('../src/data/songs.json', import.meta.url), `${JSON.stringify(library, null, 2)}\n`);
console.log(`Saved ${library.songs.length} songs and ${library.albums.length} albums to src/data/songs.json.`);
