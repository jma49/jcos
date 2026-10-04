import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { PauseGlyph, PlayGlyph } from '../../core/glyphs';
import { isPhone, useFocusedId, useWindows } from '../../core/store';
import { useKeys } from '../../core/useKeys';
import { artOf, DiscIcon } from '../../media/discArt';
import { chapterAt, chapterPictures, chapterStart, CHAPTERS, noteLength, useShelf, useShelfRefresh, type ShelfDisc } from '../../media/discs';
import { ejectDisc, sameDisc, useDrive } from '../../media/drive';
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
//
// It's in Applications (not kept in the Dock), for the discs on Finder's
// Movies shelf (docs/agents/media.md); the disc in the drive is
// media/drive.ts's. The picture is always 16:9 with black around it. Its
// own YouTube player (useDiscPlayer.ts) takes no pointer, so YouTube's
// hover controls never come up (its middle button after a play or a seek
// does, and DVD Player masks it: media.md).
//
// The Controller (Controller.tsx) is a floating panel, as on a Mac: drawn
// by the app into `.os-root` just above the windows, shown only while DVD
// Player is the window in front (not in Exposé or minimized), dragged by
// its metal and left where it was put (os-dvd). Its buttons leave the keys
// to DVD Player, as a panel of its own (`data-panel`, `ownsKey` in
// core/useKeys.ts).
//
// Full screen (FullScreen.tsx, also in the Controls menu) is the browser's
// full screen on the picture itself, since the player can't move without
// reloading; its controls rest out of sight (and the pointer with them) 2.5
// s after the pointer stops while the disc plays. Its position slider
// (core/useScrub.ts) stays where it's put: dragged, it seeks within what's
// loaded as it goes and properly where it's let go, and the clock doesn't
// move it back meanwhile. What DVD Player says for a moment ("Chapter 2",
// "▶ Play") shows in the corner once the chapters have gone, not under
// them. A slider used with the pointer (volume, position) gives the keys
// back when it's let go (`releaseAfterPointer` in core/useKeys.ts), so
// Space and the arrows stay DVD Player's; tabbed to, it keeps them. The
// Controls menu does what the buttons and keys do.
//
// A disc slides into the slot in the screen's right edge on its way in and
// out (media/insertion.ts, Web Animations, skipped with motion reduced),
// and DVD Player's icon bounces in the Dock as it opens. The disc never
// goes on the desktop, where nothing is added (docs/decisions/0021), so
// the Controller and ⌘E are the ways to eject it.

type Screen = 'menu' | 'scenes' | 'movie';

/** What the disc's menu offers. */
const MENU = ['Play Movie', 'Scene Selection', 'Loop'] as const;

