import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { isPhone, useFocusedId, useWindows } from '../../core/store';
import { useKeys } from '../../core/useKeys';
import { artOf, DiscIcon } from '../../media/discArt';
import { chapterAt, chapterPictures, chapterStart, CHAPTERS, noteLength, pictureOf, useShelfRefresh, type ShelfDisc } from '../../media/discs';
import { ejectDisc, useDrive } from '../../media/drive';
import { formatTime, useMusic } from '../../media/music';
import { useIsOwner } from '../../social/owner';
import { FloatingController } from './Controller';
import { Chapters, Hud } from './FullScreen';
import { useDiscPlayer } from './useDiscPlayer';

// DVD Player, as in Tiger: a window named after the disc in the drive,
// showing the picture, with the Controller floating below it. A disc
// starts at its menu (Play Movie, Scene Selection, Loop), which the
// Controller's pad, the arrow keys and Return move through. A video is
// four chapters of equal length, pictured by YouTube's own frames.
//
// Full screen (⌘F, or a double-click on the picture) is Leopard's: the
// chapters along the top and the controls along the bottom, which come
// when the pointer moves and go when it rests while the disc plays. A
// phone, where DVD Player has the whole screen, always looks that way.
//
// Keys: Space plays or pauses, ←/→ go to the previous or next chapter
// (in a menu they move the choice, with ↑/↓ and Return), Escape goes
// back a menu (or out of full screen), ⌘F is full screen and ⌘E ejects.

type Screen = 'menu' | 'scenes' | 'movie';

/** What the disc's menu offers. */
const MENU = ['Play Movie', 'Scene Selection', 'Loop'] as const;

