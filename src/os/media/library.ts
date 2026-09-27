// The music library: songs and whole albums, each song a YouTube video
// with cover art and a lyrics offset. It lives in Supabase, managed from
// the Telegram bot, and arrives through /api/songs (api/songs.ts) the
// first time something needs it: the apps that play or list music say so
// in their manifests (`data`), so it's here before they render. It stays
// the same for the rest of the visit, so a song's place in SONGS is a
// stable handle until the page is reloaded.

import type { Album, Library, Song } from '../../lib/library';
import { getSocial } from '../social/social';

export type { Album, Song };

/** Every album and song. Empty until loadLibrary() has finished. */
export let ALBUMS: Album[] = [];
export let SONGS: Song[] = [];

let loading: Promise<void> | null = null;

/**
 * Loads the library, once. Without /api/songs (`astro dev`, or no
 * network) it falls back to the snapshot in the repository, fetched only
 * then. If both fail, that's forgotten, so the next call tries again.
 */
export function loadLibrary(): Promise<void> {
  loading ??= (async () => {
    const library = (await fromApi().catch(() => null)) ?? ((await import('../../data/songs.json')).default as Library);
    ALBUMS = library.albums;
    SONGS = library.songs;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

async function fromApi(): Promise<Library> {
  const res = await fetch('/api/songs', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`/api/songs answered ${res.status}`);
  const library = (await res.json()) as Partial<Library>;
  if (!Array.isArray(library.songs) || !Array.isArray(library.albums) || !library.songs.length) {
    throw new Error('/api/songs sent no library');
  }
  return library as Library;
}

export const libraryLoaded = () => SONGS.length > 0;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A song's place in the library, or -1 if there's no such song. A song
 * added after this visit's library was read (the edge keeps /api/songs
 * for minutes) is fetched on its own and appended, so every other song
 * keeps its place: Jincheng can /play a song he has just added.
 */
export async function findSong(id: string): Promise<number> {
  await loadLibrary();
  const known = SONGS.findIndex((s) => s.id === id);
  if (known >= 0 || !VIDEO_ID.test(id)) return known;
  const social = await getSocial();
  const song = await social?.song(id).catch(() => null);
  if (!song) return -1;
  // Asked twice at once (a play and an AirDrop offer), it's added once.
  const meanwhile = SONGS.findIndex((s) => s.id === id);
  if (meanwhile >= 0) return meanwhile;
  SONGS = [...SONGS, song];
  return SONGS.length - 1;
}

/**
 * Something worked out from the library, the first time it's asked for.
 * Asking before the library has loaded is a mistake, and throws.
 */
export function fromLibrary<T>(build: () => T): () => T {
  let built: { value: T } | null = null;
  return () => {
    if (!built) {
      if (!libraryLoaded()) throw new Error('The music library isn’t loaded yet.');
      built = { value: build() };
    }
    return built.value;
  };
}

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
