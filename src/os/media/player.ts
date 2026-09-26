// A YouTube player per music app, through YouTube's IFrame API, following
// the shared "now playing" in music.ts.

import { useEffect, useRef, useState } from 'react';
import { useWindows } from '../core/store';
import { SONGS } from './library';
import { clocks, durations, useMusic, type MusicApp, type MusicStore } from './music';

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
  mute(): void;
  unMute(): void;
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

/**
 * Sets a player's loudness: the music's own volume scaled by the desktop's,
 * and silent while the desktop's sounds are off. All sound on JM/OS goes
 * through that one switch.
 */
function setLoudness(player: YTPlayer, musicVolume: number) {
  const { soundOn, volume } = useWindows.getState();
  if (!soundOn) return player.mute();
  player.unMute();
  player.setVolume(Math.round(musicVolume * volume));
}

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
 *
 * YouTube draws its title bar along the top of the player, its logo along
 * the bottom and "more videos" over a paused one. The player is made 300px
 * taller than `host` and centred on it (see .os-player-frame), so the video,
 * which letterboxes to the player's width, fills the host while the top and
 * bottom strips fall outside it and are cut off. `live` is true only while
 * the video is actually playing, so apps can cover everything else (start,
 * buffering, paused) with the song's artwork.
 */
export function usePlayer(app: MusicApp) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = host.current;
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
      setLoudness(player, s.volume);
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
        if (dead || !el) return;
        const frame = document.createElement('div');
        frame.className = 'os-player-frame';
        const mount = document.createElement('div');
        frame.append(mount);
        el.append(frame);
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
              setLive(data === PLAYING);
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
    // The desktop's sound switch and volume (menu bar, System Preferences) govern the music too.
    const unsubscribeSound = useWindows.subscribe((w, prev) => {
      if (player && ready && (w.soundOn !== prev.soundOn || w.volume !== prev.volume)) setLoudness(player, useMusic.getState().volume);
    });
    return () => {
      dead = true;
      unsubscribe();
      unsubscribeSound();
      clearTimeout(watchdog);
      clocks.delete(app);
      durations.delete(app);
      player?.destroy();
      el?.replaceChildren();
      // Closing the window that was playing stops the music.
      const s = useMusic.getState();
      if (s.owner === app) useMusic.setState({ playing: false, owner: null, resume: null });
    };
  }, [app]);

  return { host, status, live };
}