export default function DVDPlayer({ win }: AppProps) {
  const { disc: inDrive, inserted } = useDrive();
  // The disc as the shelf has it now, relabelled or its length known since it went in (else as it went in).
  const shelf = useShelf();
  const disc = inDrive && (shelf.find((d) => sameDisc(d, inDrive)) ?? inDrive);
  const owner = useIsOwner();
  const front = useFocusedId() === win.id;
  const phone = isPhone();
  const [screen, setScreen] = useState<Screen>('menu');
  const [choice, setChoice] = useState(0);
  const [loop, setLoop] = useState(false);
  const [osd, setOsd] = useState<{ text: string; at: number } | null>(null);
  /** A chapter asked for before the video's length was known. */
  const wanted = useRef<number | null>(null);
  const volume = useMusic((s) => s.volume);
  const screenEl = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const canFullScreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  // The shelf is read fresh while DVD Player is open, for the disc in it relabelled meanwhile.
  useShelfRefresh();

  const player = useDiscPlayer(disc?.id ?? null, () => {
    if (loop) player.play(0);
    else setScreen('menu');
  });

  // Each disc put in starts at its menu, with nothing playing (a DVD-R of the video that was playing keeps its player).
  const { pause, seek } = player;
  useEffect(() => {
    pause();
    seek(0);
    setScreen('menu');
    setChoice(0);
    setOsd(null);
    wanted.current = null;
  }, [inserted, pause, seek]);

  // The window is named after the disc in it.
  const title = disc?.title ?? 'DVD Player';
  useEffect(() => {
    useWindows.getState().setTitle(win.id, title);
  }, [win.id, title]);

  // Where the video is, a few times a second, for the display and the chapters. The clock is
  // the disc's that was put in: for the moment another goes in, the time and length of the one
  // before count for nothing (they'd be taken for the new disc's).
  const { time, duration } = player;
  const [ticked, setTicked] = useState({ insertion: -1, time: 0, duration: 0 });
  const hasDisc = !!disc;
  useEffect(() => {
    if (!hasDisc) return;
    const tick = () => {
      const next = { insertion: inserted, time: time(), duration: duration() };
      setTicked((c) => (c.insertion === inserted && Math.abs(c.time - next.time) < 0.2 && c.duration === next.duration ? c : next));
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [hasDisc, inserted, time, duration]);
  const clock = hasDisc && ticked.insertion === inserted ? ticked : { time: 0, duration: 0 };

  // Once the video's length is known and it plays, a chapter asked for before goes on.
  const { playing } = player;
  useEffect(() => {
    if (clock.duration <= 0 || wanted.current === null || !playing) return;
    seek(chapterStart(wanted.current, clock.duration));
    wanted.current = null;
  }, [clock.duration, playing, seek]);

  // The length is kept, and put right if it's off: in this browser for a DVD-R, in the database when the owner watches one
  // of the owner's (tried again once it's known the owner is watching, which can be after the length is).
  const noted = useRef<string | null>(null);
  useEffect(() => {
    const once = disc && `${disc.id}${disc.burnedHere ? '-r' : ''}:${owner}`;
    if (!disc || clock.duration <= 0 || noted.current === once) return;
    noted.current = once;
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
  // Full screen can be refused (not allowed in a frame, no click): the window stays as it is.
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
    // Leaving can be refused (the page in the background): the disc ejects all the same.
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
                video first plays the chapter's frame hides the rest. After
                that the picture stays, paused or not, and for the few
                seconds YouTube shows its own button in the middle after a
                start, a resume or a seek, DVD Player's own covers it. */}
            <div className="os-dvd-video" ref={player.host} aria-hidden="true" />
            <img
              className="os-dvd-cover"
              src={chapterPictures(disc.id)[screen === 'movie' ? chapter : 0]}
              alt=""
              data-show={!player.started || screen !== 'movie' || undefined}
            />
            <div className="os-dvd-seam" data-show={(player.up && player.started && screen === 'movie') || undefined} aria-hidden="true" />
            <div className="os-dvd-mask" data-show={(player.up && player.started && screen === 'movie') || undefined} aria-hidden="true">
              {player.buffering ? <span className="os-dvd-spinner" /> : player.playing ? <PlayGlyph /> : <PauseGlyph />}
            </div>
            {screen === 'menu' && <DiscMenu disc={disc} choice={choice} loop={loop} onHover={setChoice} onChoose={choose} />}
            {screen === 'scenes' && <Scenes disc={disc} choice={choice} onHover={setChoice} onChoose={choose} />}
            {player.status === 'offline' && <p className="os-dvd-note">YouTube can’t be reached, so the disc can’t be read.</p>}
            {player.status === 'unplayable' && <p className="os-dvd-note">This disc can’t be read: YouTube won’t play the video here any more.</p>}
            {/* Not while the chapters are along the top, over its corner: they and the controls say it then. */}
            {osd && screen === 'movie' && !(hud && !(resting && idle)) && (
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
                onSeek={(t, done) => player.seek(t, done)}
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
            <li key={label} role="menuitem" aria-current={i === choice || undefined} onPointerEnter={() => onHover(i)} onClick={() => onChoose(i)}>
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
          <li key={src} role="menuitem" aria-current={i === choice || undefined} onPointerEnter={() => onHover(i)} onClick={() => onChoose(i)}>
            <img src={src} alt="" draggable={false} />
            <span>Chapter {i + 1}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="os-dvd-back" aria-current={choice === CHAPTERS || undefined} onPointerEnter={() => onHover(CHAPTERS)} onClick={() => onChoose(CHAPTERS)}>
        Main Menu
      </button>
    </div>
  );
}
