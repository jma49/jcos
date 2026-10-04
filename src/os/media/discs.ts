// DVD Player's shelf, for Finder's Movies folder and DVD Player: the discs
// Jincheng has burned for everyone (the library's, library.ts) and the
// DVD-Rs this visitor has burned, which stay in this browser (os-dvds)
// and are never sent anywhere. Loaded with those apps, not the desktop.
//
// Burning reads a YouTube link the way the Telegram bot's /dvd does
// (supabase/functions/_shared/youtube.ts) and asks YouTube's oEmbed for
// the video's name, which also says whether it may be played here.
//
// Jincheng's discs arrive with the music (/api/songs), which the edge may
// keep for a minute, so Movies and DVD Player read the shelf again from
// the database as they open (at most every 30 s). What Jincheng changes
// on this page shows at once.

import { useEffect, useSyncExternalStore } from 'react';
import { clip, guessFromVideo, VIDEO_ID, videoIdOf } from '../../../supabase/functions/_shared/youtube.ts';
import type { Disc } from '../../lib/library';
import { report } from '../core/report';
import { loadJSON, onStored, updateJSON } from '../core/storage';
import { getSocial } from '../social/social';
import { applyDiscs, DISCS, useLibraryVersion } from './library';

export type { Disc };

/** A disc on the shelf: one of Jincheng's, or a DVD-R burned in this browser. */
export interface ShelfDisc extends Disc {
  /** A DVD-R this visitor burned here, which no one else has. */
  burnedHere?: boolean;
}

// ---------- Pictures and chapters ----------

/** The pictures a case may use, as the database names them. */
const PICTURE = /^(maxresdefault|sddefault|hqdefault|mqdefault|(maxres|sd|hq|mq)[1-3])$/;

/** The address of one of a video's own pictures on YouTube's image host. */
export const pictureOf = (id: string, name: string) => `https://i.ytimg.com/vi/${id}/${name}.jpg`;

/**
 * How far a case zooms its picture: YouTube's hq and sd pictures are 4:3,
 * with the video letterboxed in black, so they're zoomed until the bars
 * fall outside; the others are 16:9 already.
 */
export const zoomOf = (name: string) => (/^(hq|sd)/.test(name) ? 4 / 3 : 1);

/**
 * The pictures Burn offers for a case: the video's thumbnail, then frames
 * a quarter, half and three quarters of the way in, each full size where
 * YouTube has made one and the smaller size every video has otherwise.
 */
export const PICTURES = [
  ['maxresdefault', 'hqdefault'],
  ['maxres1', 'hq1'],
  ['maxres2', 'hq2'],
  ['maxres3', 'hq3']
] as const;

/** DVD Player splits a video into this many chapters of equal length. */
export const CHAPTERS = 4;

/** The pictures of a disc's chapters: its thumbnail, then YouTube's frames a quarter, half and three quarters in, where chapters 2 to 4 start. */
export const chapterPictures = (id: string) => ['hqdefault', 'hq1', 'hq2', 'hq3'].map((name) => pictureOf(id, name));

/** Where chapter `n` (from 0) starts, in seconds, in a video `duration` seconds long. */
export const chapterStart = (n: number, duration: number) => (duration * Math.min(CHAPTERS - 1, Math.max(0, n))) / CHAPTERS;

/** The chapter (from 0) playing at `time`; the first until the video's length is known. */
export const chapterAt = (time: number, duration: number) =>
  duration > 0 ? Math.min(CHAPTERS - 1, Math.max(0, Math.floor((time / duration) * CHAPTERS))) : 0;

/**
 * Whether YouTube has made a picture: asked with HEAD, so nothing is
 * downloaded (its image host lets any site ask), and a size it hasn't
 * made answers 404.
 */
export async function pictureExists(src: string, signal?: AbortSignal): Promise<boolean> {
  try {
    return (await fetch(src, { method: 'HEAD', signal })).ok;
  } catch {
    return false;
  }
}

/** The four pictures Burn offers for a video, by name. */
export function coverChoices(id: string, signal?: AbortSignal): Promise<string[]> {
  return Promise.all(PICTURES.map(async ([full, small]) => ((await pictureExists(pictureOf(id, full), signal)) ? full : small)));
}

// ---------- Reading a link ----------

export type Looked = { id: string; title: string; artist: string } | { error: string };

/**
 * A video's id and a first guess at its name, from a YouTube link: or why
 * it can't be burned. YouTube's oEmbed answers 401 or 403 for a video
 * whose owner doesn't let other sites play it. Throws when YouTube can't
 * be reached.
 */
