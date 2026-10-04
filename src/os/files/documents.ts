// Jincheng's home folder: the documents and the diary behind Users ›
// jincheng in Finder and TextEdit's windows (the tables are in
// supabase/migrations/20260929160000_home.sql). Read when either opens, at
// most every 30 s and again when the tab comes back, and changed here as
// Jincheng saves, so Finder and every TextEdit window show a save at once;
// the owner's other tabs are told of it and read again (an `os-home`
// BroadcastChannel, as stickies' and iCal's). Anyone but the owner gets
// only what's in Public, and what was the owner's goes the moment the
// owner signs out. Loaded with Finder and TextEdit, not with the desktop.

import { useEffect, useSyncExternalStore } from 'react';
import { report } from '../core/report';
import { loadJSON, updateJSON } from '../core/storage';
import { getSocial } from '../social/social';
import type { DiaryEntry, DocumentDraft, EntryDraft, Home, HomeDocument, HomeFolder } from '../social/types';

export type { DiaryEntry, HomeDocument, HomeFolder };

let home: Home & { owner: boolean } = { documents: [], diary: [], owner: false };
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

/** The home folder as it is now, for a view: it renders again when it changes. */
export function useHome() {
  useSyncExternalStore(subscribe, () => version, () => version);
  return home;
}

/** The home folder as it is now, outside a view. */
export const homeNow = () => home;

// ---------- Reading ----------

/** How long a read stands before the database is asked again. */
const FRESH_MS = 30_000;
let freshAt = 0;
let reading: { owner: boolean; done: Promise<void> } | null = null;
/** Whose home was last asked for: a read for someone else since is dropped. */
let asked = false;
/** Saves made on this page, counted as each begins and ends: a read that started before one is dropped. */
let writes = 0;

/**
 * Reads the home folder, as the owner (everything) or not (Public). At most
 * every 30 s for the same reader; a failed read is skipped. Signing out
 * takes the owner's documents and diary away at once, without waiting.
 */
export function readHome(owner: boolean, { now = false } = {}): Promise<void> {
  asked = owner;
  if (!owner && home.owner) {
    home = { documents: home.documents.filter((d) => d.folder === 'public'), diary: [], owner: false };
    freshAt = 0;
    changed();
  }
  if (reading?.owner === owner) return reading.done;
  if (!now && home.owner === owner && Date.now() - freshAt < FRESH_MS) return Promise.resolve();
  const at = writes;
  const done = getSocial()
    .then(async (social) => {
      const read = social ? await social.home(owner) : null;
      if (!read || at !== writes || asked !== owner) return;
      freshAt = Date.now();
      home = { ...read, owner };
      changed();
    })
    .catch((error) => report(error, 'documents.read'))
    .finally(() => {
      if (reading?.done === done) reading = null;
    });
  reading = { owner, done };
  return done;
}

/**
 * Reads the home folder while something shows it: now, again when the tab
 * comes back, and at once when another tab changes it. Returns what stops
 * it, for when it's no longer shown.
 */
export function watchHome(owner: boolean): () => void {
  void readHome(owner);
  const onVisible = () => document.visibilityState === 'visible' && void readHome(owner);
  const onOther = () => void readHome(owner, { now: true });
  document.addEventListener('visibilitychange', onVisible);
  otherTabs.add(onOther);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    otherTabs.delete(onOther);
  };
}

/** For Finder and TextEdit: while open, the home folder is read fresh, and again when the tab comes back or another tab changes it. */
export function useHomeRefresh(active: boolean, owner: boolean) {
  useEffect(() => (active ? watchHome(owner) : undefined), [active, owner]);
}

// ---------- Saving ----------

async function database() {
  const social = await getSocial();
  if (!social) throw new Error('Jincheng’s home folder needs the database, which isn’t here.');
  return social;
}

/**
 * The owner's other tabs in this browser: told of each change, a tab
 * showing the home folder reads it again at once (the database has it), so
 * two windows side by side agree, and one that isn't reads it next time
 * something shows it. Reading tells no one, so nothing loops.
 */
const otherTabs = new Set<() => void>();
const tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('os-home');
if (tabs) {
  tabs.onmessage = () => {
    freshAt = 0;
    otherTabs.forEach((read) => read());
  };
}

/** Runs a save, counting it as a write both ways, so no read from before it lands after, and tells the other tabs. */
async function writing<T>(write: () => Promise<T>): Promise<T> {
  writes++;
  try {
    return await write();
  } finally {
    writes++;
    freshAt = 0;
    tabs?.postMessage('changed');
  }
}

/** Puts a document as the database has it now in place of the one with its id, or adds it. */
function put(saved: HomeDocument) {
  const others = home.documents.filter((d) => d.id !== saved.id);
  home = { ...home, documents: [...others, saved] };
  changed();
}

