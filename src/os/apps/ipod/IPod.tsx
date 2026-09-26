import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { useFocusedId } from '../../core/store';
import { lineAt, useLyrics } from '../../media/lyrics';
import { albumNamed, albumOf, coverOf, formatTime, lyricOffset, SONGS, tracksOf, useClock, useKeys, useMusic, usePlayer, type Repeat } from '../../media/music';
import { play as playSound } from '../../core/sound';
import { CoverFlow } from './CoverFlow';
import { Brick } from './Brick';
import { Quiz } from './Quiz';
import { Marquee } from './Marquee';
import type { ScreenInput } from './input';
import { loadSettings, saveJSON } from '../../core/storage';

// An iPod with a click wheel. Drag round the wheel (or scroll, or use the
// arrow keys) to move through the menus; MENU goes back, the centre button
// chooses, and the wheel's edges are ⏮ ⏭ ⏯. The songs are YouTube videos
// (see music.ts). Now Playing shows the album art, as an iPod would, or the
// video; the centre button switches between them. Music has Cover Flow and
// album pages; Extras has Karaoke, Brick and a Music Quiz. The screen's
// backlight goes down after a while without a touch, and the iPod comes in
// white, black or U2 red and black.

interface Item {
  label: string;
  /** Shown on the right, for settings. */
  value?: string;
  /** Opens another menu. */
  more?: boolean;
  /** Album art, for a taller row with `sub` under the label. */
  cover?: string;
  sub?: string;
  /** A track number, shown before the label. */
  number?: number;
  action?: () => void;
}

type Screen =
  | { kind: 'menu'; id: string; title: string }
  | { kind: 'now' }
  | { kind: 'coverflow' }
  | { kind: 'brick' }
  | { kind: 'quiz' };

interface Frame {
  screen: Screen;
  selected: number;
}

type Look = 'auto' | 'white' | 'black' | 'u2';
interface Prefs {
  look: Look;
  /** Seconds before the backlight dims; 0 keeps it on. */
  backlight: number;
  /** What Now Playing shows. */
  show: 'artwork' | 'video';
}

const PREFS_KEY = 'os-ipod';
const DEFAULT_PREFS: Prefs = { look: 'auto', backlight: 10, show: 'artwork' };
const LOOKS: { look: Look; name: string }[] = [
  { look: 'auto', name: 'Automatic' },
  { look: 'white', name: 'White' },
  { look: 'black', name: 'Black' },
  { look: 'u2', name: 'U2' }
];
const BACKLIGHTS = [5, 10, 20, 0];

const savedPrefs = () => loadSettings(PREFS_KEY, DEFAULT_PREFS);

const TITLES: Record<Exclude<Screen['kind'], 'menu'>, string> = {
  now: 'Now Playing',
  coverflow: 'Cover Flow',
  brick: 'Brick',
  quiz: 'Music Quiz'
};

const REPEATS: Repeat[] = ['off', 'one', 'all'];
const ROW = 19;
const TALL_ROW = 34;
const ALBUM_CARD = 74;
/** The menu's height: the screen less its header. */
const MENU_HEIGHT = 183;
/** Degrees of wheel travel per step. */
const STEP = (18 * Math.PI) / 180;

const artists = [...new Set(SONGS.map((s) => s.artist))].sort((a, b) => a.localeCompare(b));
/** Every album a song comes from, whole albums first. */
const albums = [...new Set(SONGS.map((s) => s.album).filter((a): a is string => !!a))].sort(
  (a, b) => Number(!!albumNamed(b)) - Number(!!albumNamed(a)) || a.localeCompare(b)
);
const ALL = SONGS.map((_, i) => i);
/** Songs of an album in track order (or the library's order for singles' albums). */
const albumTracks = (title: string) => {
  const whole = albumNamed(title);
  return whole ? tracksOf(whole) : ALL.filter((i) => SONGS[i].album === title);
};

