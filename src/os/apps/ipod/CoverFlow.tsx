import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { albumNamed, coverOf, SONGS, tracksOf } from '../../media/library';
import type { ScreenInput } from './input';

// Cover Flow, as on the iPod classic: the albums stand in a row, the one in
// front faces you and the rest turn away, each over its reflection. Turn
// the wheel, or drag the row (it follows the finger, and a flick carries on
// and settles), to leaf through them. The centre button, or a click on the
// front cover, turns the album round to its track list; again plays the
// chosen track. A click on a cover at the side brings it to the front.
//
// Where the row stands is one continuous number (`pos`, in albums), so a
// cover passing the middle turns towards you and away again smoothly
// instead of jumping between places.

export interface FlowAlbum {
  title: string;
  artist: string;
  cover: string;
  tracks: number[];
}

/** Every album a song comes from: whole albums in track order, then singles' albums. */
export function flowAlbums(): FlowAlbum[] {
  const titles = [...new Set(SONGS.map((s) => s.album).filter((a): a is string => !!a))];
  return titles
    .map((title) => {
      const whole = albumNamed(title);
      const tracks = whole ? tracksOf(whole) : SONGS.flatMap((s, i) => (s.album === title ? [i] : []));
      const first = SONGS[tracks[0]];
      return { title, artist: first.artist, cover: whole?.cover ?? coverOf(first), tracks };
    })
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

const ALBUMS = flowAlbums();
const LAST = ALBUMS.length - 1;
/** Pixels of drag per album. */
const SPACING = 42;
/** The spring every move settles with. */
const SPRING = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 } as const;

/**
 * Where a cover stands `d` albums from the middle of the row (d may be
 * fractional mid-move): facing you at 0, turned 66° away and set back beyond
 * ±1, and everything in between on the way.
 */
function place(d: number) {
  const t = Math.max(-1, Math.min(1, d));
  const beyond = Math.abs(d) > 1 ? (Math.abs(d) - 1) * 22 * Math.sign(d) : 0;
  const x = t * 62 + beyond;
  const z = 26 - Math.abs(t) * 60;
  return `translateX(calc(-50% + ${x.toFixed(2)}px)) translateZ(${z.toFixed(2)}px) rotateY(${(-t * 66).toFixed(2)}deg)`;
}

function Cover({ album, index, pos, onPick }: { album: FlowAlbum; index: number; pos: MotionValue<number>; onPick: (index: number) => void }) {
  const transform = useTransform(pos, (p) => place(index - p));
  // Nearer the middle draws on top; far off-screen ones aren't drawn.
  const zIndex = useTransform(pos, (p) => 100 - Math.round(Math.abs(index - p) * 10));
  const opacity = useTransform(pos, (p) => (Math.abs(index - p) > 5.5 ? 0 : 1));
  return (
    <motion.img
      className="os-cf-cover"
      src={album.cover}
      alt={album.title}
      draggable={false}
      style={{ transform, zIndex, opacity }}
      onClick={() => onPick(index)}
    />
  );
}