/**
 * Saves one of Jincheng's documents (the database lets only the owner):
 * a new one without an id, else a save made from `version`. A save from an
 * older copy is refused (SocialError 'conflict'); `latest()` then has
 * what the database has.
 */
export async function saveDocument(draft: DocumentDraft): Promise<HomeDocument> {
  const saved = await writing(async () => (await database()).saveDocument(draft));
  put(saved);
  return saved;
}

export async function deleteDocument(id: string) {
  await writing(async () => (await database()).deleteDocument(id));
  home = { ...home, documents: home.documents.filter((d) => d.id !== id) };
  changed();
}

/** Saves a diary entry, as saveDocument does a document; `onSaved` hears of it just before the views do. */
export async function saveEntry(draft: EntryDraft, onSaved?: (entry: DiaryEntry) => void): Promise<DiaryEntry> {
  const saved = await writing(async () => (await database()).saveEntry(draft));
  onSaved?.(saved);
  home = { ...home, diary: [...home.diary.filter((e) => e.id !== saved.id), saved] };
  changed();
  return saved;
}

export async function deleteEntry(id: string) {
  await writing(async () => (await database()).deleteEntry(id));
  home = { ...home, diary: home.diary.filter((e) => e.id !== id) };
  changed();
}

/** Reads the home folder again now, after a save was refused: the newer copy is then in `homeNow()`. */
export const latest = (owner: boolean) => readHome(owner, { now: true });

// ---------- What Finder and TextEdit show ----------

/** The home's folders, as Finder lists them, and which of them anyone may open. */
export const HOME_FOLDERS: { key: HomeFolder | 'sites'; name: string; open?: true }[] = [
  { key: 'desktop', name: 'Desktop' },
  { key: 'documents', name: 'Documents' },
  { key: 'downloads', name: 'Downloads' },
  { key: 'library', name: 'Library' },
  { key: 'movies', name: 'Movies' },
  { key: 'music', name: 'Music' },
  { key: 'pictures', name: 'Pictures' },
  { key: 'public', name: 'Public', open: true },
  { key: 'sites', name: 'Sites', open: true }
];

/** Today in this device's own time zone, as a diary day (YYYY-MM-DD). */
export function today(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The years with a diary, newest first, this one always among them (a diary to start). */
export function diaryYears(diary: DiaryEntry[], now = new Date()) {
  const years = new Set(diary.map((e) => Number(e.day.slice(0, 4))));
  years.add(now.getFullYear());
  return [...years].sort((a, b) => b - a);
}

/** A year's diary, as TextEdit shows it: the days newest first, each day's entries in the order they were written. */
export function diaryOf(diary: DiaryEntry[], year: number) {
  const days = new Map<string, DiaryEntry[]>();
  for (const entry of diary) {
    if (!entry.day.startsWith(`${year}-`)) continue;
    days.set(entry.day, [...(days.get(entry.day) ?? []), entry]);
  }
  return [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, entries]) => ({ day, entries: entries.sort((a, b) => a.created.localeCompare(b.created)) }));
}

/** A name for a new document in `folder` that no other there has: "Untitled.txt", then "Untitled 2.txt"… */
export function newName(documents: HomeDocument[], folder: HomeFolder, base = 'Untitled', extension = '.txt') {
  const taken = new Set(documents.filter((d) => d.folder === folder).map((d) => d.name.toLowerCase()));
  let name = `${base}${extension}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}${extension}`;
  return name;
}

// ---------- Drafts ----------

/**
 * What's typed in TextEdit and not saved yet, kept in this browser until
 * it is, by document (or diary entry) id, so a closed tab or a dropped
 * connection loses nothing. Every tab of the owner's shares them.
 */
const DRAFTS_KEY = 'os-textedit-drafts';

export interface Draft {
  body: string;
  /** The version it was typed over, to tell whether the saved one has moved on since. */
  version: number;
}

type Drafts = Record<string, Draft>;

const drafts = () => {
  const stored = loadJSON<unknown>(DRAFTS_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Drafts) : {};
};

export const draftOf = (key: string): Draft | undefined => {
  const draft = drafts()[key];
  return draft && typeof draft.body === 'string' && Number.isInteger(draft.version) ? draft : undefined;
};

export function keepDraft(key: string, draft: Draft) {
  updateJSON<Drafts>(DRAFTS_KEY, {}, (stored) => ({ ...stored, [key]: draft }));
}

export function dropDraft(key: string) {
  updateJSON<Drafts>(DRAFTS_KEY, {}, (stored) => {
    const rest = { ...stored };
    delete rest[key];
    return rest;
  });
}