export default function DVDPlayer({ win }: AppProps) {
  const { disc, inserted } = useDrive();
  const owner = useIsOwner();
  const front = useFocusedId() === win.id;
  const phone = isPhone();
  const [screen, setScreen] = useState<Screen>('menu');
  const [choice, setChoice] = useState(0);
  const [loop, setLoop] = useState(false);
  const [osd, setOsd] = useState<{ text: string; at: number } | null>(null);
  const [clock, setClock] = useState({ time: 0, duration: 0 });
  /** A chapter asked for before the video's length was known. */
  const wanted = useRef<number | null>(null);
  const volume = useMusic((s) => s.volume);
  const screenEl = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const canFullScreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  // The shelf is read fresh while DVD Player is open, for a disc relabelled meanwhile.
  useShelfRefresh();

  const player = useDiscPlayer(disc?.id ?? null, () => {
    if (loop) player.play(0);
    else setScreen('menu');
  });

  // Each disc put in starts at its menu.
  useEffect(() => {
    setScreen('menu');
    setChoice(0);
    setOsd(null);
    wanted.current = null;
  }, [inserted]);

  // The window is named after the disc in it.
  const title = disc?.title ?? 'DVD Player';
  useEffect(() => {
    useWindows.getState().setTitle(win.id, title);
  }, [win.id, title]);

  // Where the video is, a few times a second, for the display and the chapters.
  const { time, duration } = player;
  useEffect(() => {
    if (!disc) return;
    const tick = () => {
      const next = { time: time(), duration: duration() };
      setClock((c) => (Math.abs(c.time - next.time) < 0.2 && c.duration === next.duration ? c : next));
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [disc, time, duration]);

  // Once the video's length is known and it plays, a chapter asked for before goes on.
  const { seek, playing } = player;
  useEffect(() => {
    if (clock.duration <= 0 || wanted.current === null || !playing) return;
    seek(chapterStart(wanted.current, clock.duration));
    wanted.current = null;
  }, [clock.duration, playing, seek]);

  // The length is kept, once per disc: in this browser for a DVD-R, in the database when the owner watches one of the owner's.
  const noted = useRef<string | null>(null);
  useEffect(() => {
    if (!disc || clock.duration <= 0 || noted.current === disc.id) return;
    noted.current = disc.id;
    noteLength(disc, clock.duration, owner);
  }, [disc, clock.duration, owner]);

  const flash = (text: string) => setOsd({ text, at: Date.now() });
  useEffect(() => {
    if (!osd) return;
    const timer = setTimeout(() => setOsd(null), 1600);
    return () => clearTimeout(timer);
  }, [osd]);

  const chapter = chapterAt(clock.time, clock.duration);

  // Full screen is the browser's, on the picture (the player can't move without reloading).
  useEffect(() => {
    const onChange = () => setFull(!!screenEl.current && document.fullscreenElement === screenEl.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (canFullScreen && disc) void screenEl.current?.requestFullscreen().catch(() => {});
  };

  // The chapters and controls rest out of sight while the disc plays, until the pointer moves.
  const hud = !!disc && (full || phone);
  const resting = hud && screen === 'movie' && player.playing;
  const [idle, setIdle] = useState(false);
  const [stirred, setStirred] = useState(0);
  const lastStir = useRef(0);
  const stir = () => {
    const now = Date.now();
    if (!idle && now - lastStir.current < 500) return;
    lastStir.current = now;
    setIdle(false);
    setStirred((n) => n + 1);
  };
  useEffect(() => {
    if (!resting) return setIdle(false);
    const timer = setTimeout(() => setIdle(true), 2500);
    return () => clearTimeout(timer);
  }, [resting, stirred]);

  const playChapter = (n: number) => {
    setScreen('movie');
    if (clock.duration > 0) player.play(chapterStart(n, clock.duration));
    else {
      wanted.current = n > 0 ? n : null;
      player.play(0);
    }
    flash(`Chapter ${n + 1}`);
  };

  const playPause = () => {
    if (!disc) return;
    if (screen !== 'movie') {
      setScreen('movie');
      player.play();
      flash('▶ Play');
    } else if (player.playing) {
      player.pause();
      flash('❚❚ Pause');
    } else {
      player.play();
      flash('▶ Play');
    }
  };

  const toMenu = () => {
    if (player.playing) player.pause();
    setScreen('menu');
    setChoice(0);
  };

  const stop = () => {
    player.pause();
    player.seek(0);
    setScreen('menu');
    setChoice(0);
  };

  const step = (by: 1 | -1) => {
    if (screen !== 'movie') return;
    // Back goes to the start of this chapter, or the one before when it's just begun.
    const from = chapterStart(chapter, clock.duration);
    const n = by > 0 ? chapter + 1 : clock.time - from > 3 ? chapter : chapter - 1;
    if (n >= CHAPTERS) return;
    player.seek(chapterStart(Math.max(0, n), clock.duration));
    flash(`Chapter ${Math.max(0, n) + 1}`);
  };

  const choose = (i: number) => {
    if (screen === 'scenes') {
      if (i >= CHAPTERS) {
        setScreen('menu');
        setChoice(1);
      } else playChapter(i);
      return;
    }
    if (i === 0) playChapter(0);
    else if (i === 1) {
      setScreen('scenes');
      setChoice(0);
    } else setLoop((l) => !l);
  };

  const pad = (dir: 'up' | 'down' | 'left' | 'right') => {
    if (screen === 'movie') {
      if (dir === 'left') step(-1);
      if (dir === 'right') step(1);
      return;
    }
    // The menu is a column; the scenes are a row of four and Main Menu under them.
    const count = screen === 'menu' ? MENU.length : CHAPTERS + 1;
    const across = screen === 'scenes' && choice < CHAPTERS;
    const delta =
      dir === 'up' ? (screen === 'scenes' ? (choice === CHAPTERS ? -1 : 0) : -1)
      : dir === 'down' ? (screen === 'scenes' ? (across ? CHAPTERS - choice : 0) : 1)
      : across ? (dir === 'left' ? -1 : 1) : 0;
    setChoice((c) => Math.min(count - 1, Math.max(0, c + delta)));
  };

  const eject = () => {
    player.pause();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    ejectDisc();
  };

  /** A chapter picked in the strip along the top: there, playing or not. */
  const goToChapter = (n: number) => {
    player.seek(chapterStart(n, clock.duration));
    flash(`Chapter ${n + 1}`);
  };

  useKeys(front && !!disc, {
    ' ': playPause,
    ArrowUp: () => pad('up'),
    ArrowDown: () => pad('down'),
    ArrowLeft: () => pad('left'),
    ArrowRight: () => pad('right'),
    Enter: () => (screen === 'movie' ? playPause() : choose(choice)),
    // Leaving full screen, the browser takes Escape itself.
    Escape: () => (screen === 'scenes' ? (setScreen('menu'), setChoice(1)) : screen === 'movie' && !full ? toMenu() : undefined)
  });

  // ⌘E ejects and ⌘F is full screen, as on a Mac (useKeys leaves ⌘ alone).
  const commands = useRef({ eject, toggleFull });
  useEffect(() => {
    commands.current = { eject, toggleFull };
  });
  useEffect(() => {
    if (!front || !disc) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.code === 'KeyE') {
        e.preventDefault();
        commands.current.eject();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        commands.current.toggleFull();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [front, disc]);

  const lcd = disc
    ? {
        title: disc.title,
        chapter: screen === 'movie' ? `Chapter ${chapter + 1}` : 'Menu',
        time: formatTime(screen === 'movie' ? clock.time : 0),
        left: clock.duration > 0 ? `−${formatTime(Math.max(0, clock.duration - (screen === 'movie' ? clock.time : 0)))}` : '',
        playing: player.playing
      }
    : { title: 'No Disc', chapter: '', time: '0:00', left: '', playing: false };

  const controls = {
    lcd,
    playing: player.playing,
    loop,
    volume,
    loaded: !!disc,
    onPad: pad,
    onEnter: () => (screen === 'movie' ? playPause() : choose(choice)),
    onMenu: toMenu,
    onStop: stop,
    onPrevious: () => step(-1),
    onPlayPause: playPause,
    onNext: () => step(1),
    onEject: eject,
    onRewind: () => screen === 'movie' && player.seek(clock.time - 10),
    onForward: () => screen === 'movie' && player.seek(clock.time + 10),
    onLoop: () => setLoop((l) => !l),
    onVolume: (v: number) => useMusic.getState().setVolume(v),
    onFullScreen: toggleFull
  };

  // The Controls menu in the menu bar while DVD Player is in front, as Tiger's had.
  const latest = useRef(controls);
  useEffect(() => {
    latest.current = controls;
  });
  const loaded = !!disc;
  const { playing: isPlaying } = player;
  useEffect(() => {
    const { setMenus } = useWindows.getState();
    const run = (act: (c: typeof latest.current) => void) => () => act(latest.current);
    setMenus(win.id, {
      Controls: [
        { label: isPlaying ? 'Pause' : 'Play', shortcut: 'Space', disabled: !loaded, action: run((c) => c.onPlayPause()) },
        { label: 'Stop', disabled: !loaded, action: run((c) => c.onStop()) },
        { label: '', divider: true },
        { label: 'Previous Chapter', shortcut: '←', disabled: !loaded, action: run((c) => c.onPrevious()) },
        { label: 'Next Chapter', shortcut: '→', disabled: !loaded, action: run((c) => c.onNext()) },
        { label: '', divider: true },
        { label: 'Disc Menu', disabled: !loaded, action: run((c) => c.onMenu()) },
        { label: loop ? 'Loop: On' : 'Loop: Off', disabled: !loaded, action: run((c) => c.onLoop()) },
        { label: '', divider: true },
        { label: full ? 'Exit Full Screen' : 'Enter Full Screen', shortcut: '⌘F', disabled: !loaded || !canFullScreen, action: run((c) => c.onFullScreen()) },
        { label: 'Eject DVD', shortcut: '⌘E', disabled: !loaded, action: run((c) => c.onEject()) }
      ]
    });
    return () => setMenus(win.id, undefined);
  }, [win.id, loaded, isPlaying, loop, full, canFullScreen]);

  const zTop = useWindows((s) => 10 + s.order.length);
  const exposeOpen = useWindows((s) => s.exposeOpen);

  return (
    <div className="os-app os-dvd" data-phone={phone || undefined}>
      <div
        ref={screenEl}
        className="os-dvd-screen"
        data-full={full || undefined}
        data-idle={(resting && idle) || undefined}
        onPointerMove={hud ? stir : undefined}
        onPointerDown={hud ? stir : undefined}
        onDoubleClick={() => screen === 'movie' && !phone && toggleFull()}
      >
        {disc ? (
          // Keyed, so a disc's player never shares its element with another's or the empty screen.
          <Fragment key={disc.id}>
            {/* YouTube's chrome is cropped off (.os-player-frame); until the
                video really plays, its cover hides the rest. */}
            <div className="os-dvd-video" ref={player.host} aria-hidden="true" />
            <img className="os-dvd-cover" src={pictureOf(disc.id, 'hqdefault')} alt="" data-show={!player.live || screen !== 'movie' || undefined} />
            {screen === 'menu' && <DiscMenu disc={disc} choice={choice} loop={loop} onHover={setChoice} onChoose={choose} />}
            {screen === 'scenes' && <Scenes disc={disc} choice={choice} onHover={setChoice} onChoose={choose} />}
            {player.status === 'offline' && <p className="os-dvd-note">YouTube can’t be reached, so the disc can’t be read.</p>}
            {player.status === 'unplayable' && <p className="os-dvd-note">This disc can’t be read: YouTube won’t play the video here any more.</p>}
            {osd && screen === 'movie' && (
              <div className="os-dvd-osd" key={osd.at} aria-hidden="true">
                {osd.text}
              </div>
            )}
            {hud && screen === 'movie' && <Chapters disc={disc} duration={clock.duration} chapter={chapter} onChapter={goToChapter} />}
            {hud && (screen === 'movie' || phone) && (
              <Hud
                disc={disc}
                time={screen === 'movie' ? clock.time : 0}
                duration={clock.duration}
                chapter={chapter}
                playing={player.playing}
                volume={volume}
                full={full}
                canFullScreen={canFullScreen}
                onChapter={goToChapter}
                onSeek={(t) => player.seek(t)}
                onMenu={toMenu}
                onEject={eject}
                onStop={stop}
                onPrevious={() => step(-1)}
                onRewind={controls.onRewind}
                onPlayPause={playPause}
                onForward={controls.onForward}
                onNext={() => step(1)}
                onVolume={controls.onVolume}
                onFullScreen={toggleFull}
              />
            )}
          </Fragment>
        ) : (
          <div className="os-dvd-empty" key="empty">
            <DiscIcon size={96} />
            <p>Insert a disc</p>
            <button type="button" className="os-button" onClick={() => launch('finder', { props: { path: '/Movies' } })}>
              Open Movies…
            </button>
          </div>
        )}
      </div>
      {!phone && front && !win.minimized && !exposeOpen && !full && (
        <FloatingController {...controls} below={{ x: win.x, y: win.y, width: win.width, height: win.height }} z={zTop} />
      )}
    </div>
  );
}

/** The disc's menu, in the manner of iDVD: its name over a blur of its picture, the choices, and a still in a frame. */
function DiscMenu({
  disc,
  choice,
  loop,
  onHover,
  onChoose
}: {
  disc: ShelfDisc;
  choice: number;
  loop: boolean;
  onHover: (i: number) => void;
  onChoose: (i: number) => void;
}) {
  return (
    <div className="os-dvd-menu" style={artOf(disc)}>
      <div className="os-dvd-menu-bg" aria-hidden="true" />
      <div className="os-dvd-menu-text">
        <h1>{disc.title}</h1>
        {disc.artist && <p>{disc.artist}</p>}
        <ul role="menu" aria-label={`${disc.title}: menu`}>
          {MENU.map((label, i) => (
            <li key={label} role="menuitem" aria-selected={i === choice} onPointerEnter={() => onHover(i)} onClick={() => onChoose(i)}>
              {label === 'Loop' ? `Loop: ${loop ? 'On' : 'Off'}` : label}
            </li>
          ))}
        </ul>
      </div>
      <div className="os-dvd-menu-still" style={{ '--still': `url("${chapterPictures(disc.id)[1]}")` } as CSSProperties} aria-hidden="true" />
    </div>
  );
}

/** Scene Selection: the four chapters, each by YouTube's frame where it starts, and a way back. */
function Scenes({ disc, choice, onHover, onChoose }: { disc: ShelfDisc; choice: number; onHover: (i: number) => void; onChoose: (i: number) => void }) {
  return (
    <div className="os-dvd-menu os-dvd-scenes" style={artOf(disc)}>
      <div className="os-dvd-menu-bg" aria-hidden="true" />
      <h2>Scene Selection</h2>
      <ul role="menu" aria-label="Chapters">
        {chapterPictures(disc.id).map((src, i) => (
          <li key={src} role="menuitem" aria-selected={i === choice} onPointerEnter={() => onHover(i)} onClick={() => onChoose(i)}>
            <img src={src} alt="" draggable={false} />
            <span>Chapter {i + 1}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="os-dvd-back" aria-selected={choice === CHAPTERS} onPointerEnter={() => onHover(CHAPTERS)} onClick={() => onChoose(CHAPTERS)}>
        Main Menu
      </button>
    </div>
  );
}
