import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { loadJSON, onStored, saveJSON } from '../core/storage';
import { lyricOffset, SONGS } from '../media/library';
import { lineAt, lineFill, useLyrics } from '../media/lyrics';
import { currentTime, useClock, useMusic } from '../media/music';

// The song's lyrics floating over the desktop, two lines at a time: the one
// being sung fills from the left as Karaoke's does, the next waits under
// it. They sit above the Dock until dragged somewhere else, and stay where
// they were left (os-desktop-lyrics, as a share of the screen, so a
// resized window keeps them in the same place). Clicks go through them
// except on the text, which is what's dragged.

const PLACE_KEY = 'os-desktop-lyrics';

/** Where the lyrics' centre sits, from 0 to 1 across and down the desktop; null above the Dock. */
type Place = { x: number; y: number } | null;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function DesktopLyrics() {
  const index = useMusic((s) => s.index);
  const playing = useMusic((s) => s.playing);
  const offsets = useMusic((s) => s.offsets);
  const song = SONGS[index];
  const { duration } = useClock(1000);
  const lyrics = useLyrics(song, duration);
  const offset = lyricOffset(song, offsets);
  const lines = lyrics.state === 'ready' ? lyrics.lines : null;
  const [line, setLine] = useState(-1);
  const now = useRef<HTMLParagraphElement>(null);
  const [place, setPlace] = useState<Place>(() => loadJSON<Place>(PLACE_KEY, null));
  const drag = useRef<{ dx: number; dy: number; halfW: number; halfH: number; to: Place } | null>(null);

  // Moved in another tab of this visitor's: follow it.
  useEffect(() => onStored(PLACE_KEY, () => setPlace(loadJSON<Place>(PLACE_KEY, null))), []);

  // Which line is being sung, and how far through it: every frame while
  // the song plays, once when it's paused.
  useEffect(() => {
    if (!lines) return setLine(-1);
    let frame = 0;
    const tick = () => {
      const t = currentTime() + offset;
      const i = lineAt(lines, t);
      setLine(i);
      if (i >= 0) now.current?.style.setProperty('--fill', `${(lineFill(lines, i, t) * 100).toFixed(1)}%`);
      if (playing) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [lines, offset, playing]);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = {
      dx: e.clientX - (box.left + box.width / 2),
      dy: e.clientY - (box.top + box.height / 2),
      halfW: box.width / 2,
      halfH: box.height / 2,
      to: place
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Kept whole on screen, and below the menu bar.
    const { dx, dy, halfW, halfH } = drag.current;
    const w = window.innerWidth;
    const h = window.innerHeight;
    drag.current.to = {
      x: clamp(e.clientX - dx, Math.min(halfW, w / 2), Math.max(w - halfW, w / 2)) / w,
      y: clamp(e.clientY - dy, Math.min(24 + halfH, h / 2), Math.max(h - halfH, h / 2)) / h
    };
    setPlace(drag.current.to);
  };
  const onUp = () => {
    if (!drag.current) return;
    saveJSON(PLACE_KEY, drag.current.to);
    drag.current = null;
  };

  const text = (i: number) => (lines?.[i] ? lines[i].text || '♪' : '');
  const title = `${song.title} · ${song.artist}`;
  const [first, second] = lines && line >= 0 ? [text(line), text(line + 1)] : [title, lyrics.state === 'loading' ? '…' : ''];

  return (
    <div
      className="os-desktop-lyrics"
      aria-hidden="true"
      data-placed={place ? true : undefined}
      style={place ? { left: `${place.x * 100}%`, top: `${place.y * 100}%` } : undefined}
    >
      <div
        className="os-desktop-lyrics-text"
        title="Drag to move. Turn off in the iPod's Settings."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <p ref={now} data-at={lines && line >= 0 ? 'now' : 'title'}>
          {first}
        </p>
        <p data-at="next">{second}</p>
      </div>
    </div>
  );
}
