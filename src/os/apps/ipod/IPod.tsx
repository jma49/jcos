import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NextGlyph, PauseGlyph, PlayGlyph, PlayPauseGlyph, PreviousGlyph, ShuffleGlyph, SpeakerHighGlyph, SpeakerLowGlyph } from '../../core/glyphs';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { isPhone, useFocusedId, useWindows } from '../../core/store';
import { lineAt, useLyrics } from '../../media/lyrics';
import { albumNamed, albumOf, coverOf, fromLibrary, lyricOffset, SONG_LIMIT, SONGS, tracksOf, useLibraryVersion } from '../../media/library';
import { useLibraryRefresh } from '../../media/refresh';
import { formatTime, useClock, useMusic, type Repeat } from '../../media/music';
import { useKeys } from '../../core/useKeys';
import { usePlayer } from '../../media/player';
import { play as playSound } from '../../core/sound';
import { CoverFlow } from './CoverFlow';
import { Brick } from './Brick';
import { Quiz } from './Quiz';
import { Marquee } from './Marquee';
import type { ScreenInput } from './input';
import { loadSettings, updateJSON } from '../../core/storage';
import {
  addToGo,
  clearOnTheGo,
  deletePlaylist,
  indexesOf,
  mostPlayed,
  onTheGo,
  playlists,
  rate,
  ratingOf,
  ratingRefused,
  recentlyPlayed,
  takeOffGo,
  topRated,
  unlist,
  useListening,
  useListeningRefresh,
  type Playlist
} from '../../media/playlists';
import { useIsOwner } from '../../social/owner';
import { SavePlaylist } from './SavePlaylist';
import { ratingLabel, Stars } from './Stars';

// An iPod with a click wheel. Drag round the wheel (or scroll, or use the
// arrow keys) to move through the menus; MENU goes back, the centre button
// chooses, and the wheel's edges are ⏮ ⏭ ⏯. The songs are YouTube videos
// (see music.ts). Now Playing shows the album art, as an iPod would, or the
// video (Settings); the centre button there turns the progress bar into
// Jincheng's rating of the song, which the wheel changes when Jincheng is
// signed in. Holding the centre button puts the song, album, artist or
// playlist chosen into On-The-Go (or takes a song out of a playlist that
// can be changed). Music has Cover Flow, Playlists (media/playlists.ts) and
// album pages; Extras has Karaoke, Brick and a Music Quiz. The screen's
// backlight goes down after a while without a touch, and the iPod comes in
// white, black or U2 red and black.

interface Item {
  label: string;
  /** Shown on the right, for settings (text, or a glyph). */
  value?: ReactNode;
  /** Opens another menu. */
  more?: boolean;
  /** Album art, for a taller row with `sub` under the label. */
  cover?: string;
  sub?: string;
  /** A track number, shown before the label. */
  number?: number;
  action?: () => void;
  /** The songs (places in SONGS) holding the centre button puts into On-The-Go, worked out when it's held. */
  songs?: () => number[];
  /** What holding the centre button does instead, in a playlist that can be changed: takes the song out. */
  remove?: () => void;
}

type Screen =
  | { kind: 'menu'; id: string; title: string }
  | { kind: 'now' }
  | { kind: 'coverflow' }
  | { kind: 'brick' }
  | { kind: 'quiz' }
  | { kind: 'save' };

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
  quiz: 'Music Quiz',
  save: 'Save Playlist'
};

const REPEATS: Repeat[] = ['off', 'one', 'all'];
/** Degrees of wheel travel per step. */
const STEP = (18 * Math.PI) / 180;
/** How long the centre button is held to put a song into On-The-Go. */
const HOLD_MS = 600;
/** How long the rating shows on Now Playing after the last touch. */
const RATING_MS = 4000;
/** The rows at the top of Playlists: On-The-Go and the three smart playlists. */
const IPOD_PLAYLIST_ROWS = 4;

/** What an empty playlist says, for Jincheng (`owner`) or a visitor. */
const EMPTY: Partial<Record<string, (owner: boolean) => string>> = {
  otg: () => 'Hold the centre button on a song, an album or an artist to add it here.',
  toprated: (owner) =>
    owner
      ? 'Press the centre button on Now Playing to rate the song. Four stars and up show here.'
      : 'Songs Jincheng rates four stars and up show here.',
  recent: (owner) => `Songs ${owner ? 'you play' : 'Jincheng plays'} to the end show here for two weeks.`,
  mostplayed: (owner) => `The songs ${owner ? 'you play' : 'Jincheng plays'} most show here.`,
  playlist: () => 'No songs.'
};

