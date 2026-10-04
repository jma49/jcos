// The media library's shape, and how it's read from Supabase: shared by
// /api/songs (api/songs.ts), the snapshot script (npm run songs:snapshot)
// and the desktop (src/os/media/library.ts). It's the music and, as in
// iTunes, the movies: DVD Player's shelf of discs. The database checks
// every field (supabase/migrations/20260927030802_music_library.sql and
// 20260929120000_discs.sql); this turns its rows into what the iPod,
// Karaoke and DVD Player use.

import type { Tables } from './database.types';

export interface Song {
  /** The YouTube video id. */
  id: string;
  title: string;
  artist: string;
  /**
   * Milliseconds the lyrics run ahead of the video: positive shows each line
   * earlier. Music videos with an intro need a negative one. Visitors can
   * nudge it further in Karaoke.
   */
  offset?: number;
  /** An lrclib.net lyrics id, to pin the right lyrics when the search picks wrong ones. */
  lyrics?: number;
  /** The album it's from; a title in `albums` when the whole album is in the library. */
  album?: string;
  /** Square cover art. Album tracks share the album's. */
  cover?: string;
  /** Position on its album, for albums in `albums`. */
  track?: number;
  /** No words to sing: Karaoke shows the album instead of looking for lyrics. */
  instrumental?: boolean;
  /** When it came to the library (ISO 8601), iTunes' Date Added. Missing in the repository's snapshot. */
  added?: string;
}

/** A whole album in the library, shown with its cover and track list. */
export interface Album {
  title: string;
  artist: string;
  year: number;
  cover: string;
  /** A sentence or two about it. */
  note?: string;
  /** When it came to the library (ISO 8601). Missing in the repository's snapshot. */
  added?: string;
}

/**
 * A disc on DVD Player's shelf: a YouTube video Jincheng burned, with a
 * case made from one of the video's own pictures.
 */
export interface Disc {
  /** The YouTube video id. */
  id: string;
  title: string;
  artist?: string;
  /** Which of the video's images on i.ytimg.com is the case's picture: "maxresdefault", "hq2"… */
  cover: string;
  /** Where the case crops the picture, from its left edge (0) to its right (100). */
  coverX: number;
  /** The video's length in milliseconds, once known. */
  duration?: number;
  /** When it was burned (ISO 8601). */
  added: string;
}

export interface Library {
  albums: Album[];
  songs: Song[];
  /** How many songs the library may hold (music_settings.song_limit). */
  limit?: number;
  /** DVD Player's shelf, oldest first; missing where the shelf can't be read. */
  discs?: Disc[];
}

/** The limit when it isn't known (the snapshot, or before song_limit() exists). */
export const DEFAULT_LIMIT = 200;

// The rows as the generated types have them (database.types.ts), with the
// columns read below.
type SongRow = Pick<Tables<'songs'>, 'id' | 'title' | 'artist' | 'album' | 'cover' | 'track' | 'instrumental' | 'lyrics_offset' | 'lyrics_id' | 'added_at'>;

type DiscRow = Pick<Tables<'discs'>, 'id' | 'title' | 'artist' | 'cover' | 'cover_x' | 'duration_ms' | 'added_at'>;

type AlbumRow = Pick<Tables<'albums'>, 'title' | 'artist' | 'year' | 'cover' | 'note' | 'added_at'>;

/** A song row as the site uses it, leaving out what isn't set. */
export function songOf(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    ...(row.album ? { album: row.album } : {}),
    ...(row.cover ? { cover: row.cover } : {}),
    ...(row.track ? { track: row.track } : {}),
    ...(row.instrumental ? { instrumental: true } : {}),
    ...(row.lyrics_offset ? { offset: row.lyrics_offset } : {}),
    ...(row.lyrics_id ? { lyrics: row.lyrics_id } : {}),
    ...(row.added_at ? { added: row.added_at } : {})
  };
}

export function albumOf(row: AlbumRow): Album {
  return {
    title: row.title,
    artist: row.artist,
    year: row.year,
    cover: row.cover,
    ...(row.note ? { note: row.note } : {}),
    ...(row.added_at ? { added: row.added_at } : {})
  };
}

/** A disc row as the site uses it, leaving out what isn't set. */
export function discOf(row: DiscRow): Disc {
  return {
    id: row.id,
    title: row.title,
    ...(row.artist ? { artist: row.artist } : {}),
    cover: row.cover,
    coverX: row.cover_x,
    ...(row.duration_ms ? { duration: row.duration_ms } : {}),
    added: row.added_at
  };
}

// Visitors may read exactly these columns and order by added_at: the grants
// are in the music migrations, and supabase/tests/rules.sql runs these
// queries as a visitor. Change both together.
export const SONG_COLUMNS = 'id,title,artist,album,cover,track,instrumental,lyrics_offset,lyrics_id,added_at';
const ALBUM_COLUMNS = 'title,artist,year,cover,note,added_at';
const DISC_COLUMNS = 'id,title,artist,cover,cover_x,duration_ms,added_at';

/**
 * Reads the library from Supabase's REST API with the public key, as any
 * visitor could: the tables are readable by everyone and nothing else.
 * Throws when Supabase doesn't answer, or answers with anything but a list.
 */
export async function fetchLibrary(url: string, key: string, signal?: AbortSignal): Promise<Library> {
  const get = async <T>(path: string): Promise<T[]> => {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, { headers: { apikey: key }, signal });
    if (!res.ok) throw new Error(`Supabase answered ${res.status} for ${path.split('?')[0]}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`Supabase sent something other than a list for ${path.split('?')[0]}`);
    return rows as T[];
  };
  const [albums, songs, limit, discs] = await Promise.all([
    get<AlbumRow>(`albums?select=${ALBUM_COLUMNS}&order=added_at.asc,title.asc`),
    get<SongRow>(`songs?select=${SONG_COLUMNS}&order=added_at.asc,id.asc`),
    songLimit(url, key, signal),
    // The shelf is extra: where it can't be read (before its migration has
    // run), the music is served without it.
    get<DiscRow>(`discs?select=${DISC_COLUMNS}&order=added_at.asc,id.asc`).catch(() => null)
  ]);
  return { albums: albums.map(albumOf), songs: songs.map(songOf), ...(limit ? { limit } : {}), ...(discs ? { discs: discs.map(discOf) } : {}) };
}

/**
 * The library's limit (song_limit()), or undefined if it can't be read: a
 * missing number mustn't cost the library (the site shows the default).
 */
async function songLimit(url: string, key: string, signal?: AbortSignal): Promise<number | undefined> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/song_limit`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: '{}',
      signal
    });
    const limit = res.ok ? await res.json() : undefined;
    return Number.isInteger(limit) && limit > 0 ? limit : undefined;
  } catch {
    return undefined;
  }
}
