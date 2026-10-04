// The iPod's playlists and ratings. Jincheng's ratings, plays and own
// playlists live in the database
// (supabase/migrations/20260929140000_playlists.sql): everyone's iPod shows
// them, and only Jincheng, signed in, changes them. The smart playlists
// (My Top Rated, Recently Played, Top 25 Most Played) are made from them
// here. On-The-Go is each visitor's own, kept in this browser for all its
// tabs; Jincheng can save one as a playlist for everyone.
//
// Loaded with the iPod, and by a player when a song ends (to count the
// play); not with the desktop.

import { useEffect, useSyncExternalStore } from 'react';
import { report } from '../core/report';
import { loadJSON, onStored, updateJSON } from '../core/storage';
import { useAccount } from '../social/account';
import { ownerAnswer } from '../social/owner';
import { getSocial } from '../social/social';
import { playlistNameProblem } from '../social/playlistNames';
import type { Listening, Playlist, SongStats } from '../social/types';
import { fromLibrary, SONGS } from './library';

export type { Playlist, SongStats };

let listening: Listening = { stats: {}, playlists: [] };
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** For a view that shows ratings or playlists: it renders again when they (or On-The-Go) change. */
export const useListening = () => useSyncExternalStore(subscribe, () => version, () => version);

/** Jincheng's rating and plays of a song. */
export const statsOf = (id: string): SongStats => listening.stats[id] ?? { plays: 0 };
/** Jincheng's rating of a song, 0 when it isn't rated. */
export const ratingOf = (id: string) => listening.stats[id]?.rating ?? 0;
/** Jincheng's own playlists, by name. */
export const playlists = () => [...listening.playlists].sort((a, b) => a.name.localeCompare(b.name));

// ---------- Reading ----------

/** How long a read stands before the database is asked again. */
const FRESH_MS = 30_000;
let freshAt = 0;
let reading: Promise<void> | null = null;
/**
 * Changes made on this page, counted as each begins and ends: a read that
 * started before one may have missed it, and is dropped.
 */
let writes = 0;