/** The library's artists, its albums (whole ones first) and every song. */
const shelves = fromLibrary(() => ({
  artists: [...new Set(SONGS.map((s) => s.artist))].sort((a, b) => a.localeCompare(b)),
  albums: [...new Set(SONGS.map((s) => s.album).filter((a): a is string => !!a))].sort(
    (a, b) => Number(!!albumNamed(b)) - Number(!!albumNamed(a)) || a.localeCompare(b)
  ),
  all: SONGS.map((_, i) => i)
}));
/** Songs of an album in track order (or the library's order for singles' albums). */
const albumTracks = (title: string) => {
  const whole = albumNamed(title);
  return whole ? tracksOf(whole) : shelves().all.filter((i) => SONGS[i].album === title);
};

export default function IPod({ win }: AppProps) {
  // Songs added during the visit show up here too (media/library.ts).
  useLibraryVersion();
  useLibraryRefresh();
  // Jincheng's ratings and playlists, and this visitor's On-The-Go.
  useListening();
  useListeningRefresh();
  const owner = useIsOwner();
  const { artists, albums, all: ALL } = shelves();
  const { host, status, live } = usePlayer('ipod');
  const music = useMusic();
  const { time, duration } = useClock();
  const song = SONGS[music.index];
  const lyrics = useLyrics(song, music.owner ? duration : 0);
  const [stack, setStack] = useState<Frame[]>(() => [
    { screen: { kind: 'menu', id: 'root', title: 'iPod' }, selected: 0 },
    // Opened to play a song (see `nowPlaying` below): straight to it.
    ...(win.props?.nowPlaying && useMusic.getState().owner === 'ipod' ? [{ screen: { kind: 'now' } as Screen, selected: 0 }] : [])
  ]);
  const [showVolume, setShowVolume] = useState(0);
  // When Now Playing last showed the rating in place of the progress bar (0: it doesn't).
  const [rating, setRating] = useState(0);
  // When the chosen row last flashed, for songs put into On-The-Go.
  const [flash, setFlash] = useState(0);
  // Something that went wrong, said for a moment under the menu.
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const say = (error: unknown) => setNote({ text: error instanceof Error ? error.message : 'That didn’t work. Try again.', at: Date.now() });
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

  // A song started from outside (Listen along, a song opened in Finder)
  // shows on Now Playing: its launch carries a new `nowPlaying` each time,
  // so it works when the iPod is already open too. A window restored after
  // a reload carries an old one with nothing playing, and opens on the menu.
  const [asked, setAsked] = useState(win.props?.nowPlaying);
  if (win.props?.nowPlaying !== asked) {
    setAsked(win.props?.nowPlaying);
    if (kind !== 'now') setStack((s) => [...s, { screen: { kind: 'now' }, selected: 0 }]);
  }
  const push = (screen: Screen) => setStack((s) => [...s, { screen, selected: 0 }]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const nowPlaying = () => push({ kind: 'now' });
  const menuOf = (id: string, title: string) => () => push({ kind: 'menu', id, title });

  const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
    setPrefs((p) => {
      updateJSON(PREFS_KEY, p, (stored) => ({ ...stored, [key]: value }));
      return { ...p, [key]: value };
    });

  /** Plays a song, with `queue` (an album, an artist, everything) to follow it. */
  const playSong = useCallback(
    (index: number, queue: number[]) => {
      useMusic.getState().play('ipod', index, queue);
      setStack((s) => [...s, { screen: { kind: 'now' }, selected: 0 }]);
    },
    []
  );

  /** Rows for songs, playing `list` from the one chosen; `remove` is what holding the centre button does, where it takes a song out. */
  const songsOf = (list: number[], remove?: (i: number) => () => void): Item[] =>
    list.map((i) => ({ label: SONGS[i].title, action: () => playSong(i, list), songs: () => [i], ...(remove ? { remove: remove(i) } : {}) }));

  /**
   * After On-The-Go is saved: back on Playlists, at the playlist it went
   * into. If MENU left the screen while it was saving, the iPod stays where
   * it has been taken since.
   */
  const saved = (playlist: Playlist) =>
    setStack((s) => {
      if (s[s.length - 1].screen.kind !== 'save') return s;
      const rest = s.length > 2 ? s.slice(0, -2) : s.slice(0, 1);
      const last = rest[rest.length - 1];
      if (last.screen.kind !== 'menu' || last.screen.id !== 'playlists') return rest;
      const at = playlists().findIndex((p) => p.id === playlist.id);
      return [...rest.slice(0, -1), { ...last, selected: at < 0 ? last.selected : IPOD_PLAYLIST_ROWS + at }];
    });

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
          { label: 'Playlists', more: true, action: menuOf('playlists', 'Playlists') },
          { label: 'Albums', more: true, action: menuOf('albums', 'Albums') },
          { label: 'Artists', more: true, action: menuOf('artists', 'Artists') },
          // How full the library is, as a setting's value: "34/200".
          { label: 'Songs', value: `${SONGS.length}/${SONG_LIMIT}`, more: true, action: menuOf('songs', 'Songs') }
        ];
      case 'extras':
        return [
          { label: 'Karaoke', more: true, action: () => launch('karaoke') },
          { label: 'Brick', more: true, action: () => push({ kind: 'brick' }) },
          { label: 'Music Quiz', more: true, action: () => push({ kind: 'quiz' }) }
        ];
      case 'songs':
        return songsOf(ALL);
      // On-The-Go and the smart playlists first, as on an iPod, then Jincheng's own.
      case 'playlists':
        return [
          { label: 'On-The-Go', more: true, action: menuOf('otg', 'On-The-Go') },
          { label: 'My Top Rated', more: true, songs: topRated, action: menuOf('toprated', 'My Top Rated') },
          { label: 'Recently Played', more: true, songs: () => recentlyPlayed(), action: menuOf('recent', 'Recently Played') },
          { label: 'Top 25 Most Played', more: true, songs: mostPlayed, action: menuOf('mostplayed', 'Top 25 Most Played') },
          ...playlists().map((p) => ({ label: p.name, more: true, songs: () => indexesOf(p.songs), action: menuOf(`playlist:${p.id}`, p.name) }))
        ];
      case 'otg': {
        const list = indexesOf(onTheGo());
        if (!list.length) return [];
        return [
          ...songsOf(list, (i) => () => takeOffGo(SONGS[i].id)),
          // Saving makes it one of Jincheng's playlists, for everyone.
          ...(owner ? [{ label: 'Save Playlist', more: true, action: () => push({ kind: 'save' }) }] : []),
          { label: 'Clear Playlist', more: true, action: menuOf('clear', 'Clear Playlist') }
        ];
      }
      case 'clear':
        return [
          { label: 'Cancel', action: pop },
          {
            label: 'Clear Playlist',
            action: () => {
              clearOnTheGo();
              pop();
            }
          }
        ];
      case 'toprated':
        return songsOf(topRated());
      case 'recent':
        return songsOf(recentlyPlayed());
      case 'mostplayed':
        return songsOf(mostPlayed());
      case 'albums':
        return albums.map((title) => {
          const first = SONGS[albumTracks(title)[0]];
          return {
            label: title,
            sub: first.artist,
            cover: coverOf(first),
            more: true,
            songs: () => albumTracks(title),
            action: menuOf(`album:${title}`, title)
          };
        });
      case 'artists':
        return artists.map((a) => ({ label: a, more: true, songs: () => ALL.filter((i) => SONGS[i].artist === a), action: menuOf(`artist:${a}`, a) }));
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
          // Phones have no room on the desktop for them.
          ...(isPhone()
            ? []
            : [{ label: 'Desktop Lyrics', value: music.desktopLyrics ? 'On' : 'Off', action: () => music.setDesktopLyrics(!music.desktopLyrics) }]),
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
          { label: 'Songs', value: `${SONGS.length}/${SONG_LIMIT}` },
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
              value: <PlayGlyph />,
              action: () => {
                music.setShuffle(false);
                playSong(list[0], list);
              }
            },
            {
              label: 'Shuffle',
              value: <ShuffleGlyph />,
              action: () => {
                music.setShuffle(true);
                playSong(list[Math.floor(Math.random() * list.length)], list);
              }
            },
            ...list.map((i, n) => ({ label: SONGS[i].title, number: SONGS[i].track ?? n + 1, songs: () => [i], action: () => playSong(i, list) }))
          ];
        }
        if (id.startsWith('artist:')) {
          const name = id.slice(7);
          return songsOf(ALL.filter((i) => SONGS[i].artist === name));
        }
        // One of Jincheng's playlists; Jincheng can take songs out of it, or delete it.
        if (id.startsWith('playlist:')) {
          const list = playlists().find((p) => p.id === Number(id.slice(9)));
          if (!list) return [];
          return [
            ...songsOf(indexesOf(list.songs), owner ? (i) => () => void unlist(list.id, SONGS[i].id).catch(say) : undefined),
            ...(owner ? [{ label: 'Delete Playlist', more: true, action: menuOf(`delete:${list.id}`, 'Delete Playlist') }] : [])
          ];
        }
        if (id.startsWith('delete:')) {
          const playlist = Number(id.slice(7));
          return [
            { label: 'Cancel', action: pop },
            {
              label: 'Delete Playlist',
              // Back to Playlists, past the playlist that's gone.
              action: () => void deletePlaylist(playlist).then(() => setStack((s) => (s.length > 3 ? s.slice(0, -2) : s)), say)
            }
          ];
        }
        return [];
    }
  };

  const items = kind === 'menu' ? menu((top.screen as { id: string }).id) : [];
  // The row chosen, kept on the list when it gets shorter (a song taken out, a playlist deleted, another tab's change).
  const chosen = Math.min(top.selected, Math.max(0, items.length - 1));
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
      // While the rating shows, the wheel changes it, if it's Jincheng's to
      // change; for anyone else it's the volume again.
      if (rating && owner) {
        rate(song.id, ratingOf(song.id) + delta);
        setRating(Date.now());
        return;
      }
      setRating(0);
      music.setVolume(music.volume + delta * 4);
      setShowVolume(Date.now());
      return;
    }
    setStack((s) => {
      const last = s[s.length - 1];
      const selected = Math.min(items.length - 1, Math.max(0, Math.min(last.selected, items.length - 1) + delta));
      return selected === last.selected ? s : [...s.slice(0, -1), { ...last, selected }];
    });
  };

  const choose = () => {
    playSound('click');
    wake();
    if (view.current) return view.current.choose();
    // On Now Playing the centre button shows the rating in place of the progress bar, and back.
    if (kind === 'now') {
      setShowVolume(0);
      return setRating((r) => (r ? 0 : Date.now()));
    }
    items[chosen]?.action?.();
  };

  /**
   * Holding the centre button: the song, album, artist or playlist chosen
   * goes into On-The-Go (the song playing, on Now Playing), and its row
   * flashes, as on an iPod. In a playlist that can be changed, the song
   * chosen comes out instead.
   */
  const hold = () => {
    wake();
    if (view.current) return;
    if (kind === 'now') {
      playSound('click');
      addToGo([song.id]);
      return setFlash(Date.now());
    }
    const item = kind === 'menu' ? items[chosen] : undefined;
    if (item?.remove) {
      playSound('click');
      item.remove();
      // The choice stays where it was, or on the last row if that was the last.
      return setStack((s) => {
        const last = s[s.length - 1];
        return [...s.slice(0, -1), { ...last, selected: Math.max(0, Math.min(last.selected, items.length - 2)) }];
      });
    }
    const songs = item?.songs?.() ?? [];
    if (!songs.length) return;
    playSound('click');
    addToGo(songs.map((i) => SONGS[i].id));
    setFlash(Date.now());
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

  // The rating gives way to the progress bar a few seconds after the last touch.
  useEffect(() => {
    if (!rating) return;
    const t = setTimeout(() => setRating(0), RATING_MS);
    return () => clearTimeout(t);
  }, [rating]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(0), 700);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3000);
    return () => clearTimeout(t);
  }, [note]);

  // The backlight goes down after a while without a touch (not during a game).
  const playingGame = kind === 'brick' || kind === 'quiz';
  useEffect(() => {
    if (!prefs.backlight || playingGame) return setDim(false);
    const t = setTimeout(() => setDim(true), prefs.backlight * 1000);
    return () => clearTimeout(t);
  }, [touched, prefs.backlight, playingGame]);

  // The list scrolls natively (a wheel, a trackpad, a finger), which leaves
  // the choice where it is; turning the wheel or the arrow keys move the
  // choice, and the list scrolls just enough to keep it in view. The iPod's
  // own scroll bar follows by the element, not a render per frame.
  const list = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const placeThumb = useCallback(() => {
    const el = list.current;
    if (!el || !thumb.current) return;
    thumb.current.style.top = `${(el.scrollTop / el.scrollHeight) * 100}%`;
    thumb.current.style.height = `${(el.clientHeight / el.scrollHeight) * 100}%`;
  }, []);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    el.parentElement?.toggleAttribute('data-scrolls', el.scrollHeight > el.clientHeight + 1);
    const row = el.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    if (row) {
      // The first row shows the album card above it too.
      const rowTop = chosen === 0 ? 0 : row.offsetTop;
      const rowBottom = row.offsetTop + row.offsetHeight;
      if (rowTop < el.scrollTop) el.scrollTop = rowTop;
      else if (rowBottom > el.scrollTop + el.clientHeight) el.scrollTop = rowBottom - el.clientHeight;
    }
    placeThumb();
  }, [chosen, top.screen, items.length, placeThumb]);

  useKeys(focused, {
    ArrowUp: () => step(-1),
    ArrowDown: () => step(1),
    ArrowLeft: () => press('previous'),
    ArrowRight: () => press('next'),
    ' ': () => press('play'),
    Escape: () => press('menu'),
    Backspace: () => press('menu')
  });
  // Return is the centre button: it chooses when let go, and holds when held.
  useCentreKey(focused, choose, hold);

  const offset = lyricOffset(song, music.offsets);
  const line = lyrics.state === 'ready' ? lyrics.lines[lineAt(lyrics.lines, time + offset)]?.text : undefined;
  const now = kind === 'now';
  const showVideo = now && prefs.show === 'video';
  const { queue } = music;
  const position = queue.indexOf(music.index);
  const album = albumOf(song);
  const title = kind === 'menu' ? (top.screen as { title: string }).title : TITLES[kind];
  // The rating, in place of the progress bar: Jincheng's, which only Jincheng changes.
  const showRating = now && rating > 0;
  const stars = ratingOf(song.id);
  const refused = ratingRefused();
  const unsaved = owner && refused?.id === song.id && Date.now() - refused.at < RATING_MS;
  // What an empty playlist says in place of songs.
  const menuId = top.screen.kind === 'menu' ? top.screen.id : '';
  const emptyNote = EMPTY[menuId.startsWith('playlist:') ? 'playlist' : menuId];
  const empty = emptyNote && !items.some((item) => item.songs && !item.more) ? emptyNote(owner) : null;

  return (
    <div className="os-app os-ipod-app">
      <div className="os-ipod" data-look={prefs.look} aria-label="iPod">
        {/* Touching the screen (dragging Cover Flow, clicking a row) is a touch too. */}
        <div className="os-ipod-screen" data-now={now || undefined} data-dim={dim || undefined} onPointerDown={wake} onWheel={wake}>
          <header className="os-ipod-header">
            <span className="os-ipod-state" aria-hidden="true">
              {music.playing ? <PlayGlyph /> : music.owner ? <PauseGlyph /> : null}
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
            <div className="os-ipod-now" data-show={prefs.show} data-flash={flash ? true : undefined}>
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
                <p className="os-ipod-count">
                  {showRating && (unsaved || !owner) && <span>{unsaved ? 'Couldn’t save the rating' : 'Jincheng’s rating'}</span>}
                  {position >= 0 ? `${position + 1} of ${queue.length}` : ''}
                </p>
              </div>
              {showRating ? (
                <div className="os-ipod-bar os-ipod-rating" role="img" aria-label={`${owner ? 'Your' : 'Jincheng’s'} rating: ${ratingLabel(stars)}`}>
                  <Stars rating={stars} />
                </div>
              ) : showVolume ? (
                <div className="os-ipod-bar" aria-label={`Volume ${music.volume}`}>
                  <SpeakerLowGlyph />
                  <div className="os-ipod-progress">
                    <span style={{ width: `${music.volume}%` }} />
                  </div>
                  <SpeakerHighGlyph />
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
            <div className="os-ipod-menu">
              {/* Keyed by the menu, so a new one starts at the top. */}
              <div key={`${stack.length}:${title}`} ref={list} className="os-ipod-scroll" onScroll={placeThumb}>
                <ul role="listbox" aria-label={title}>
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
                      aria-selected={i === chosen}
                      data-tall={item.cover ? true : undefined}
                      data-flash={flash && i === chosen ? true : undefined}
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
                          <Marquee text={item.label} run={i === chosen} />
                          <small>{item.sub}</small>
                        </span>
                      ) : (
                        <Marquee className="os-ipod-label-text" text={item.label} run={i === chosen} />
                      )}
                      {item.value && <span className="os-ipod-value">{item.value}</span>}
                      {item.more && <span aria-hidden="true">›</span>}
                    </li>
                  ))}
                </ul>
                {empty && <p className="os-ipod-empty">{empty}</p>}
              </div>
              <div className="os-ipod-scrollbar" aria-hidden="true">
                <span ref={thumb} />
              </div>
              {note && (
                <p className="os-ipod-problem" role="alert">
                  {note.text}
                </p>
              )}
            </div>
          )}

          {kind === 'coverflow' && <CoverFlow input={setView} start={music.owner ? song.album : undefined} onPlay={playSong} />}
          {kind === 'brick' && <Brick input={setView} />}
          {kind === 'quiz' && <Quiz input={setView} />}
          {kind === 'save' && <SavePlaylist input={setView} onSaved={saved} onCancel={pop} />}
        </div>

        <Wheel onStep={step} onPress={press} onChoose={choose} onHold={hold} />
      </div>
    </div>
  );
}

