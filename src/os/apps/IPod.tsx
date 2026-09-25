import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../registry';
import { launch } from '../registry';
import { useFocusedId } from '../store';
import { lineAt, useLyrics } from '../lyrics';
import { formatTime, lyricOffset, SONGS, useClock, useKeys, useMusic, usePlayer, type Repeat } from '../music';
import { play as playSound } from '../sound';

// An iPod with a click wheel. Drag round the wheel (or scroll, or use the
// arrow keys) to move through the menus; MENU goes back, the centre button
// chooses, and the wheel's edges are ⏮ ⏭ ⏯. The songs are YouTube videos
// (see music.ts), shown in the screen on Now Playing with a line of lyrics.

interface Item {
  label: string;
  /** Shown on the right, for settings. */
  value?: string;
  /** Opens another menu. */
  more?: boolean;
  action?: () => void;
}

type Screen = { kind: 'menu'; id: string; title: string } | { kind: 'now' };

interface Frame {
  screen: Screen;
  selected: number;
}

const REPEATS: Repeat[] = ['off', 'one', 'all'];
const ROW = 19;
/** Degrees of wheel travel per step. */
const STEP = (18 * Math.PI) / 180;

const artists = [...new Set(SONGS.map((s) => s.artist))].sort((a, b) => a.localeCompare(b));

export default function IPod({ win }: AppProps) {
  const { host, status } = usePlayer('ipod');
  const music = useMusic();
  const { time, duration } = useClock();
  const song = SONGS[music.index];
  const lyrics = useLyrics(song, music.owner ? duration : 0);
  const [stack, setStack] = useState<Frame[]>([{ screen: { kind: 'menu', id: 'root', title: 'iPod' }, selected: 0 }]);
  const [showVolume, setShowVolume] = useState(0);
  const focused = useFocusedId() === win.id;

  const top = stack[stack.length - 1];
  const push = (screen: Screen) => setStack((s) => [...s, { screen, selected: 0 }]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const nowPlaying = () => push({ kind: 'now' });
  const playSong = (index: number) => {
    music.play('ipod', index);
    nowPlaying();
  };

  const songsOf = (list: number[]): Item[] => list.map((i) => ({ label: SONGS[i].title, action: () => playSong(i) }));

  const menu = (id: string): Item[] => {
    switch (id) {
      case 'root':
        return [
          { label: 'Music', more: true, action: () => push({ kind: 'menu', id: 'music', title: 'Music' }) },
          {
            label: 'Shuffle Songs',
            action: () => {
              music.setShuffle(true);
              playSong(Math.floor(Math.random() * SONGS.length));
            }
          },
          { label: 'Karaoke', more: true, action: () => launch('karaoke') },
          { label: 'Settings', more: true, action: () => push({ kind: 'menu', id: 'settings', title: 'Settings' }) },
          ...(music.owner ? [{ label: 'Now Playing', more: true, action: nowPlaying }] : [])
        ];
      case 'music':
        return [
          { label: 'Songs', more: true, action: () => push({ kind: 'menu', id: 'songs', title: 'Songs' }) },
          { label: 'Artists', more: true, action: () => push({ kind: 'menu', id: 'artists', title: 'Artists' }) }
        ];
      case 'songs':
        return songsOf(SONGS.map((_, i) => i));
      case 'artists':
        return artists.map((a) => ({ label: a, more: true, action: () => push({ kind: 'menu', id: `artist:${a}`, title: a }) }));
      case 'settings':
        return [
          { label: 'Shuffle', value: music.shuffle ? 'Songs' : 'Off', action: () => music.setShuffle(!music.shuffle) },
          {
            label: 'Repeat',
            value: music.repeat === 'off' ? 'Off' : music.repeat === 'one' ? 'One' : 'All',
            action: () => music.setRepeat(REPEATS[(REPEATS.indexOf(music.repeat) + 1) % REPEATS.length])
          },
          { label: 'About', more: true, action: () => push({ kind: 'menu', id: 'about', title: 'About' }) }
        ];
      case 'about':
        return [
          { label: 'Songs', value: String(SONGS.length) },
          { label: 'Artists', value: String(artists.length) },
          { label: 'Videos', value: 'YouTube' },
          { label: 'Lyrics', value: 'lrclib.net' }
        ];
      default:
        if (id.startsWith('artist:')) {
          const name = id.slice(7);
          return songsOf(SONGS.flatMap((s, i) => (s.artist === name ? [i] : [])));
        }
        return [];
    }
  };

  const items = top.screen.kind === 'menu' ? menu(top.screen.id) : [];

  const step = (delta: number) => {
    playSound('tick');
    if (top.screen.kind === 'now') {
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
    if (top.screen.kind === 'menu') items[top.selected]?.action?.();
  };

  const press = (button: 'menu' | 'next' | 'previous' | 'play') => {
    playSound('click');
    if (button === 'menu') pop();
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
  const now = top.screen.kind === 'now';
  // Keep the chosen row in view.
  const visible = 8;
  const scroll = Math.max(0, Math.min(top.selected - visible + 1, items.length - visible)) * -ROW;

  return (
    <div className="os-app os-ipod-app">
      <div className="os-ipod" aria-label="iPod">
        <div className="os-ipod-screen" data-now={now || undefined}>
          <header className="os-ipod-header">
            <span className="os-ipod-state" aria-hidden="true">
              {music.playing ? '▶' : music.owner ? '❚❚' : ''}
            </span>
            <span>{now ? 'Now Playing' : top.screen.kind === 'menu' ? top.screen.title : ''}</span>
            <span className="os-ipod-battery" aria-hidden="true" />
          </header>

          {/* Always mounted, so the music keeps going under the menus. */}
          <div className="os-ipod-video" ref={host} aria-hidden={!now} />

          {now ? (
            <div className="os-ipod-now">
              {status === 'offline' && <p className="os-ipod-note">YouTube can’t be reached.</p>}
              {line && <p className="os-ipod-caption">{line}</p>}
              <div className="os-ipod-info">
                <strong>{song.title}</strong>
                <span>
                  {song.artist} · {music.index + 1} of {SONGS.length}
                </span>
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
          ) : (
            <div className="os-ipod-menu">
              <ul role="listbox" aria-label={top.screen.kind === 'menu' ? top.screen.title : ''} style={{ translate: `0 ${scroll}px` }}>
                {items.map((item, i) => (
                  <li
                    key={item.label}
                    role="option"
                    aria-selected={i === top.selected}
                    onClick={() => {
                      setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], selected: i }]);
                      playSound('click');
                      item.action?.();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.value && <span className="os-ipod-value">{item.value}</span>}
                    {item.more && <span aria-hidden="true">›</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