/** Reads Jincheng's ratings, plays and playlists, at most every 30 s; a failed read is skipped. */
export function readListening(): Promise<void> {
  if (reading) return reading;
  if (Date.now() - freshAt < FRESH_MS) return Promise.resolve();
  const at = writes;
  reading = getSocial()
    .then(async (social) => {
      const read = social ? await social.listening() : null;
      // A rating waiting to be saved would be put back by what the database still has.
      if (!read || at !== writes || unsaved.size) return;
      freshAt = Date.now();
      if (JSON.stringify(read) !== JSON.stringify(listening)) {
        listening = read;
        changed();
      }
    })
    .catch((error) => report(error, 'playlists.read'))
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** For the iPod: while it's open, what Jincheng rated and saved is read fresh, and again when the tab comes back. */
export function useListeningRefresh(active = true) {
  useEffect(() => {
    if (!active) return;
    void readListening();
    const onVisible = () => document.visibilityState === 'visible' && void readListening();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);
}

/** Runs a change Jincheng makes, counting it as a write both ways, so no read from before it lands after. */
async function writing<T>(write: () => Promise<T>): Promise<T> {
  writes++;
  try {
    return await write();
  } finally {
    writes++;
    freshAt = 0;
  }
}

async function database() {
  const social = await getSocial();
  if (!social) throw new Error('Jincheng’s playlists need the database, which isn’t here.');
  return social;
}

function setStats(id: string, stats: SongStats) {
  listening = { ...listening, stats: { ...listening.stats, [id]: stats } };
  changed();
}

// ---------- Ratings ----------

/** How long the wheel rests before a rating is saved, so turning from one star to five saves once. */
export const SAVE_RATING_AFTER_MS = 800;
/** Ratings changed here and not saved yet, with what each was before (put back if saving fails). */
const unsaved = new Map<string, { before: number; timer: ReturnType<typeof setTimeout>; turn: number }>();
let turns = 0;
/** Saves go one after another, so a later rating can't overtake an earlier one. */
let saving: Promise<unknown> = Promise.resolve();
let refused: { id: string; at: number } | null = null;

/** The last rating the database refused, and when: the iPod says so. */
export const ratingRefused = () => refused;

/**
 * Rates a song 0 (none) to 5 stars for everyone: shown now, saved once the
 * wheel rests. Only Jincheng's is kept; anyone else's is put back.
 */
export function rate(id: string, stars: number) {
  const rating = Math.max(0, Math.min(5, Math.round(stars)));
  const waiting = unsaved.get(id);
  if (waiting) clearTimeout(waiting.timer);
  const before = waiting ? waiting.before : ratingOf(id);
  const turn = ++turns;
  const { rating: _, ...rest } = statsOf(id);
  setStats(id, rating ? { ...rest, rating } : rest);
  writes++;
  const timer = setTimeout(() => {
    saving = saving.then(() => saveRating(id, rating, turn));
  }, SAVE_RATING_AFTER_MS);
  unsaved.set(id, { before, timer, turn });
}

async function saveRating(id: string, rating: number, turn: number) {
  let saved = false;
  try {
    await writing(async () => (await database()).rateSong(id, rating));
    saved = true;
  } catch (error) {
    report(error, 'playlists.rate');
  }
  const now = unsaved.get(id);
  if (!now) return;
  if (now.turn !== turn) {
    // Rated again meanwhile: that one saves next, and this one is what the database has.
    if (saved) now.before = rating;
    return;
  }
  unsaved.delete(id);
  if (saved) return;
  const { rating: _, ...rest } = statsOf(id);
  setStats(id, now.before ? { ...rest, rating: now.before } : rest);
  refused = { id, at: Date.now() };
  changed();
}

// ---------- Plays ----------

/**
 * Counts a play of a song listened to the end, if Jincheng is the one
 * listening (the database counts no one else's). A failure goes uncounted.
 */
export async function countPlay(id: string) {
  const account = useAccount.getState().account;
  if (!account || !(await ownerAnswer(account.id))) return;
  try {
    await writing(async () => (await database()).songPlayed(id));
  } catch {
    return;
  }
  const was = statsOf(id);
  setStats(id, { ...was, plays: was.plays + 1, played: new Date().toISOString() });
}

// ---------- Smart playlists (song indexes) ----------

const DAY_MS = 86_400_000;
export const RECENT_DAYS = 14;
export const SMART_MOST = 25;
/**
 * Every song with what the smart playlists sort by, worked out once per
 * list rather than in each comparison (a list of 200 songs sorts in a
 * fraction of a millisecond, on every render of Playlists).
 */
const scored = () =>
  SONGS.map((s, i) => {
    const stats = listening.stats[s.id];
    return { i, rating: stats?.rating ?? 0, plays: stats?.plays ?? 0, at: Date.parse(stats?.played ?? '') || 0 };
  });

/** My Top Rated: four stars and up, the best first, then in the library's order. */
export const topRated = () =>
  scored()
    .filter((s) => s.rating >= 4)
    .sort((a, b) => b.rating - a.rating)
    .map((s) => s.i);

/** Recently Played: played to the end in the last two weeks, the latest first, 25 at most. */
export const recentlyPlayed = (now = Date.now()) =>
  scored()
    .filter((s) => s.at > now - RECENT_DAYS * DAY_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, SMART_MOST)
    .map((s) => s.i);

/** Top 25 Most Played: the most plays first, and the latest played first among equals. */
export const mostPlayed = () =>
  scored()
    .filter((s) => s.plays > 0)
    .sort((a, b) => b.plays - a.plays || b.at - a.at)
    .slice(0, SMART_MOST)
    .map((s) => s.i);

/** Songs' places in the library by id, for the ids a playlist keeps. */
const places = fromLibrary(() => new Map(SONGS.map((s, i) => [s.id, i])));

/** The songs of a list of ids, as places in the library; ones no longer in it are left out. */
export const indexesOf = (ids: string[]) =>
  ids.flatMap((id) => {
    const at = places().get(id);
    return at === undefined ? [] : [at];
  });

// ---------- Jincheng's playlists ----------

/** A name for a new playlist, as an iPod names a saved On-The-Go: "New Playlist 1", or the next one free. */
export function newPlaylistName() {
  const taken = new Set(listening.playlists.map((p) => p.name.toLowerCase()));
  let n = 1;
  while (taken.has(`new playlist ${n}`)) n++;
  return `New Playlist ${n}`;
}

/**
 * Saves On-The-Go as a playlist for everyone (the database lets only
 * Jincheng): into the one called `name` if there is one, after its songs,
 * else a new one. On-The-Go is empty after, as on an iPod.
 */
export async function saveOnTheGo(name: string): Promise<Playlist> {
  const problem = playlistNameProblem(name);
  if (problem) throw new Error(problem);
  const songs = onTheGo();
  const id = await writing(async () => (await database()).savePlaylist(name.trim(), songs));
  const named = listening.playlists.find((p) => p.id === id);
  const known = new Set(SONGS.map((s) => s.id));
  const saved: Playlist = { id, name: named?.name ?? name.trim(), songs: [...new Set([...(named?.songs ?? []), ...songs.filter((s) => known.has(s))])] };
  listening = { ...listening, playlists: named ? listening.playlists.map((p) => (p.id === id ? saved : p)) : [...listening.playlists, saved] };
  changed();
  clearOnTheGo();
  return saved;
}

/** Takes a song out of one of Jincheng's playlists: gone now, back if the database refuses. */
export async function unlist(playlist: number, song: string) {
  const list = listening.playlists.find((p) => p.id === playlist);
  if (!list) return;
  const at = list.songs.indexOf(song);
  const change = (songs: (list: Playlist) => string[]) => {
    listening = { ...listening, playlists: listening.playlists.map((p) => (p.id === playlist ? { ...p, songs: songs(p) } : p)) };
    changed();
  };
  change((p) => p.songs.filter((s) => s !== song));
  try {
    await writing(async () => (await database()).unlistSong(playlist, song));
  } catch (error) {
    change((p) => (p.songs.includes(song) ? p.songs : [...p.songs.slice(0, at), song, ...p.songs.slice(at)]));
    throw error;
  }
}

/** Deletes one of Jincheng's playlists for everyone. */
export async function deletePlaylist(playlist: number) {
  await writing(async () => (await database()).deletePlaylist(playlist));
  listening = { ...listening, playlists: listening.playlists.filter((p) => p.id !== playlist) };
  changed();
}

// ---------- On-The-Go ----------

const GO_KEY = 'os-ipod-on-the-go';
/** On-The-Go holds this many songs at most; the earliest go first. */
export const GO_MOST = 500;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** A stored On-The-Go, as far as it's one: each song once, in order. */
const asGo = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && VIDEO_ID.test(id)))].slice(-GO_MOST) : [];

let go = asGo(loadJSON<unknown>(GO_KEY, []));

/** Changes On-The-Go from what's stored now, so a song added in another tab stays. */
function changeGo(change: (ids: string[]) => string[]) {
  go = asGo(updateJSON<unknown>(GO_KEY, [], (stored) => asGo(change(asGo(stored)))));
  changed();
}

// Added to or cleared in another tab.
onStored(GO_KEY, () => {
  go = asGo(loadJSON<unknown>(GO_KEY, []));
  changed();
});

/** This visitor's On-The-Go: YouTube ids, in the order they were added. */
export const onTheGo = () => go;

/** Adds songs to the end of On-The-Go; ones already in it stay where they are. */
export function addToGo(ids: string[]) {
  changeGo((list) => [...list, ...ids.filter((id) => !list.includes(id))]);
}

export function takeOffGo(id: string) {
  changeGo((list) => list.filter((s) => s !== id));
}

export function clearOnTheGo() {
  changeGo(() => []);
}
