import { useEffect, useRef, useState, type RefObject } from 'react';
import { useWindows } from '../../core/store';
import { soundOnToPlay, useMusic } from '../../media/music';
import { BUFFERING, ENDED, loadYouTube, middleControls, PAUSED, PLAYING, setLoudness, type PlayerStatus, type YTPlayer } from '../../media/player';

// DVD Player's own YouTube player (media/player.ts has the iPod's), made
// for the disc in the drive, with YouTube's chrome cropped off the same
// way (.os-player-frame). It's made as the disc goes in and cued, so Play
// Movie starts at once, inside the click that asked for it. It follows
// the one sound switch and the music's volume, and shares the speakers
// with the iPod and Karaoke: playing a disc pauses the music, and music
// starting pauses the disc.
//
// The picture shows from the moment the video first plays until it ends,
// paused or not: nothing of YouTube's is over a paused picture. For a few
// seconds after a start, a resume or a seek, YouTube puts its own button
// in the middle, which DVD Player masks with its own (`up`).

export interface DiscPlayer {
  /** Where the player goes: a box the size of the picture. */
  host: RefObject<HTMLDivElement | null>;
  /** 'unplayable': YouTube won't play this video here (removed, or not to be embedded). */
  status: PlayerStatus | 'unplayable';
  /** The video has played, and hasn't ended: its picture shows (else the cover does). */
  started: boolean;
  /** YouTube's middle controls may be up, so the middle of the picture is masked. */
  up: boolean;
  /** The video is waiting for more of itself. */
  buffering: boolean;
  /** Whether the disc is meant to be playing. */
  playing: boolean;
  /** Plays, from `from` seconds or from where it is. */
  play: (from?: number) => void;
  pause: () => void;
  /** Goes to `seconds`; `ahead: false` only within what's loaded, for a slider as it's dragged. */
  seek: (seconds: number, ahead?: boolean) => void;
  time: () => number;
  /** The video's length in seconds; 0 until YouTube says. */
  duration: () => number;
}

/** A play asked for before the player was ready: from where, or undefined for where it is. */
type Pending = { from?: number } | null;

/**
 * Starts the player, at `from` seconds if given. Browsers can refuse to
 * start playback, so if it hasn't started in 8 s it isn't claimed to be
 * playing.
 */
function start(p: YTPlayer, from: number | undefined, watchdog: { current: number }, setPlaying: (playing: boolean) => void) {
  setLoudness(p, useMusic.getState().volume);
  if (from !== undefined) p.seekTo(from, true);
  p.playVideo();
  clearTimeout(watchdog.current);
  watchdog.current = window.setTimeout(() => {
    const state = p.getPlayerState();
    if (state !== PLAYING && state !== BUFFERING) setPlaying(false);
  }, 8000);
}

