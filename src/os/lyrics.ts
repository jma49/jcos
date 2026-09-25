// Time-synced lyrics from lrclib.net, a free, open lyrics database that
// needs no key and answers browsers directly. Its entries are crowd-sourced,
// so a search can turn up junk or a different edit of the song: we keep the
// synced ones with real content and prefer the one whose length matches the
// video's. A song can pin an entry by id (Song.lyrics) when that still picks
// wrong. Songs lrclib doesn't have (older Mandarin ones, mostly) are looked
// up on NetEase Cloud Music through our own /api/lyrics, since NetEase
// doesn't answer browsers.

import { useEffect, useState } from 'react';
import type { Song } from './music';

export interface LyricLine {
  /** Seconds from the start of the song. */
  time: number;
  /** Empty for an instrumental break. */
  text: string;
}

interface Entry {
  id: number;
  duration: number;
  syncedLyrics: string | null;
}

interface Candidate {
  duration: number;
  lines: LyricLine[];
}

const API = 'https://lrclib.net/api';

/** "[01:23.45] text" lines into sorted LyricLines; a line may carry several stamps. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const [, m, s] of stamps) lines.push({ time: Number(m) * 60 + Number(s), text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

const toCandidate = (e: Entry): Candidate | null => {
  if (!e.syncedLyrics) return null;
  const lines = parseLrc(e.syncedLyrics);
  // A handful of lines is a placeholder or a test upload, not lyrics.
  return lines.filter((l) => l.text).length >= 6 ? { duration: e.duration, lines } : null;
};

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

const cache = new Map<string, Promise<Candidate[]>>();

/** Every usable lyrics entry for a song; cached for the visit. */
function candidates(song: Song): Promise<Candidate[]> {
  let hit = cache.get(song.id);
  if (!hit) {
    hit = (async () => {
      if (song.lyrics) {
        const entry = await getJson<Entry>(`${API}/get/${song.lyrics}`);
        const one = entry && toCandidate(entry);
        if (one) return [one];
      }
      const exact = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
      let found = (await getJson<Entry[]>(`${API}/search?${exact}`)) ?? [];
      if (!found.some((e) => e.syncedLyrics)) {
        found = (await getJson<Entry[]>(`${API}/search?${new URLSearchParams({ q: `${song.artist} ${song.title}` })}`)) ?? [];
      }
      const usable = found.map(toCandidate).filter((c): c is Candidate => c !== null);
      if (usable.length) return usable;
      const relayed = await getJson<{ duration: number; lrc: string }>(
        `/api/lyrics?${new URLSearchParams({ title: song.title, artist: song.artist })}`
      ).catch(() => null);
      const one = relayed && toCandidate({ id: 0, duration: relayed.duration, syncedLyrics: relayed.lrc });
      return one ? [one] : [];
    })();
    // A failed lookup can be tried again next time.
    hit.catch(() => cache.delete(song.id));
    cache.set(song.id, hit);
  }
  return hit;
}

/** The entry to use: the one closest in length to the video, else lrclib's first. */
function pick(list: Candidate[], duration: number): LyricLine[] | null {
  if (!list.length) return null;
  if (!duration) return list[0].lines;
  return [...list].sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration))[0].lines;
}

export type Lyrics = { state: 'loading' } | { state: 'none' } | { state: 'instrumental' } | { state: 'ready'; lines: LyricLine[] };

/** The lyrics for a song, given the video's length once it's known (0 before). */
export function useLyrics(song: Song, duration: number): Lyrics {
  const [list, setList] = useState<{ id: string; found: Candidate[] | null } | null>(null);
  useEffect(() => {
    if (song.instrumental) return;
    let live = true;
    candidates(song).then(
      (found) => live && setList({ id: song.id, found }),
      () => live && setList({ id: song.id, found: null })
    );
    return () => {
      live = false;
    };
  }, [song]);
  if (song.instrumental) return { state: 'instrumental' };
  if (!list || list.id !== song.id) return { state: 'loading' };
  const lines = list.found && pick(list.found, Math.round(duration));
  return lines ? { state: 'ready', lines } : { state: 'none' };
}

/** The index of the line being sung at `time`, or -1 before the first. */
export function lineAt(lines: LyricLine[], time: number) {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
