// The music everyone hears, from the database: a song as it is now, what
// Jincheng is playing for everyone (public.now_playing, by the database's
// clock), and Jincheng's ratings, plays and playlists, which everyone
// reads and the database lets only the owner change.

import type { Tables } from '../../../lib/database.types';
import { SONG_COLUMNS, songOf } from '../../../lib/library';
import { SocialError } from '../errors';
import type { Listening, MusicSocial } from '../music';
import { playlistNameProblem } from '../playlistNames';
import { notOwner, refusal, type SupabaseContext } from './context';

// Rows are typed by the generated types (src/lib/database.types.ts), with
// the columns read.

type StatsRow = Pick<Tables<'song_stats'>, 'song_id' | 'rating' | 'plays' | 'played_at'>;

type PlaylistRow = Pick<Tables<'playlists'>, 'id' | 'name'> & { playlist_songs: Pick<Tables<'playlist_songs'>, 'song_id'>[] | null };

/** Jincheng's ratings, plays and playlists as the iPod uses them, leaving out what isn't set. */
export function listeningOf(stats: StatsRow[], playlists: PlaylistRow[]): Listening {
  return {
    stats: Object.fromEntries(
      stats.map((row) => [
        row.song_id,
        { ...(row.rating ? { rating: row.rating } : {}), plays: row.plays, ...(row.played_at ? { played: row.played_at } : {}) }
      ])
    ),
    playlists: playlists.map((row) => ({ id: Number(row.id), name: row.name, songs: (row.playlist_songs ?? []).map((s) => s.song_id) }))
  };
}

export function supabaseMusic({ client, member }: SupabaseContext): MusicSocial {
  return {
    async song(id) {
      const { data, error } = await client.from('songs').select(SONG_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? songOf(data) : null;
    },

    async nowPlaying() {
      const { data, error } = await client.rpc('now_playing_position');
      if (error) throw error;
      const row = data?.[0];
      return row ? { songId: row.song_id, elapsedMs: Number(row.elapsed_ms), remainingMs: Number(row.remaining_ms) } : null;
    },

    // Changes to now_playing, which only the bot writes. Realtime reads them
    // from the database's log, so the row can be believed; reading it here
    // saves every visitor asking the database at the same moment when a song
    // starts. (Joining at the right second asks, see media/together.ts.)
    watchNowPlaying(onChange, onConnected) {
      const channel = client
        .channel('now-playing')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'now_playing' }, ({ eventType, new: row }) => {
          const r = row as { song_id?: unknown; ends_at?: unknown } | null;
          const ends = typeof r?.ends_at === 'string' ? Date.parse(r.ends_at) : NaN;
          if (eventType === 'DELETE' || typeof r?.song_id !== 'string' || !Number.isFinite(ends)) return onChange(null);
          onChange({ songId: r.song_id, remainingMs: Math.max(0, ends - Date.now()) });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onConnected?.();
        });
      return () => {
        client.removeChannel(channel);
      };
    },

    // Jincheng's ratings, plays and playlists: everyone reads them, and the
    // database lets only the owner change them. Playlists come with their
    // songs in one request (PostgREST embeds them by the foreign key).
    async listening() {
      const [stats, playlists] = await Promise.all([
        client.from('song_stats').select('song_id,rating,plays,played_at'),
        client.from('playlists').select('id,name,playlist_songs(song_id)').order('id').order('position', { referencedTable: 'playlist_songs' })
      ]);
      if (stats.error) throw stats.error;
      if (playlists.error) throw playlists.error;
      return listeningOf(stats.data ?? [], playlists.data ?? []);
    },

    async rateSong(id, rating) {
      member();
      const { error } = await client.rpc('rate_song', { p_song: id, p_rating: rating });
      if (error) throw error.code === '42501' ? notOwner('the ratings everyone sees') : refusal(error);
    },

    async songPlayed(id) {
      member();
      const { error } = await client.rpc('song_played', { p_song: id });
      if (error) throw error.code === '42501' ? notOwner('the play counts everyone sees') : refusal(error);
    },

    async savePlaylist(name, songs) {
      member();
      const { data, error } = await client.rpc('save_playlist', { p_name: name, p_songs: songs });
      if (error) {
        if (error.code === '42501') throw notOwner('the playlists everyone sees');
        // A name the table's check refuses.
        if (error.code === '23514') throw new SocialError('invalid', playlistNameProblem(name) ?? 'That name won’t do.');
        throw refusal(error);
      }
      return Number(data);
    },

    // Row-level security lets anyone else's delete reach no row, without an
    // error; the site offers these only to the owner.
    async unlistSong(playlist, song) {
      member();
      const { error } = await client.from('playlist_songs').delete().eq('playlist_id', playlist).eq('song_id', song);
      if (error) throw error.code === '42501' ? notOwner('the playlists everyone sees') : refusal(error);
    },

    async deletePlaylist(playlist) {
      member();
      const { error } = await client.from('playlists').delete().eq('id', playlist);
      if (error) throw error.code === '42501' ? notOwner('the playlists everyone sees') : refusal(error);
    }
  };
}
