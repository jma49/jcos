// The music library: songs and whole albums (src/data/songs.json, curated
// by hand), each a YouTube video with cover art and a lyrics offset.

import library from '../../data/songs.json' with { type: 'json' };

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
  /** The album it's from; a title in ALBUMS when the whole album is in the library. */
  album?: string;
  /** Square cover art. Album tracks share the album's. */
  cover?: string;
  /** Position on its album, for albums in ALBUMS. */
  track?: number;
  /** No words to sing: Karaoke shows the album instead of looking for lyrics. */
  instrumental?: boolean;
}

/** A whole album in the library, shown with its cover and track list. */
export interface Album {
  title: string;
  artist: string;
  year: number;
  cover: string;
  /** A sentence or two about it. */
  note?: string;
}

export const ALBUMS: Album[] = library.albums;
export const SONGS: Song[] = library.songs;

/** A whole album in the library, by title. */
export const albumNamed = (title: string | undefined) => ALBUMS.find((a) => a.title === title);

/** The album a song belongs to, when the whole album is in the library. */
export const albumOf = (song: Song) => albumNamed(song.album);

/** Indexes of an album's songs, in track order. */
export const tracksOf = (album: Album) =>
  SONGS.flatMap((s, i) => (s.album === album.title ? [i] : [])).sort((a, b) => (SONGS[a].track ?? 0) - (SONGS[b].track ?? 0));

/** Square cover art for a song; the video's thumbnail when there's none. */
export const coverOf = (song: Song) => song.cover ?? albumOf(song)?.cover ?? `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`;

/** How far the lyrics run ahead of the video for a song, in seconds. */
export function lyricOffset(song: Song, offsets: Record<string, number>) {
  return ((song.offset ?? 0) + (offsets[song.id] ?? 0)) / 1000;
}
