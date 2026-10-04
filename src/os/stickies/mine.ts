// A member's own stickies: the notes on their desktop that only they see
// (public.stickies, supabase/migrations/20260929194437_stickies_of_their_own.sql;
// the Stickies wall is the other, public, kind). Read when the member signs
// in, at most every 30 s while something shows them and again when the tab
// comes back, and changed here as the member puts one up, moves it, types
// into it or takes it down, so the desktop and Stickies › Yours show it at
// once. Signing out, or in as someone else, takes them away at once.
// Loaded once someone is signed in, not with the desktop.

import { useEffect, useSyncExternalStore } from 'react';
import { report } from '../core/report';
import { loadJSON, saveJSON } from '../core/storage';
import { MENU_BAR_HEIGHT, type Viewport } from '../core/store';
import { getSocial } from '../social/social';
import type { Sticky, StickyChange } from '../social/types';

export type { Sticky, StickyChange };

let mine: { account: string | null; stickies: Sticky[] } = { account: null, stickies: [] };
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

/** The member's stickies as they are now, for a view: it renders again when they change. */
export function useMyStickies() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
  return mine.stickies;
}

/** The member's stickies as they are now, outside a view. */
export const myStickiesNow = () => mine.stickies;

// ---------- Reading ----------

/** How long a read stands before the database is asked again. */
const FRESH_MS = 30_000;
let freshAt = 0;
let reading: { account: string; done: Promise<void> } | null = null;
/** Whose stickies were last asked for: a read for someone else since is dropped. */
let asked: string | null = null;
/** Changes made on this page, counted as each begins and ends: a read that started before one is dropped. */
let writes = 0;

/**
 * Reads the stickies of `account` (the signed-in member's id, or null
 * when no one is). At most every 30 s; a failed read is skipped. Another
 * account's, or none, take the last one's away at once, without waiting.
 */
export function readMine(account: string | null, { now = false } = {}): Promise<void> {
  asked = account;
  if (mine.account !== account) {
    mine = { account, stickies: [] };
    freshAt = 0;
    changed();
  }
  if (!account) return Promise.resolve();
  if (reading?.account === account) return reading.done;
  if (!now && Date.now() - freshAt < FRESH_MS) return Promise.resolve();
  const at = writes;
  const done = getSocial()
    .then(async (social) => {
      const read = social ? await social.myStickies() : null;
      if (!read || at !== writes || asked !== account) return;
      freshAt = Date.now();
      mine = { account, stickies: read };
      changed();
    })
    .catch((error) => report(error, 'stickies.read'))
    .finally(() => {
      if (reading?.done === done) reading = null;
    });
  reading = { account, done };
  return done;
}