export function CoverFlow({
  input,
  start,
  onPlay
}: {
  input: (handle: ScreenInput | null) => void;
  /** The album to open on: the one playing, if any. */
  start?: string;
  onPlay: (index: number, queue: number[]) => void;
}) {
  const first = Math.max(0, ALBUMS.findIndex((a) => a.title === start));
  const pos = useMotionValue(first);
  const [at, setAt] = useState(first);
  const [flipped, setFlipped] = useState(false);
  const [track, setTrack] = useState(0);
  const reduced = useReducedMotion();
  const album = ALBUMS[at];
  /** Set while the row is being dragged, so the click that ends a drag doesn't count. */
  const dragging = useRef(false);
  /** The album the row is settling on, while it's on its way there. */
  const target = useRef(first);
  const moving = useRef(false);

  // The caption follows whichever cover is nearest the middle.
  useMotionValueEvent(pos, 'change', (p) => {
    const nearest = Math.max(0, Math.min(LAST, Math.round(p)));
    setAt((a) => (a === nearest ? a : nearest));
  });

  /** Slides the row to an album, from wherever it is and at whatever speed it's going. */
  const settle = (index: number, velocity = pos.getVelocity()) => {
    const to = Math.max(0, Math.min(LAST, Math.round(index)));
    target.current = to;
    moving.current = true;
    // With reduced motion: a short, plain glide instead of the springy one.
    const glide = reduced ? animate(pos, to, { duration: 0.2, ease: 'easeOut' }) : animate(pos, to, { ...SPRING, velocity });
    glide.then(() => {
      if (target.current === to) moving.current = false;
    });
  };

  const flip = () => {
    setTrack(0);
    setFlipped(true);
  };

  useEffect(() => {
    input({
      step: (delta) => {
        if (flipped) setTrack((t) => Math.min(album.tracks.length - 1, Math.max(0, t + delta)));
        // Quick turns stack up: step from where the row is heading, not where it is.
        else settle((moving.current ? target.current : Math.round(pos.get())) + delta);
      },
      choose: () => (flipped ? onPlay(album.tracks[track], album.tracks) : flip()),
      // MENU turns the album back round before it leaves Cover Flow.
      back: () => {
        if (!flipped) return false;
        setFlipped(false);
        return true;
      }
    });
    return () => input(null);
  });

  // Dragging: the row follows the pointer 1:1, with resistance past either
  // end; letting go carries it on by its speed and settles on an album.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (flipped || e.button !== 0) return;
    const el = e.currentTarget;
    const startX = e.clientX;
    const from = pos.get();
    pos.stop();
    moving.current = false;
    dragging.current = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!dragging.current && Math.abs(dx) < 4) return;
      if (!dragging.current) el.setPointerCapture(e.pointerId);
      dragging.current = true;
      let p = from - dx / SPACING;
      if (p < 0) p *= 0.35;
      if (p > LAST) p = LAST + (p - LAST) * 0.35;
      pos.set(p);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!dragging.current) return;
      const velocity = pos.getVelocity();
      // A flick travels a little further, as far as its speed carries it.
      settle(pos.get() + velocity * 0.18, velocity);
      // Let the click that ends the drag pass first.
      setTimeout(() => (dragging.current = false), 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // A trackpad's sideways (or any) scroll moves the row too, and settles when it stops.
  const wheelTimer = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (flipped) return;
    e.stopPropagation();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    pos.stop();
    moving.current = false;
    pos.set(Math.max(-0.4, Math.min(LAST + 0.4, pos.get() + delta / (SPACING * 1.6))));
    clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => settle(pos.get(), 0), 120);
  };

  const pick = (index: number) => {
    if (dragging.current) return;
    if (index === Math.round(pos.get())) flip();
    else settle(index, 0);
  };

  // Keep the chosen track in view on the back of the album.
  const listTop = Math.max(0, track - 5) * -17;

  return (
    <div className="os-cf" data-flipped={flipped || undefined}>
      <div className="os-cf-stage" onPointerDown={onPointerDown} onWheel={onWheel}>
        {ALBUMS.map((a, i) => (
          <Cover key={a.title} album={a} index={i} pos={pos} onPick={pick} />
        ))}
      </div>
      <p className="os-cf-caption" key={album.title}>
        <strong>{album.title}</strong>
        <span>{album.artist}</span>
      </p>
      {flipped && (
        <div className="os-cf-back" key={`back:${album.title}`}>
          <header>
            <img src={album.cover} alt="" />
            <span>
              <strong>{album.title}</strong>
              <small>{album.artist}</small>
            </span>
          </header>
          <ol style={{ translate: `0 ${listTop}px` }}>
            {album.tracks.map((i, n) => (
              <li
                key={i}
                aria-selected={n === track}
                onClick={() => {
                  setTrack(n);
                  onPlay(i, album.tracks);
                }}
              >
                <span>{SONGS[i].track ?? n + 1}</span>
                {SONGS[i].title}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
