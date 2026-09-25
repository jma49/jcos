// Music for the iPod and Karaoke apps: a small library of YouTube videos
// (src/data/songs.json, curated by hand: singles and whole albums), played
// through YouTube's IFrame API. Both apps share one "now playing": each has its own player, and the
// app the visitor last played from owns playback. Taking it over carries the
// song and the position across, so a song started on the iPod continues in
// Karaoke where it was.

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import library from '../data/songs.json' with { type: 'json' };

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

/** Every song, as a queue. */
const EVERYTHING = SONGS.map((_, i) => i);

export type MusicApp = 'ipod' | 'karaoke';
export type Repeat = 'off' | 'all' | 'one';

/** Square cover art for a song; the video's thumbnail when there's none. */
export const coverOf = (song: Song) => song.cover ?? albumOf(song)?.cover ?? `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`;

const OFFSETS_KEY = 'os-lyric-offsets';
const SETTINGS_KEY = 'os-music';

function read<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

interface MusicStore {
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
const clocks = new Map<MusicApp, () => number>();
/** Each mounted player's song length. */
const durations = new Map<MusicApp, () => number>();

/** The playing position of whichever app owns playback, in seconds. */
export function currentTime() {
  const { owner } = useMusic.getState();
  return (owner && clocks.get(owner)?.()) || 0;
}

const settings = typeof window === 'undefined' ? null : read(SETTINGS_KEY, { shuffle: false, repeat: 'all' as Repeat, volume: 80 });

export const useMusic = create<MusicStore>((set, get) => {
  /** The change that makes `app` the owner, noting where the old owner was. */
  const claim = (app: MusicApp): Partial<MusicStore> => {
    const { owner, index } = get();
    return owner && owner !== app ? { owner: app, resume: { index, time: clocks.get(owner)?.() ?? 0 } } : { owner: app };
  };
  const save = () => {
    const { shuffle, repeat, volume } = get();
    write(SETTINGS_KEY, { shuffle, repeat, volume });
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
    shuffle: settings?.shuffle ?? false,
    repeat: settings?.repeat ?? 'all',
    volume: settings?.volume ?? 80,
    offsets: typeof window === 'undefined' ? {} : read<Record<string, number>>(OFFSETS_KEY, {}),

    play: (app, index = get().index, queue) => {
      // A different song starts from the top; the same one carries on.
      set({ ...claim(app), ...(index !== get().index ? { resume: null } : {}), ...(queue ? { queue } : {}), index, playing: true });
    },
    toggle: (app) => {
      const { owner, playing } = get();
      if (owner !== app) return get().play(app);
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
      write(OFFSETS_KEY, offsets);
    }
  };
});

let sessionWatched = false;

/**
 * Tells the browser what's playing (Media Session API), for the media keys
 * and the system's now-playing controls, and routes those keys to the app
 * that's playing. Call once.
 */
export function watchMediaSession() {
  if (sessionWatched || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  sessionWatched = true;
  const session = navigator.mediaSession;
  const act = (fn: (s: MusicStore, app: MusicApp) => void) => () => {
    const s = useMusic.getState();
    if (s.owner) fn(s, s.owner);
  };
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', act((s, app) => !s.playing && s.toggle(app))],
    ['pause', act((s) => s.pause())],
    ['nexttrack', act((s, app) => s.next(app))],
    ['previoustrack', act((s, app) => s.previous(app))]
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {}
  }
  const show = (s: MusicStore) => {
    if (!s.owner) {
      session.metadata = null;
      session.playbackState = 'none';
      return;
    }
    const song = SONGS[s.index];
    const cover = coverOf(song);
    session.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album ?? '',
      artwork: [{ src: cover, sizes: cover.includes('mzstatic') ? '600x600' : '320x180', type: 'image/jpeg' }]
    });
    session.playbackState = s.playing ? 'playing' : 'paused';
  };
  show(useMusic.getState());
  useMusic.subscribe((s, prev) => {
    if (s.index !== prev.index || s.playing !== prev.playing || s.owner !== prev.owner) show(s);
  });
}

/** How far the lyrics run ahead of the video for a song, in seconds. */
export function lyricOffset(song: Song, offsets: Record<string, number>) {
  return ((song.offset ?? 0) + (offsets[song.id] ?? 0)) / 1000;
}

