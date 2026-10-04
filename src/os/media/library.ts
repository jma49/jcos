// The music library: songs and whole albums, each song a YouTube video
// with cover art and a lyrics offset. It lives in Supabase, managed from
// the Telegram bot, and arrives through /api/songs (api/songs.ts) the
// first time something needs it: the apps that play or list music say so
// in their manifests (`data`), so it's here before they render.
//
// Songs Jincheng adds during a visit are picked up while a music app is
// open (refresh.ts, which isn't in the first load), at most once a minute.
// They're appended, and changed songs are updated where they are; nothing
// is removed or reordered until the page is reloaded, so a song's place
// in SONGS stays a stable handle for the whole visit.

import { useSyncExternalStore } from 'react';
import { DEFAULT_LIMIT, type Album, type Disc, type Library, type Song } from '../../lib/library';
import { report } from '../core/report';
import { getSocial } from '../social/social';

export type { Album, Disc, Song };

/** Every album and song. Empty until loadLibrary() has finished. */
export let ALBUMS: Album[] = [];
export let SONGS: Song[] = [];
/** How many songs the library may hold. */
export let SONG_LIMIT = DEFAULT_LIMIT;
/** DVD Player's shelf: the discs Jincheng has burned, oldest first (media/discs.ts adds a visitor's own). */
export let DISCS: Disc[] = [];

let loading: Promise<void> | null = null;
/** When the library was last read, and how many times it has changed this visit. */
let readAt = 0;
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  listeners.forEach((listener) => listener());
}

/**
 * Loads the library, once. Without /api/songs (`astro dev`, or no
 * network) it falls back to the snapshot in the repository, fetched only
 * then. If both fail, that's forgotten, so the next call tries again.
 */
export function loadLibrary(): Promise<void> {
  loading ??= (async () => {
    // No /api/songs (astro dev, offline): the snapshot, as above.
    const library = (await fromApi().catch(() => null)) ?? ((await import('../../data/songs.json')).default as Library);
    ALBUMS = library.albums;
    SONGS = library.songs;
    SONG_LIMIT = library.limit ?? DEFAULT_LIMIT;
    DISCS = library.discs ?? [];
    readAt = Date.now();
    changed();
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export async function fromApi(): Promise<Library> {
  const res = await fetch('/api/songs', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`/api/songs answered ${res.status}`);
  const library = (await res.json()) as Partial<Library>;
  if (!Array.isArray(library.songs) || !Array.isArray(library.albums) || !library.songs.length) {
    throw new Error('/api/songs sent no library');
  }
  return library as Library;
}

export const libraryLoaded = () => SONGS.length > 0;

/**
 * Replaces the visit's library with `next` (refresh.ts works it out, never
 * removing or moving a song) and tells the views.
 */
export function applyLibrary(next: Library) {
  ALBUMS = next.albums;
  SONGS = next.songs;
  SONG_LIMIT = next.limit ?? SONG_LIMIT;
  DISCS = next.discs ?? DISCS;
  readAt = Date.now();
  changed();
}

/**
 * Replaces the shelf with `discs`, for a change heard sooner than the
 * library is read again: one Jincheng made on this page, or one Realtime
 * brought. Discs aren't handles the way songs are, so they may come and go.
 */
export function applyDiscs(discs: Disc[]) {
  DISCS = discs;
  changed();
}

/** When the library was last read. */
export const libraryReadAt = () => readAt;

/** Marks the library as just read, with nothing new in it. */
export const libraryChecked = () => void (readAt = Date.now());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** For a component that shows the library: it renders again when the library changes during the visit. */
export const useLibraryVersion = () => useSyncExternalStore(subscribe, () => version, () => version);

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
  const song = await social?.song(id).catch((error) => {
    report(error, 'library.song');
    return null;
  });
  if (!song) return -1;
  // Asked twice at once (a play and an AirDrop offer), it's added once.
  const meanwhile = SONGS.findIndex((s) => s.id === id);
  if (meanwhile >= 0) return meanwhile;
  SONGS = [...SONGS, song];
  changed();
  return SONGS.length - 1;
}

/**
 * Something worked out from the library, the first time it's asked for,
 * and again after the library changes. Asking before the library has
 * loaded is a mistake, and throws.
 */
export function fromLibrary<T>(build: () => T): () => T {
  let built: { value: T; version: number } | null = null;
  return () => {
    if (!built || built.version !== version) {
      if (!libraryLoaded()) throw new Error('The music library isn’t loaded yet.');
      built = { value: build(), version };
    }
    return built.value;
  };
}

/** A whole album in the library, by title. */
export const albumNamed = (title: string | undefined) => ALBUMS.find((a) => a.title === title);

/** The album a song belongs to, when the whole album is in the library. */
export const albumOf = (song: Song) => albumNamed(song.album);

/** Indexes of an album's songs among `songs`, in track order. */
export const tracksIn = (songs: Song[], album: Album) =>
  songs.flatMap((s, i) => (s.album === album.title ? [i] : [])).sort((a, b) => (songs[a].track ?? 0) - (songs[b].track ?? 0));

/** Indexes of an album's songs, in track order. */
export const tracksOf = (album: Album) => tracksIn(SONGS, album);

/** Square cover art for a song; the video's thumbnail when there's none. */
export const coverOf = (song: Song) => song.cover ?? albumOf(song)?.cover ?? `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`;

/** How far the lyrics run ahead of the video for a song, in seconds. */
export function lyricOffset(song: Song, offsets: Record<string, number>) {
  return ((song.offset ?? 0) + (offsets[song.id] ?? 0)) / 1000;
}
