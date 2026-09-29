import { useEffect } from 'react';
import { ALBUMS, applyLibrary, fromApi, libraryChecked, libraryLoaded, libraryReadAt, SONG_LIMIT, SONGS } from './library';
import type { Library } from '../../lib/library';

// Picking up songs Jincheng adds during a visit, for the apps that list or
// play music (library.ts has the rest). Loaded with those apps, not with
// the desktop.

/** How long a read library is taken as current before it's asked for again. */
export const REFRESH_AFTER_MS = 60_000;
let refreshing: Promise<void> | null = null;

/**
 * Picks up what changed in the library since this visit read it: new songs
 * are appended, changed ones (a title, a lyrics offset) updated in place.
 * Nothing is removed or moved. At most once a minute, and not before the
 * library has loaded; a failed read is just skipped.
 */
export function refreshLibrary(): Promise<void> {
  if (refreshing) return refreshing;
  if (!libraryLoaded() || Date.now() - libraryReadAt() < REFRESH_AFTER_MS) return Promise.resolve();
  refreshing = fromApi()
    .then((library) => {
      const next = merge(library);
      if (next) applyLibrary(next);
      else libraryChecked();
    })
    .catch(() => {})
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** The visit's library with what's new added and what changed updated; null if nothing did. */
export function merge(library: Library): Library | null {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const songs = [...SONGS];
  const albums = [...ALBUMS];
  let any = false;
  for (const song of library.songs) {
    const at = songs.findIndex((s) => s.id === song.id);
    if (at < 0) songs.push(song);
    else if (!same(songs[at], song)) songs[at] = song;
    else continue;
    any = true;
  }
  for (const album of library.albums) {
    const at = albums.findIndex((a) => a.title === album.title);
    if (at < 0) albums.push(album);
    else if (!same(albums[at], album)) albums[at] = album;
    else continue;
    any = true;
  }
  const limit = library.limit ?? SONG_LIMIT;
  return any || limit !== SONG_LIMIT ? { songs, albums, limit } : null;
}

/**
 * For an app that lists or plays music: the library is refreshed when it
 * opens and whenever the tab comes back while it's open.
 */
export function useLibraryRefresh() {
  useEffect(() => {
    void refreshLibrary();
    const onVisible = () => document.visibilityState === 'visible' && void refreshLibrary();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