/** The click wheel: turn it for steps, press its edges for buttons and its centre to choose (or hold it). */
function Wheel({
  onStep,
  onPress,
  onChoose,
  onHold
}: {
  onStep: (delta: number) => void;
  onPress: (button: 'menu' | 'next' | 'previous' | 'play') => void;
  onChoose: () => void;
  onHold: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number; turned: number; pending: number } | null>(null);
  const wheelDelta = useRef(0);
  // The centre button held down: it holds after HOLD_MS, and then letting go doesn't choose too.
  const centre = useRef<{ timer: number; held: boolean } | null>(null);
  const letGo = () => clearTimeout(centre.current?.timer);
  // Closed while the button is held: nothing goes into On-The-Go afterwards.
  useEffect(() => () => clearTimeout(centre.current?.timer), []);

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
        <NextGlyph />
      </span>
      <span className="os-ipod-label" data-at="bottom" aria-hidden="true">
        <PlayPauseGlyph />
      </span>
      <span className="os-ipod-label" data-at="left" aria-hidden="true">
        <PreviousGlyph />
      </span>
      <button
        type="button"
        className="os-ipod-center"
        aria-label="Select (hold to add to On-The-Go)"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          const press = { held: false, timer: 0 };
          press.timer = window.setTimeout(() => {
            press.held = true;
            onHold();
          }, HOLD_MS);
          centre.current = press;
        }}
        onPointerUp={letGo}
        onPointerLeave={letGo}
        onPointerCancel={letGo}
        // A long press on a phone would open the browser's own menu.
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          const press = centre.current;
          centre.current = null;
          if (!press?.held) onChoose();
        }}
      />
    </div>
  );
}

/**
 * Return as the centre button, while the iPod is in front: a press chooses
 * when it's let go, and one held for HOLD_MS holds instead. Typing in a
 * field (the playlist's name) is left alone.
 */
function useCentreKey(active: boolean, onChoose: () => void, onHold: () => void) {
  const latest = useRef({ onChoose, onHold });
  latest.current = { onChoose, onHold };
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    let down = false;
    let held = false;
    const reset = () => {
      down = false;
      clearTimeout(timer);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || useWindows.getState().exposeOpen) return;
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
      // Not the focused button's own click as well.
      e.preventDefault();
      // The key repeating while it's held.
      if (down) return;
      down = true;
      held = false;
      timer = window.setTimeout(() => {
        held = true;
        latest.current.onHold();
      }, HOLD_MS);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !down) return;
      reset();
      if (!held) latest.current.onChoose();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', reset);
    return () => {
      reset();
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', reset);
    };
  }, [active]);
}
