// What's playing, for the iPod and Karaoke: one "now playing" both share.
// Each app has its own YouTube player (player.ts), and the app the visitor
// last played from owns playback. Taking it over carries the song and the
// position across, so a song started on the iPod continues in Karaoke where
// it was.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useWindows } from '../core/store';
import { loadSettings, saveJSON } from '../core/storage';
import { SONGS } from './library';

/** Every song, as a queue. */
const EVERYTHING = SONGS.map((_, i) => i);

export type MusicApp = 'ipod' | 'karaoke';
export type Repeat = 'off' | 'all' | 'one';

/** Pressing play asks for sound, so it turns the desktop's sounds on if they're off. */
function soundOnToPlay() {
  const { soundOn, setSound } = useWindows.getState();
  if (!soundOn) setSound(true);
}

const OFFSETS_KEY = 'os-lyric-offsets';
const SETTINGS_KEY = 'os-music';

export interface MusicStore {
  /** The current song, an index into SONGS. */
  index: number;
  /** What ⏭ and ⏮ step through: an album, an artist or everything (indexes into SONGS). */
  queue: number[];
  playing: boolean;
  /** The app whose player has the current song; null until something plays. */
  owner: MusicApp | null;
  /** Where the previous owner left off, for the next one to pick up. */
  resume: { index: number; time: number } | null;
  shuffle: boolean;
  repeat: Repeat;
  /** 0 to 100, as YouTube counts it. */
  volume: number;
  /** The visitor's own lyric timing tweaks, in ms per song, on top of Song.offset. */
  offsets: Record<string, number>;

  /** Plays from `app`: the song at `index`, or the current one; `queue` is what follows it. */
  play: (app: MusicApp, index?: number, queue?: number[]) => void;
  /** Play/pause from `app`, taking over playback if another app had it. */
  toggle: (app: MusicApp) => void;
  pause: () => void;
  /** The next song. `ended` is true when the last one finished by itself. */
  next: (app: MusicApp, ended?: boolean) => void;
  previous: (app: MusicApp) => void;
  setShuffle: (on: boolean) => void;
  setRepeat: (repeat: Repeat) => void;
  setVolume: (volume: number) => void;
  nudge: (id: string, ms: number) => void;
}

/** Each mounted player's clock, so a new owner can pick up at the right second. */
export const clocks = new Map<MusicApp, () => number>();
/** Each mounted player's song length. */
export const durations = new Map<MusicApp, () => number>();

/** The playing position of whichever app owns playback, in seconds. */
export function currentTime() {
  const { owner } = useMusic.getState();
  return (owner && clocks.get(owner)?.()) || 0;
}

const settings = loadSettings(SETTINGS_KEY, { shuffle: false, repeat: 'all' as Repeat, volume: 80 });

export const useMusic = create<MusicStore>((set, get) => {
  /** The change that makes `app` the owner, noting where the old owner was. */
  const claim = (app: MusicApp): Partial<MusicStore> => {
    const { owner, index } = get();
    return owner && owner !== app ? { owner: app, resume: { index, time: clocks.get(owner)?.() ?? 0 } } : { owner: app };
  };
  const save = () => {
    const { shuffle, repeat, volume } = get();
    saveJSON(SETTINGS_KEY, { shuffle, repeat, volume });
  };
  /** Another song from the queue, at random. */
  const randomOther = (index: number, queue: number[]) => {
    const others = queue.filter((i) => i !== index);
    return others.length ? others[Math.floor(Math.random() * others.length)] : index;
  };
  /** The song `step` places along the queue from `index`, wrapping round. */
  const along = (index: number, queue: number[], step: number) => {
    const at = queue.indexOf(index);
    return queue[(Math.max(0, at) + step + queue.length) % queue.length];
  };

  return {
    index: 0,
    queue: EVERYTHING,
    playing: false,
    owner: null,
    resume: null,
    shuffle: settings.shuffle,
    repeat: settings.repeat,
    volume: settings.volume,
    offsets: loadSettings<Record<string, number>>(OFFSETS_KEY, {}),

    play: (app, index = get().index, queue) => {
      soundOnToPlay();
      // A different song starts from the top; the same one carries on.
      set({ ...claim(app), ...(index !== get().index ? { resume: null } : {}), ...(queue ? { queue } : {}), index, playing: true });
    },
    toggle: (app) => {
      const { owner, playing } = get();
      if (owner !== app) return get().play(app);
      if (!playing) soundOnToPlay();
      set({ playing: !playing });
    },
    pause: () => set({ playing: false }),
    next: (app, ended = false) => {
      const { index, queue, shuffle, repeat } = get();
      const owner = { ...claim(app), resume: null };
      if (shuffle) return set({ ...owner, index: randomOther(index, queue), playing: true });
      const last = queue.indexOf(index) === queue.length - 1;
      // The end of the queue stops (back at its start), unless it repeats.
      if (ended && last && repeat === 'off') return set({ ...owner, index: queue[0], playing: false });
      set({ ...owner, index: along(index, queue, 1), ...(ended ? { playing: true } : {}) });
    },
    previous: (app) => {
      const { index, queue, owner } = get();
      // Like an iPod: a few seconds in, ⏮ goes back to the start of this song.
      if (owner === app && (clocks.get(app)?.() ?? 0) > 3) return set({ resume: { index, time: 0 } });
      set({ ...claim(app), resume: null, index: along(index, queue, -1) });
    },
    setShuffle: (shuffle) => {
      set({ shuffle });
      save();
    },
    setRepeat: (repeat) => {
      set({ repeat });
      save();
    },
    setVolume: (volume) => {
      set({ volume: Math.round(Math.min(100, Math.max(0, volume))) });
      save();
    },
    nudge: (id, ms) => {
      const offsets = { ...get().offsets, [id]: (get().offsets[id] ?? 0) + ms };
      set({ offsets });
      saveJSON(OFFSETS_KEY, offsets);
    }
  };
});

/**
 * The owner's playing position and the song's length, in seconds, polled a
 * few times a second while mounted.
 */
export function useClock(every = 250) {
  const [clock, setClock] = useState({ time: 0, duration: 0 });
  useEffect(() => {
    const tick = () => {
      const { owner } = useMusic.getState();
      const time = currentTime();
      const duration = owner ? (durations.get(owner)?.() ?? 0) : 0;
      setClock((c) => (Math.abs(c.time - time) < 0.01 && c.duration === duration ? c : { time, duration }));
    };
    tick();
    const timer = setInterval(tick, every);
    return () => clearInterval(timer);
  }, [every]);
  return clock;
}

let lastSeek = { at: 0, to: 0 };

/** Seeks the owner's player. */
export function seek(seconds: number) {
  const { owner, index } = useMusic.getState();
  if (!owner) return;
  lastSeek = { at: Date.now(), to: Math.max(0, seconds) };
  useMusic.setState({ resume: { index, time: lastSeek.to } });
}

/** Seeks by `delta` seconds. YouTube reports the old position for a moment after a seek, so quick presses add up from the last target. */
export function seekBy(delta: number) {
  const recent = Date.now() - lastSeek.at < 1000;
  seek((recent ? lastSeek.to : currentTime()) + delta);
}

export const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