/** For the desktop and Stickies: while `account` is signed in, their stickies are read, and again when the tab comes back. */
export function useMineRefresh(account: string | null) {
  useEffect(() => {
    void readMine(account);
    if (!account) return;
    const onVisible = () => document.visibilityState === 'visible' && void readMine(account);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [account]);
}

// ---------- Changing ----------

async function database() {
  const social = await getSocial();
  if (!social) throw new Error('Stickies of your own need the database, which isn’t here.');
  return social;
}

/**
 * The member's other tabs in this browser: told of each change, they read
 * again at once (the database has it), so two windows side by side agree.
 */
const tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('os-stickies');
if (tabs) tabs.onmessage = ({ data }) => data?.account && data.account === mine.account && void readMine(data.account, { now: true });

/** Runs a change, counting it as a write both ways, so no read from before it lands after, and tells the other tabs. */
async function writing<T>(write: () => Promise<T>): Promise<T> {
  writes++;
  try {
    return await write();
  } finally {
    writes++;
    freshAt = 0;
    tabs?.postMessage({ account: mine.account });
  }
}

/** Puts a sticky as the database has it now in place of the one with its id. */
function put(sticky: Sticky) {
  mine = { ...mine, stickies: mine.stickies.map((s) => (s.id === sticky.id ? sticky : s)) };
  changed();
}

/** Where a new sticky goes: down and across from the last, as Tiger's did, back at the top after eight. */
export function nextPlace(count: number): Pick<Sticky, 'x' | 'y'> {
  const step = count % 8;
  return { x: 40 + step * 28 + Math.floor(count / 8) * 240, y: 48 + step * 28 };
}

/**
 * Where a sticky of `width` at (x, y) shows on a screen of `viewport`'s
 * size: under the menu bar, with at least its strip in reach. Only how
 * it's shown: where it was left is kept for the screen it was left on.
 */
export function onScreen(x: number, y: number, width: number, { width: vw, height: vh }: Viewport): Pick<Sticky, 'x' | 'y'> {
  return {
    x: Math.round(Math.min(Math.max(0, x), Math.max(0, vw - Math.min(width, 80)))),
    y: Math.round(Math.min(Math.max(MENU_BAR_HEIGHT + 2, y), Math.max(MENU_BAR_HEIGHT + 2, vh - 40)))
  };
}

/** Puts up a new sticky of the member's own, empty, where the next one goes. */
export async function addSticky(change: StickyChange = {}): Promise<Sticky> {
  // The database's limit (asked once a page); it refuses past it anyway.
  const most = (await (await database()).limits())?.stickies;
  if (most !== undefined && mine.stickies.length >= most) throw new Error(`You have ${most} stickies already. Close one first.`);
  const made = await writing(async () => (await database()).addSticky({ ...nextPlace(mine.stickies.length), ...change }));
  mine = { ...mine, stickies: [...mine.stickies.filter((s) => s.id !== made.id), made] };
  changed();
  return made;
}

/**
 * Moves, sizes, colours or rolls up a sticky: shown at once, saved after.
 * Refused, it goes back to where the database has it.
 */
export async function placeSticky(id: string, change: Omit<StickyChange, 'body'>): Promise<void> {
  mine = { ...mine, stickies: mine.stickies.map((s) => (s.id === id ? { ...s, ...change } : s)) };
  changed();
  try {
    put(await writing(async () => (await database()).changeSticky(id, change)));
  } catch (error) {
    void readMine(mine.account, { now: true });
    throw error;
  }
}

/** Saves a sticky's text, from the version it was typed over; refused ('conflict') if it was saved elsewhere since. */
export async function writeSticky(id: string, body: string, version: number): Promise<Sticky> {
  const saved = await writing(async () => (await database()).changeSticky(id, { body }, version));
  put(saved);
  return saved;
}

/** Takes a sticky down. */
export async function removeSticky(id: string): Promise<void> {
  await writing(async () => (await database()).removeSticky(id));
  mine = { ...mine, stickies: mine.stickies.filter((s) => s.id !== id) };
  dropDraft(id);
  changed();
}

/** Reads the stickies again now, after a save was refused: the newer copy is then in `myStickiesNow()`. */
export const latest = () => readMine(mine.account, { now: true });

// ---------- Drafts ----------

/**
 * What's typed into a sticky and not saved yet, kept in this browser until
 * it is, so a closed tab or a dropped connection loses nothing. Every tab
 * shares them.
 */
const DRAFTS_KEY = 'os-sticky-drafts';

export interface Draft {
  body: string;
  /** The version it was typed over. */
  version: number;
}

function drafts(): Record<string, unknown> {
  const stored = loadJSON<unknown>(DRAFTS_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
}

/** Changes the drafts from what's stored now, as another tab may have changed them. */
function changeDrafts(change: (stored: Record<string, unknown>) => void) {
  const stored = drafts();
  change(stored);
  saveJSON(DRAFTS_KEY, stored);
}

export const draftOf = (id: string): Draft | undefined => {
  const draft = drafts()[id] as Draft | undefined;
  return draft && typeof draft.body === 'string' && Number.isInteger(draft.version) ? draft : undefined;
};

export function keepDraft(id: string, draft: Draft) {
  changeDrafts((stored) => void (stored[id] = draft));
}

export function dropDraft(id: string) {
  changeDrafts((stored) => void delete stored[id]);
}