export async function lookUpVideo(link: string, signal?: AbortSignal): Promise<Looked> {
  const id = videoIdOf(link);
  if (!id) return { error: 'That isn’t a link to a YouTube video.' };
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { signal });
  if (res.status === 401 || res.status === 403) return { error: 'Its owner doesn’t let other sites play it.' };
  if (!res.ok) return { error: 'YouTube doesn’t know that video (private, removed, or a typo?).' };
  const video = (await res.json()) as { title?: unknown; author_name?: unknown };
  return { id, ...guessFromVideo(String(video.title ?? ''), String(video.author_name ?? '')) };
}

// ---------- This visitor's own DVD-Rs ----------

const MINE_KEY = 'os-dvds';
/** A visitor's own DVD-Rs, at most this many (the oldest go first). */
export const MINE_MOST = 50;

/** A stored disc, if it still has the shape of one: storage can be stale or edited by hand. */
export function asDisc(value: unknown): Disc | null {
  const d = value as Partial<Disc> | null;
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !VIDEO_ID.test(d.id)) return null;
  if (typeof d.title !== 'string' || !d.title.trim() || typeof d.cover !== 'string' || !PICTURE.test(d.cover)) return null;
  return {
    id: d.id,
    title: clip(d.title),
    ...(typeof d.artist === 'string' && d.artist.trim() ? { artist: clip(d.artist) } : {}),
    cover: d.cover,
    coverX: typeof d.coverX === 'number' && d.coverX >= 0 && d.coverX <= 100 ? Math.round(d.coverX) : 50,
    ...(typeof d.duration === 'number' && d.duration >= 1000 ? { duration: Math.round(d.duration) } : {}),
    added: typeof d.added === 'string' && !Number.isNaN(Date.parse(d.added)) ? d.added : new Date(0).toISOString()
  };
}

const listOf = (stored: unknown) => (Array.isArray(stored) ? stored : []).map(asDisc).filter((d): d is Disc => d !== null);

let mine = listOf(loadJSON<unknown>(MINE_KEY, []));
let mineVersion = 0;
const listeners = new Set<() => void>();
function mineChanged() {
  mineVersion++;
  listeners.forEach((listener) => listener());
}

// DVD-Rs burned or thrown away in this visitor's other tabs.
onStored(MINE_KEY, () => {
  mine = listOf(loadJSON<unknown>(MINE_KEY, []));
  mineChanged();
});

/** Changes the DVD-Rs as stored now, so another tab's burn stands. */
function changeMine(change: (list: Disc[]) => Disc[]) {
  mine = updateJSON<Disc[]>(MINE_KEY, [], (stored) => change(listOf(stored)));
  mineChanged();
}

/** A disc about to be burned, as Burn filled it in. */
export type Draft = Omit<Disc, 'added' | 'duration'>;

/** A draft within the shelf's limits: its name trimmed, its crop whole. Throws for one that isn't a disc. */
export function burnable(draft: Draft): Draft {
  const title = clip(draft.title);
  const artist = draft.artist ? clip(draft.artist) : '';
  if (!VIDEO_ID.test(draft.id) || !PICTURE.test(draft.cover)) throw new Error('That isn’t a video that can be burned.');
  if (!title) throw new Error('Give the disc a name.');
  return { id: draft.id, title, ...(artist ? { artist } : {}), cover: draft.cover, coverX: Math.round(Math.min(100, Math.max(0, draft.coverX))) };
}

/** Keeps a DVD-R burned here, in place of one of the same video. */
export function burnHere(draft: Draft): ShelfDisc {
  const kept: Disc = { ...burnable(draft), added: new Date().toISOString() };
  changeMine((list) => [...list.filter((d) => d.id !== kept.id), kept].slice(-MINE_MOST));
  return { ...kept, burnedHere: true };
}

export function throwAwayHere(id: string) {
  changeMine((list) => list.filter((d) => d.id !== id));
}

// ---------- The shelf ----------

