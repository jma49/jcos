// The music everyone hears: the library's songs as the database has them,
// what Jincheng is playing for everyone, and Jincheng's ratings, plays and
// playlists, which every iPod shows. The Supabase side is
// supabase/music.ts, the stand-in's local/music.ts.

import type { Song } from '../../lib/library';

/** Jincheng's rating and plays of a song. */
export interface SongStats {
  /** One to five stars; missing until rated. */
  rating?: number;
  /** How many times Jincheng has listened to it to the end, on the site. */
  plays: number;
  /** When Jincheng last did (ISO 8601). */
  played?: string;
}

/** One of Jincheng's own playlists: its songs' YouTube ids, in order. */
export interface Playlist {
  id: number;
  name: string;
  songs: string[];
}

/** What the iPod shows everyone of Jincheng's listening. */
export interface Listening {
  /** By song id; a song never rated or played isn't in it. */
  stats: Record<string, SongStats>;
  /** In the order they were made. */
  playlists: Playlist[];
}

/** A song Jincheng is playing for everyone on the desktop (/play in Telegram). */
export interface NowPlaying {
  /** The song's YouTube id. */
  songId: string;
  /** How far in it is, and how long it has left, in ms, by the database's clock. */
  elapsedMs: number;
  remainingMs: number;
}

export interface MusicSocial {
  /** One song from the library, as the database has it now; null if there's no such song. */
  song: (id: string) => Promise<Song | null>;
  /** What Jincheng is playing for everyone, by the database's clock; null when nothing is. */
  nowPlaying: () => Promise<NowPlaying | null>;
  /**
   * Calls back when Jincheng plays or stops a song, with the song and the
   * time it has left (null when stopped), and `onConnected` each time the
   * watch starts or resumes after the connection dropped (changes made
   * meanwhile aren't sent again); returns a function that stops watching.
   */
  watchNowPlaying: (
    onChange: (now: Pick<NowPlaying, 'songId' | 'remainingMs'> | null) => void,
    onConnected?: () => void
  ) => () => void;

  /** Jincheng's ratings, plays and playlists, as the database has them now. */
  listening: () => Promise<Listening>;
  /** Rates a song one to five stars, or clears its rating with 0. Only the owner may. */
  rateSong: (id: string, rating: number) => Promise<void>;
  /** Counts a play of a song listened to the end. Only the owner's are counted. */
  songPlayed: (id: string) => Promise<void>;
  /**
   * Saves songs into the playlist called `name` (whatever its case),
   * making it if there's none, and returns its id. Only the owner may.
   */
  savePlaylist: (name: string, songs: string[]) => Promise<number>;
  /** Takes a song out of one of the playlists. Only the owner may. */
  unlistSong: (playlist: number, song: string) => Promise<void>;
  /** Deletes one of the playlists. Only the owner may. */
  deletePlaylist: (playlist: number) => Promise<void>;
}