export default function IPod({ win }: AppProps) {
  const { host, status, live } = usePlayer('ipod');
  const music = useMusic();
  const { time, duration } = useClock();
  const song = SONGS[music.index];
  const lyrics = useLyrics(song, music.owner ? duration : 0);
  const [stack, setStack] = useState<Frame[]>([{ screen: { kind: 'menu', id: 'root', title: 'iPod' }, selected: 0 }]);
  const [showVolume, setShowVolume] = useState(0);
  const [prefs, setPrefs] = useState(savedPrefs);
  const [touched, setTouched] = useState(() => Date.now());
  const [dim, setDim] = useState(false);
  const focused = useFocusedId() === win.id;
  // The full-screen view on top (Cover Flow, a game) takes the wheel while it's open.
  const view = useRef<ScreenInput | null>(null);
  const setView = useCallback((handle: ScreenInput | null) => {
    view.current = handle;
  }, []);

  const top = stack[stack.length - 1];
  const kind = top.screen.kind;
  const push = (screen: Screen) => setStack((s) => [...s, { screen, selected: 0 }]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const nowPlaying = () => push({ kind: 'now' });
  const menuOf = (id: string, title: string) => () => push({ kind: 'menu', id, title });

  const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      saveJSON(PREFS_KEY, next);
      return next;
    });

  /** Plays a song, with `queue` (an album, an artist, everything) to follow it. */
  const playSong = useCallback(
    (index: number, queue: number[]) => {
      useMusic.getState().play('ipod', index, queue);
      setStack((s) => [...s, { screen: { kind: 'now' }, selected: 0 }]);
    },
    []
  );

  const songsOf = (list: number[]): Item[] => list.map((i) => ({ label: SONGS[i].title, action: () => playSong(i, list) }));

  const menu = (id: string): Item[] => {
    switch (id) {
      case 'root':
        return [
          { label: 'Music', more: true, action: menuOf('music', 'Music') },
          { label: 'Extras', more: true, action: menuOf('extras', 'Extras') },
          { label: 'Settings', more: true, action: menuOf('settings', 'Settings') },
          {
            label: 'Shuffle Songs',
            action: () => {
              music.setShuffle(true);
              playSong(Math.floor(Math.random() * SONGS.length), ALL);
            }
          },
          ...(music.owner ? [{ label: 'Now Playing', more: true, action: nowPlaying }] : [])
        ];
      case 'music':
        return [
          { label: 'Cover Flow', more: true, action: () => push({ kind: 'coverflow' }) },
          { label: 'Albums', more: true, action: menuOf('albums', 'Albums') },
          { label: 'Artists', more: true, action: menuOf('artists', 'Artists') },
          { label: 'Songs', more: true, action: menuOf('songs', 'Songs') }
        ];
      case 'extras':
        return [
          { label: 'Karaoke', more: true, action: () => launch('karaoke') },
          { label: 'Brick', more: true, action: () => push({ kind: 'brick' }) },
          { label: 'Music Quiz', more: true, action: () => push({ kind: 'quiz' }) }
        ];
      case 'songs':
        return songsOf(ALL);
      case 'albums':
        return albums.map((title) => {
          const first = SONGS[albumTracks(title)[0]];
          return { label: title, sub: first.artist, cover: coverOf(first), more: true, action: menuOf(`album:${title}`, title) };
        });
      case 'artists':
        return artists.map((a) => ({ label: a, more: true, action: menuOf(`artist:${a}`, a) }));
      case 'settings':
        return [
          { label: 'Shuffle', value: music.shuffle ? 'Songs' : 'Off', action: () => music.setShuffle(!music.shuffle) },
          {
            label: 'Repeat',
            value: music.repeat === 'off' ? 'Off' : music.repeat === 'one' ? 'One' : 'All',
            action: () => music.setRepeat(REPEATS[(REPEATS.indexOf(music.repeat) + 1) % REPEATS.length])
          },
          {
            label: 'Now Playing',
            value: prefs.show === 'artwork' ? 'Artwork' : 'Video',
            action: () => setPref('show', prefs.show === 'artwork' ? 'video' : 'artwork')
          },
          {
            label: 'Backlight',
            value: prefs.backlight ? `${prefs.backlight} Seconds` : 'Always On',
            action: () => setPref('backlight', BACKLIGHTS[(BACKLIGHTS.indexOf(prefs.backlight) + 1) % BACKLIGHTS.length])
          },
          {
            label: 'Theme',
            value: LOOKS.find((l) => l.look === prefs.look)?.name,
            action: () => setPref('look', LOOKS[(LOOKS.findIndex((l) => l.look === prefs.look) + 1) % LOOKS.length].look)
          },
          { label: 'About', more: true, action: menuOf('about', 'About') }
        ];
      case 'about':
        return [
          { label: 'Songs', value: String(SONGS.length) },
          { label: 'Albums', value: String(albums.length) },
          { label: 'Artists', value: String(artists.length) },
          { label: 'Videos', value: 'YouTube' },
          { label: 'Lyrics', value: 'lrclib, NetEase' }
        ];
      default:
        if (id.startsWith('album:')) {
          const list = albumTracks(id.slice(6));
          return [
            {
              label: 'Play',
              value: '▶',
              action: () => {
                music.setShuffle(false);
                playSong(list[0], list);
              }
            },
            {
              label: 'Shuffle',
              value: '⤮',
              action: () => {
                music.setShuffle(true);
                playSong(list[Math.floor(Math.random() * list.length)], list);
              }
            },
            ...list.map((i, n) => ({ label: SONGS[i].title, number: SONGS[i].track ?? n + 1, action: () => playSong(i, list) }))
          ];
        }
        if (id.startsWith('artist:')) {
          const name = id.slice(7);
          return songsOf(ALL.filter((i) => SONGS[i].artist === name));
        }
        return [];
    }
  };

  const items = kind === 'menu' ? menu((top.screen as { id: string }).id) : [];
  const albumTitle = top.screen.kind === 'menu' && top.screen.id.startsWith('album:') ? top.screen.id.slice(6) : null;
  const albumPage = albumTitle ? { title: albumTitle, first: SONGS[albumTracks(albumTitle)[0]], whole: albumNamed(albumTitle) } : null;

  /** Any touch brings the backlight up (and still does what it does, as on an iPod). */
  const wake = () => {
    setTouched(Date.now());
    setDim(false);
  };

  const step = (delta: number) => {
    playSound('tick');
    wake();
    if (view.current) return view.current.step(delta);
    if (kind === 'now') {
      music.setVolume(music.volume + delta * 4);
      setShowVolume(Date.now());
      return;
    }
    setStack((s) => {
      const last = s[s.length - 1];
      const selected = Math.min(items.length - 1, Math.max(0, last.selected + delta));
      return selected === last.selected ? s : [...s.slice(0, -1), { ...last, selected }];
    });
  };

  const choose = () => {
    playSound('click');
    wake();
    if (view.current) return view.current.choose();
    // On Now Playing the centre button switches between the artwork and the video.
    if (kind === 'now') return setPref('show', prefs.show === 'artwork' ? 'video' : 'artwork');
    items[top.selected]?.action?.();
  };

  const press = (button: 'menu' | 'next' | 'previous' | 'play') => {
    playSound('click');
    wake();
    if (button === 'menu') {
      if (view.current?.back?.()) return;
      return pop();
    }
    if (view.current?.press?.(button)) return;
    if (button === 'next') music.next('ipod');
    if (button === 'previous') music.previous('ipod');
    if (button === 'play') music.toggle('ipod');
  };

  // The volume bar shows for a moment after the wheel turns on Now Playing.
  useEffect(() => {
    if (!showVolume) return;
    const t = setTimeout(() => setShowVolume(0), 1500);
    return () => clearTimeout(t);
  }, [showVolume]);

  // The backlight goes down after a while without a touch (not during a game).
  const playingGame = kind === 'brick' || kind === 'quiz';
  useEffect(() => {
    if (!prefs.backlight || playingGame) return setDim(false);
    const t = setTimeout(() => setDim(true), prefs.backlight * 1000);
    return () => clearTimeout(t);
  }, [touched, prefs.backlight, playingGame]);

  useKeys(focused, {
    ArrowUp: () => step(-1),
    ArrowDown: () => step(1),
    ArrowLeft: () => press('previous'),
    ArrowRight: () => press('next'),
    Enter: choose,
    ' ': () => press('play'),
    Escape: () => press('menu'),
    Backspace: () => press('menu')
  });

  const offset = lyricOffset(song, music.offsets);
  const line = lyrics.state === 'ready' ? lyrics.lines[lineAt(lyrics.lines, time + offset)]?.text : undefined;
  const now = kind === 'now';
  const showVideo = now && prefs.show === 'video';
  // Keep the chosen row in view: scroll just enough to show its bottom edge.
  const heights = items.map((item) => (item.cover ? TALL_ROW : ROW));
  const card = albumPage ? ALBUM_CARD : 0;
  const total = card + heights.reduce((a, b) => a + b, 0);
  const rowBottom = card + heights.slice(0, top.selected + 1).reduce((a, b) => a + b, 0);
  const scroll = Math.max(0, rowBottom - MENU_HEIGHT);
  const { queue } = music;
  const position = queue.indexOf(music.index);
  const album = albumOf(song);
  const title = kind === 'menu' ? (top.screen as { title: string }).title : TITLES[kind];

  return (
    <div className="os-app os-ipod-app">
      <div className="os-ipod" data-look={prefs.look} aria-label="iPod">
        {/* Touching the screen (dragging Cover Flow, clicking a row) is a touch too. */}
        <div className="os-ipod-screen" data-now={now || undefined} data-dim={dim || undefined} onPointerDown={wake} onWheel={wake}>
          <header className="os-ipod-header">
            <span className="os-ipod-state" aria-hidden="true">
              {music.playing ? '▶' : music.owner ? '❚❚' : ''}
            </span>
            <span>{title}</span>
            <span className="os-ipod-battery" aria-hidden="true" />
          </header>

          {/* Always mounted, so the music keeps going under the menus. It
              only shows in video mode, and then only once it's really
              playing: until then (and when paused) the artwork covers
              YouTube's own title, spinner and suggestions. */}
          <div className="os-ipod-video" ref={host} aria-hidden={!showVideo} data-show={showVideo || undefined} />
          {showVideo && !live && <img className="os-ipod-video-cover" src={coverOf(song)} alt="" />}

          {now && (
            <div className="os-ipod-now" data-show={prefs.show}>
              {status === 'offline' && <p className="os-ipod-note">YouTube can’t be reached.</p>}
              {prefs.show === 'artwork' ? (
                <div className="os-ipod-artwork">
                  <img src={coverOf(song)} alt="" />
                  <div>
                    <Marquee className="os-ipod-song" text={song.title} />
                    <span>{song.artist}</span>
                    {song.album && <span>{song.album}</span>}
                    {line && <em>{line}</em>}
                  </div>
                </div>
              ) : (
                line && <p className="os-ipod-caption">{line}</p>
              )}
              <div className="os-ipod-info">
                {prefs.show === 'video' && (
                  <p>
                    <Marquee className="os-ipod-song" text={song.title} />
                    <span>{album ? `${song.artist} — ${song.album}` : song.artist}</span>
                  </p>
                )}
                <p className="os-ipod-count">{position >= 0 ? `${position + 1} of ${queue.length}` : ''}</p>
              </div>
              {showVolume ? (
                <div className="os-ipod-bar" aria-label={`Volume ${music.volume}`}>
                  <span aria-hidden="true">🔈</span>
                  <div className="os-ipod-progress">
                    <span style={{ width: `${music.volume}%` }} />
                  </div>
                  <span aria-hidden="true">🔊</span>
                </div>
              ) : (
                <div className="os-ipod-bar">
                  <time>{formatTime(time)}</time>
                  <div className="os-ipod-progress">
                    <span style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
                  </div>
                  <time>-{formatTime(duration - time)}</time>
                </div>
              )}
            </div>
          )}

          {kind === 'menu' && (
            <div className="os-ipod-menu" data-scrolls={total > MENU_HEIGHT || undefined}>
              <ul role="listbox" aria-label={title} style={{ translate: `0 ${-scroll}px` }}>
                {albumPage && (
                  <li className="os-ipod-album" role="presentation">
                    <img src={coverOf(albumPage.first)} alt="" />
                    <div>
                      <strong>{albumPage.title}</strong>
                      <span>{albumPage.first.artist}</span>
                      <small>
                        {albumPage.whole ? `${albumPage.whole.year} · ` : ''}
                        {items.length - 2} {items.length === 3 ? 'song' : 'songs'}
                      </small>
                    </div>
                  </li>
                )}
                {items.map((item, i) => (
                  <li
                    key={`${i}:${item.label}`}
                    role="option"
                    aria-selected={i === top.selected}
                    data-tall={item.cover ? true : undefined}
                    onClick={() => {
                      setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], selected: i }]);
                      playSound('click');
                      wake();
                      item.action?.();
                    }}
                  >
                    {item.cover && <img className="os-ipod-thumb" src={item.cover} alt="" />}
                    {item.number !== undefined && <span className="os-ipod-number">{item.number}</span>}
                    {item.sub ? (
                      <span className="os-ipod-two">
                        <Marquee text={item.label} run={i === top.selected} />
                        <small>{item.sub}</small>
                      </span>
                    ) : (
                      <Marquee className="os-ipod-label-text" text={item.label} run={i === top.selected} />
                    )}
                    {item.value && <span className="os-ipod-value">{item.value}</span>}
                    {item.more && <span aria-hidden="true">›</span>}
                  </li>
                ))}
              </ul>
              {total > MENU_HEIGHT && (
                <div className="os-ipod-scrollbar" aria-hidden="true">
                  <span style={{ top: `${(scroll / total) * 100}%`, height: `${(MENU_HEIGHT / total) * 100}%` }} />
                </div>
              )}
            </div>
          )}

          {kind === 'coverflow' && <CoverFlow input={setView} start={music.owner ? song.album : undefined} onPlay={playSong} />}
          {kind === 'brick' && <Brick input={setView} />}
          {kind === 'quiz' && <Quiz input={setView} />}
        </div>

        <Wheel onStep={step} onPress={press} onChoose={choose} />
      </div>
    </div>
  );
}