// ---------- YouTube IFrame API ----------

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    options: {
      width?: string;
      height?: string;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

let api: Promise<YTNamespace> | null = null;

/** Loads YouTube's player script once. */
function loadYouTube(): Promise<YTNamespace> {
  api ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      api = null;
      reject(new Error('YouTube is unreachable'));
    };
    document.head.append(script);
  });
  return api;
}

export type PlayerStatus = 'loading' | 'ready' | 'offline';

/**
 * A YouTube player for `app`, mounted into the returned `host` element. It
 * follows the store while `app` owns playback and pauses when another app
 * takes over.
 */
export function usePlayer(app: MusicApp) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PlayerStatus>('loading');

  useEffect(() => {
    let dead = false;
    let player: YTPlayer | null = null;
    let ready = false;
    /** The video in the player, and whether this app owned playback last time we looked. */
    let loaded = '';
    let owned = false;
    let lastResume: MusicStore['resume'] = null;
    /** Between loading a video and it playing, when YouTube reports the old one pausing. */
    let switching = false;
    let watchdog = 0;

    const apply = (s: MusicStore) => {
      if (!player || !ready) return;
      const song = SONGS[s.index];
      if (s.owner !== app) {
        if (owned) player.pauseVideo();
        owned = false;
        return;
      }
      // A new owner picks up where the last one was; a seek or ⏮ asks for a time too.
      const jump = s.resume !== lastResume && s.resume?.index === s.index ? s.resume.time : null;
      lastResume = s.resume;
      if (song.id !== loaded) {
        const start = { videoId: song.id, startSeconds: jump ?? 0 };
        switching = s.playing;
        if (s.playing) player.loadVideoById(start);
        else player.cueVideoById(start);
        loaded = song.id;
      } else {
        if (jump !== null) player.seekTo(jump, true);
        if (s.playing) player.playVideo();
        else if (owned || jump !== null) player.pauseVideo();
      }
      owned = true;
      player.setVolume(s.volume);
      // Browsers can refuse to start playback; don't claim it's playing when it isn't.
      clearTimeout(watchdog);
      if (s.playing) {
        watchdog = window.setTimeout(() => {
          const state = player?.getPlayerState();
          if (useMusic.getState().owner === app && state !== PLAYING && state !== BUFFERING) useMusic.getState().pause();
        }, 8000);
      }
    };

    loadYouTube().then(
      (YT) => {
        if (dead || !host.current) return;
        const mount = document.createElement('div');
        host.current.append(mount);
        loaded = SONGS[useMusic.getState().index].id;
        player = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId: loaded,
          playerVars: {
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            iv_load_policy: 3,
            origin: window.location.origin
          },
          events: {
            onReady: () => {
              if (dead) return;
              ready = true;
              setStatus('ready');
              clocks.set(app, () => player?.getCurrentTime() ?? 0);
              durations.set(app, () => player?.getDuration() ?? 0);
              apply(useMusic.getState());
            },
            onStateChange: ({ data }) => {
              const s = useMusic.getState();
              if (s.owner !== app) return;
              if (data === PLAYING) switching = false;
              if (switching) return;
              // Paused or played from outside, e.g. the browser's media controls.
              if (data === PLAYING && !s.playing) useMusic.setState({ playing: true });
              if (data === PAUSED && s.playing) useMusic.setState({ playing: false });
              if (data === ENDED) {
                if (s.repeat === 'one') {
                  player?.seekTo(0, true);
                  player?.playVideo();
                } else {
                  s.next(app, true);
                }
              }
            },
            // Removed videos, or ones whose owners don't allow embedding: move on.
            onError: () => {
              const s = useMusic.getState();
              if (s.owner === app && s.playing) s.next(app, true);
            }
          }
        });
      },
      () => !dead && setStatus('offline')
    );

    const unsubscribe = useMusic.subscribe(apply);
    return () => {
      dead = true;
      unsubscribe();
      clearTimeout(watchdog);
      clocks.delete(app);
      durations.delete(app);
      player?.destroy();
      // Closing the window that was playing stops the music.
      const s = useMusic.getState();
      if (s.owner === app) useMusic.setState({ playing: false, owner: null, resume: null });
    };
  }, [app]);

  return { host, status };
}

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

/**
 * Keyboard shortcuts for a music app while its window is frontmost, whatever
 * inside it has focus. Typing in a field (Spotlight, the seek slider) is left
 * alone.
 */
export function useKeys(active: boolean, keys: Record<string, () => void>) {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const run = latest.current[e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

export const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
