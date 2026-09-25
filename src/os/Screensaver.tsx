import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useOSData } from './context';
import { MOBILE_BREAKPOINT, useWindows } from './store';
import type { OSPhoto } from './types';

/** How long the desktop sits idle before the screensaver starts. */
const IDLE_MS = 2 * 60 * 1000;
/** How long each photo stays up. */
const SLIDE_MS = 8000;
/** Pointer travel, in pixels, that counts as waking up rather than jitter. */
const WAKE_DISTANCE = 6;

/** Pan-and-zoom directions for the Ken Burns drift, picked per slide. */
const DRIFTS = [
  { from: { scale: 1.02, x: '-2%', y: '1%' }, to: { scale: 1.14, x: '2%', y: '-1%' } },
  { from: { scale: 1.14, x: '2%', y: '-2%' }, to: { scale: 1.02, x: '-1%', y: '1%' } },
  { from: { scale: 1.04, x: '1%', y: '2%' }, to: { scale: 1.16, x: '-2%', y: '-1%' } },
  { from: { scale: 1.16, x: '-1%', y: '-1%' }, to: { scale: 1.04, x: '1%', y: '2%' } }
];

function shuffle<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Starts the screensaver after IDLE_MS without input, and stops it on the
 * next input. Doesn't run on phones, or while an iframe (a live demo in the
 * Browser) has focus, since the page can't see input inside it.
 */
function useIdle(onIdle: () => void) {
  useEffect(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT) return;
    let timer = 0;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.activeElement?.tagName === 'IFRAME') reset();
        else onIdle();
      }, IDLE_MS);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [onIdle]);
}

/** A full-screen slideshow of the Photos library, like iPhoto's screensaver. */
export function Screensaver() {
  const { photos, name } = useOSData();
  const active = useWindows((s) => s.screensaverOn);
  const start = useCallback(() => useWindows.getState().setScreensaver(true), []);
  const stop = useCallback(() => useWindows.getState().setScreensaver(false), []);
  useIdle(start);

  return (
    <AnimatePresence>
      {active && photos.length > 0 && <Slideshow photos={photos} name={name} onStop={stop} />}
    </AnimatePresence>
  );
}

function Slideshow({ photos, name, onStop }: { photos: OSPhoto[]; name: string; onStop: () => void }) {
  const reduced = useReducedMotion();
  const deck = useMemo(() => shuffle(photos), [photos]);
  const [index, setIndex] = useState(0);
  const photo = deck[index % deck.length];
  const drift = DRIFTS[index % DRIFTS.length];

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  // Warm the cache so the next photo fades in fully loaded.
  useEffect(() => {
    new Image().src = deck[(index + 1) % deck.length].full;
  }, [index, deck]);

  // Any input wakes the desktop. The listeners attach a moment late so the
  // click or key that started the screensaver doesn't stop it right away.
  useEffect(() => {
    let origin: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      origin ??= { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > WAKE_DISTANCE) onStop();
    };
    const onInput = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      onStop();
    };
    const t = setTimeout(() => {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerdown', onInput, true);
      window.addEventListener('keydown', onInput, true);
      window.addEventListener('wheel', onStop, { passive: true });
    }, 400);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('keydown', onInput, true);
      window.removeEventListener('wheel', onStop);
    };
  }, [onStop]);

  const date = new Date(photo.taken).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  return (
    <motion.div
      className="os-screensaver"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 1.2 }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={`${photo.id}-${index}`}
          className="os-screensaver-slide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
        >
          {/* A blurred copy fills the screen so portrait photos aren't cropped. */}
          <div className="os-screensaver-backdrop" style={{ backgroundImage: `url(${photo.full})`, backgroundColor: photo.color }} />
          <motion.img
            src={photo.full}
            alt=""
            initial={reduced ? false : drift.from}
            animate={reduced ? undefined : drift.to}
            transition={{ duration: (SLIDE_MS + 1600) / 1000, ease: 'linear' }}
          />
        </motion.div>
      </AnimatePresence>
      <p className="os-screensaver-caption">
        <strong>{name}</strong>
        <span>{date}</span>
      </p>
    </motion.div>
  );
}