export function useDiscPlayer(videoId: string | null, onEnded: () => void): DiscPlayer {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const pending = useRef<Pending>(null);
  const watchdog = useRef(0);
  /** YouTube can't be reached, or won't play this video: there's nothing to play. */
  const failed = useRef(false);
  const ended = useRef(onEnded);
  const [status, setStatus] = useState<DiscPlayer['status']>('loading');
  const [started, setStarted] = useState(false);
  const [up, setUp] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playing, setPlaying] = useState(false);
  // YouTube shows its own button for a few seconds after a start, a seek or a resume (player.ts).
  const [middle] = useState(() => middleControls(setUp));

  useEffect(() => {
    ended.current = onEnded;
  });

  // A player for the disc in the drive; a new disc gets a new one.
  useEffect(() => {
    const el = host.current;
    if (!videoId || !el) return;
    let dead = false;
    let made: YTPlayer | null = null;
    let frame: HTMLDivElement | null = null;
    // A timer id, not a node: the cleanup clears whichever is running then.
    const timer = watchdog;
    loadYouTube().then(
      (YT) => {
        if (dead) return;
        frame = document.createElement('div');
        frame.className = 'os-player-frame';
        const mount = document.createElement('div');
        frame.append(mount);
        el.append(frame);
        made = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: { playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, origin: window.location.origin },
          events: {
            onReady: () => {
              if (dead || !made) return;
              player.current = made;
              setStatus('ready');
              setLoudness(made, useMusic.getState().volume);
              const asked = pending.current;
              pending.current = null;
              if (asked) start(made, asked.from, watchdog, setPlaying);
            },
            onStateChange: ({ data }) => {
              if (dead) return;
              setBuffering(data === BUFFERING);
              if (data === PLAYING) {
                setStarted(true);
                setPlaying(true);
                middle.playing();
              }
              if (data === BUFFERING) middle.buffering();
              // Paused from outside too, e.g. the browser's media controls.
              if (data === PAUSED) {
                setPlaying(false);
                middle.paused();
              }
              if (data === ENDED) {
                setStarted(false);
                setPlaying(false);
                middle.stopped();
                ended.current();
              }
            },
            onError: () => {
              if (dead) return;
              failed.current = true;
              pending.current = null;
              setStatus('unplayable');
              setStarted(false);
              setPlaying(false);
              middle.stopped();
            }
          }
        });
      },
      () => {
        if (dead) return;
        // A play asked for meanwhile isn't claimed: nothing will play.
        failed.current = true;
        pending.current = null;
        setStatus('offline');
        setPlaying(false);
      }
    );
    return () => {
      dead = true;
      clearTimeout(timer.current);
      failed.current = false;
      pending.current = null;
      player.current = null;
      made?.destroy();
      // Only what this made: React may have given the host to something else by now.
      frame?.remove();
      middle.stopped();
      setStatus('loading');
      setStarted(false);
      setBuffering(false);
      setPlaying(false);
    };
  }, [videoId, middle]);

  // Music starting pauses the disc; the music's volume and the one sound switch are the disc's too.
  useEffect(() => {
    const unsubscribeMusic = useMusic.subscribe((s, prev) => {
      const p = player.current;
      if (s.playing && !prev.playing) {
        p?.pauseVideo();
        pending.current = null;
        setPlaying(false);
        middle.paused();
      }
      if (p && s.volume !== prev.volume) setLoudness(p, s.volume);
    });
    const unsubscribeSound = useWindows.subscribe((w, prev) => {
      const p = player.current;
      if (p && (w.soundOn !== prev.soundOn || w.volume !== prev.volume)) setLoudness(p, useMusic.getState().volume);
    });
    return () => {
      unsubscribeMusic();
      unsubscribeSound();
    };
  }, [middle]);

  // The same functions every render, so they can be an effect's dependencies.
  const [controls] = useState(() => ({
    play: (from?: number) => {
      // Nothing to play (the note says why): the music plays on, and nothing claims to be playing.
      if (failed.current) return;
      // Pressing play asks for sound, and the disc takes the speakers from the music.
      soundOnToPlay();
      const music = useMusic.getState();
      if (music.playing) music.pause();
      setPlaying(true);
      if (player.current) {
        // The mask goes up with the command, before YouTube's button does.
        middle.playing();
        start(player.current, from, watchdog, setPlaying);
      } else {
        pending.current = { from };
        // The player not ready in 8 s either: it isn't claimed to be playing.
        clearTimeout(watchdog.current);
        watchdog.current = window.setTimeout(() => {
          if (player.current) return;
          pending.current = null;
          setPlaying(false);
        }, 8000);
      }
    },
    pause: () => {
      pending.current = null;
      player.current?.pauseVideo();
      setPlaying(false);
      middle.paused();
    },
    seek: (seconds: number, ahead = true) => {
      player.current?.seekTo(Math.max(0, seconds), ahead);
      middle.seeked();
    },
    time: () => player.current?.getCurrentTime() ?? 0,
    duration: () => player.current?.getDuration() ?? 0
  }));

  return { host, status, started, up, buffering, playing, ...controls };
}