/** Every disc on this visitor's shelf: Jincheng's, then their own DVD-Rs. */
export function shelf(): ShelfDisc[] {
  return [...DISCS, ...mine.map((d) => ({ ...d, burnedHere: true }))];
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

let built: { library: number; own: number; discs: ShelfDisc[] } | null = null;

/** The shelf, made again only when either part has changed, so every view gets the same list. */
function shelfAt(library: number, own: number): ShelfDisc[] {
  if (!built || built.library !== library || built.own !== own) built = { library, own, discs: shelf() };
  return built.discs;
}

/** The shelf, for a view that shows it: it renders again when either part changes. */
export function useShelf(): ShelfDisc[] {
  const library = useLibraryVersion();
  const own = useSyncExternalStore(subscribe, () => mineVersion, () => mineVersion);
  return shelfAt(library, own);
}

/** How long a fresh read of Jincheng's shelf stands before it's read again. */
const FRESH_MS = 30_000;
let freshAt = 0;
let reading: Promise<void> | null = null;
/** Changes made on this page: a read that started before one is out of date. */
let writes = 0;

const same = (a: Disc[], b: Disc[]) => JSON.stringify(a) === JSON.stringify(b);

/** Reads Jincheng's shelf from the database, at most every 30 s; a failed read is skipped. */
export function readShelf(): Promise<void> {
  if (reading) return reading;
  if (Date.now() - freshAt < FRESH_MS) return Promise.resolve();
  const at = writes;
  reading = getSocial()
    .then(async (social) => {
      const discs = social ? await social.shelf() : null;
      if (!discs || at !== writes) return;
      freshAt = Date.now();
      if (!same(discs, DISCS)) applyDiscs(discs);
    })
    .catch((error) => report(error, 'discs.read'))
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** For Movies and DVD Player: while `active`, the shelf is read fresh, and again when the tab comes back. */
export function useShelfRefresh(active = true) {
  useEffect(() => {
    if (!active) return;
    void readShelf();
    const onVisible = () => document.visibilityState === 'visible' && void readShelf();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);
}

/**
 * Puts a change on the shelf now, one Jincheng made on this page or one
 * Realtime told of (discWatch.ts): a read that started before it is
 * dropped, so it can't put the old shelf back, and the next read confirms it.
 */
export function changeShelf(discs: Disc[]) {
  writes++;
  freshAt = 0;
  applyDiscs(discs);
}

/**
 * Discs burned for everyone from this page: Realtime tells this page of
 * them too, perhaps before the burn has answered, and the one who burned
 * it needn't be told (discWatch.ts).
 */
export const burnedOnThisPage = new Set<string>();

/** Burns a disc for everyone (the database lets only Jincheng). */
export async function burnForEveryone(draft: Draft): Promise<ShelfDisc> {
  const disc = burnable(draft);
  const social = await getSocial();
  if (!social) throw new Error('Discs for everyone need the database, which isn’t here.');
  burnedOnThisPage.add(disc.id);
  try {
    const burned = await social.burnDisc(disc);
    changeShelf([...DISCS.filter((d) => d.id !== burned.id), burned]);
    return burned;
  } catch (error) {
    burnedOnThisPage.delete(disc.id);
    throw error;
  }
}

/** Takes one of Jincheng's discs off everyone's shelf (the database lets only Jincheng). */
export async function throwAwayForEveryone(id: string) {
  const social = await getSocial();
  if (!social) throw new Error('Discs for everyone need the database, which isn’t here.');
  await social.removeDisc(id);
  changeShelf(DISCS.filter((d) => d.id !== id));
}

/** How far a kept length may be from the player's before it's put right: YouTube's own rounding. */
const LENGTH_SLACK_MS = 2000;

/**
 * Notes a disc's length once DVD Player knows it: a DVD-R's in this
 * browser, one of Jincheng's in the database when the owner is watching.
 * One kept already is put right if it's off (DVD Player once gave a disc
 * the length of the one before it).
 */
export function noteLength(disc: ShelfDisc, duration: number, owner: boolean) {
  const ms = Math.round(duration * 1000);
  if (ms < 1000 || ms > 86_400_000 || (disc.duration && Math.abs(disc.duration - ms) <= LENGTH_SLACK_MS)) return;
  if (disc.burnedHere) {
    const kept = mine.find((d) => d.id === disc.id);
    if (kept && !(kept.duration && Math.abs(kept.duration - ms) <= LENGTH_SLACK_MS)) {
      changeMine((list) => list.map((d) => (d.id === disc.id ? { ...d, duration: ms } : d)));
    }
    return;
  }
  if (!owner) return;
  void getSocial()
    .then((social) => social?.relabelDisc(disc.id, { duration: ms }))
    .then(() => changeShelf(DISCS.map((d) => (d.id === disc.id ? { ...d, duration: ms } : d))))
    .catch((error) => report(error, 'discs.duration'));
}