/** The click wheel: turn it for steps, press its edges for buttons and its centre to choose. */
function Wheel({
  onStep,
  onPress,
  onChoose
}: {
  onStep: (delta: number) => void;
  onPress: (button: 'menu' | 'next' | 'previous' | 'play') => void;
  onChoose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number; turned: number; pending: number } | null>(null);
  const wheelDelta = useRef(0);

  const angle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };

  return (
    <div
      ref={ref}
      className="os-ipod-wheel"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { last: angle(e), turned: 0, pending: 0 };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const a = angle(e);
        // Shortest way round, so crossing ±180° doesn't jump.
        let delta = a - d.last;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        d.last = a;
        d.turned += Math.abs(delta);
        d.pending += delta;
        // Clockwise (positive in screen coordinates) moves down the list.
        while (d.pending >= STEP) {
          d.pending -= STEP;
          onStep(1);
        }
        while (d.pending <= -STEP) {
          d.pending += STEP;
          onStep(-1);
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        // A press, not a turn: which edge was it?
        if (!d || d.turned > STEP / 2) return;
        const deg = (angle(e) * 180) / Math.PI;
        if (deg > -135 && deg <= -45) onPress('menu');
        else if (deg > -45 && deg <= 45) onPress('next');
        else if (deg > 45 && deg <= 135) onPress('play');
        else onPress('previous');
      }}
      onPointerCancel={() => (drag.current = null)}
      onWheel={(e) => {
        wheelDelta.current += e.deltaY;
        while (Math.abs(wheelDelta.current) >= 40) {
          const dir = Math.sign(wheelDelta.current);
          wheelDelta.current -= dir * 40;
          onStep(dir);
        }
      }}
    >
      <span className="os-ipod-label" data-at="top">
        MENU
      </span>
      <span className="os-ipod-label" data-at="right" aria-hidden="true">
        ⏭
      </span>
      <span className="os-ipod-label" data-at="bottom" aria-hidden="true">
        ⏯
      </span>
      <span className="os-ipod-label" data-at="left" aria-hidden="true">
        ⏮
      </span>
      <button
        type="button"
        className="os-ipod-center"
        aria-label="Select"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onChoose}
      />
    </div>
  );
}
