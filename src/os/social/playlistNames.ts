// What a name for one of Jincheng's playlists may be: the database checks
// the same (supabase/migrations/20260929140000_playlists.sql), and these
// are here to say why before it's asked. Kept apart from types.ts, which
// the desktop loads first, as only the iPod and the backends use them.

/** The iPod's own playlists' names, which none of Jincheng's may have (the database refuses them too). */
export const IPOD_PLAYLISTS = ['On-The-Go', 'My Top Rated', 'Recently Played', 'Top 25 Most Played'];
/** How long a playlist's name may be, to fit the iPod's screen. */
export const PLAYLIST_NAME_MAX = 40;

/** Why a playlist's name won't do, or null when it will. */
export function playlistNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Give the playlist a name.';
  if (trimmed.length > PLAYLIST_NAME_MAX) return `A name fits in ${PLAYLIST_NAME_MAX} characters.`;
  // Control characters: a name is one line on the screen.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return 'A name is one line.';
  const own = IPOD_PLAYLISTS.find((name) => name.toLowerCase() === trimmed.toLowerCase());
  if (own) return `${own} is one of the iPod’s own playlists.`;
  return null;
}
