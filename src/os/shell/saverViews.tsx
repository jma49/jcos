import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SaverStyle } from '../core/store';
import { clockTimeZone, usePlace } from '../ambient/place';
import { describe, useWeather } from '../ambient/weather';
import { SCENIC } from '../look/wallpapers';
import { Bounce, Flurry, SoapboxSaver } from './savers';
import { useReduceMotion } from '../core/system';

// What the screen savers draw. Loaded only when one first starts (or
// System Preferences shows a preview), so none of it weighs on the
// desktop's first load; Screensaver.tsx decides when.

/** Every screen saver but the slideshow; also the previews in System Preferences. */
export const SAVER_VIEWS: Partial<Record<SaverStyle, () => ReactNode>> = {
  flurry: () => <Flurry />,
  soapbox: () => <SoapboxSaver />,
  starfield: () => <Starfield />,
  clock: () => <DriftingClock />,
  bounce: () => <Bounce />
};
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

/** The screen saver itself, fading in and out over the desktop. */
export default function ScreensaverLayer({ active, style, onStop }: { active: boolean; style: SaverStyle; onStop: () => void }) {
  return (
    <AnimatePresence>
      {active && (
        <Saver key={style} onStop={onStop}>
          {style === 'photos' ? <Slideshow /> : SAVER_VIEWS[style]?.()}
        </Saver>
      )}
    </AnimatePresence>
  );
}

/** The full-screen layer every screensaver sits in; any input wakes the desktop. */
function Saver({ onStop, children }: { onStop: () => void; children: ReactNode }) {
  // The listeners attach a moment late so the click or key that started the
  // screensaver doesn't stop it right away.
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

  return (
    <motion.div
      className="os-screensaver"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 1.2 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A slideshow of Mac OS X's desktop pictures, panning slowly as the Ken
 * Burns screen saver did. (Jincheng's own photos stay in Photos.)
 */
function Slideshow() {
  const reduced = useReduceMotion();
  const deck = useMemo(() => shuffle(SCENIC), []);
  const [index, setIndex] = useState(0);
  const photo = deck[index % deck.length];
  const drift = DRIFTS[index % DRIFTS.length];

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  // Warm the cache so the next photo fades in fully loaded.
  useEffect(() => {
    new Image().src = deck[(index + 1) % deck.length].value;
  }, [index, deck]);

  return (
    <>
      <AnimatePresence initial={false}>
        <motion.div
          key={`${photo.value}-${index}`}
          className="os-screensaver-slide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
        >
          {/* A blurred copy fills the screen so portrait photos aren't cropped. */}
          <div className="os-screensaver-backdrop" style={{ backgroundImage: `url(${photo.value})` }} />
          <motion.img
            src={photo.value}
            alt=""
            initial={reduced ? false : drift.from}
            animate={reduced ? undefined : drift.to}
            transition={{ duration: (SLIDE_MS + 1600) / 1000, ease: 'linear' }}
          />
        </motion.div>
      </AnimatePresence>
      <p className="os-screensaver-caption">
        <strong>{photo.name}</strong>
      </p>
    </>
  );
}

/** Stars streaming out from the middle of the screen. Also used as a preview in System Preferences. */
function Starfield() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReduceMotion();

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const DEPTH = 1000;
    let w = 0;
    let h = 0;
    const stars = Array.from({ length: 700 }, () => ({ x: 0, y: 0, z: 0 }));
    const place = (star: (typeof stars)[number], anywhere: boolean) => {
      star.x = (Math.random() - 0.5) * 2000;
      star.y = (Math.random() - 0.5) * 2000;
      star.z = anywhere ? Math.random() * DEPTH : DEPTH;
    };
    stars.forEach((s) => place(s, true));

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    let last = performance.now();
    let frame = 0;
    const draw = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const scale = Math.max(w, h) / 2;
      for (const star of stars) {
        const prevZ = star.z;
        star.z -= (reduced ? 20 : 260) * dt;
        if (star.z <= 1) {
          place(star, false);
          continue;
        }
        const x = w / 2 + (star.x / star.z) * scale * 0.5;
        const y = h / 2 + (star.y / star.z) * scale * 0.5;
        const px = w / 2 + (star.x / prevZ) * scale * 0.5;
        const py = h / 2 + (star.y / prevZ) * scale * 0.5;
        if (x < 0 || x > w || y < 0 || y > h) {
          place(star, false);
          continue;
        }
        const glow = 1 - star.z / DEPTH;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.3 + glow * 0.7).toFixed(2)})`;
        ctx.lineWidth = Math.max(1, glow * 3);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x + 0.6, y + 0.6);
        ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [reduced]);

  return <canvas ref={canvas} className="os-saver-canvas" />;
}

/** The time and weather where the visitor is, moving every few seconds. Also a preview in System Preferences. */
function DriftingClock() {
  const place = usePlace();
  const weather = useWeather(place);
  const [now, setNow] = useState(() => new Date());
  const [spot, setSpot] = useState({ x: 50, y: 45 });

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    const move = setInterval(() => setSpot({ x: 32 + Math.random() * 36, y: 28 + Math.random() * 44 }), 8000);
    return () => {
      clearInterval(tick);
      clearInterval(move);
    };
  }, []);

  const timeZone = clockTimeZone(place);
  const time = now.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' });
  const w = weather && weather !== 'error' ? weather : null;

  return (
    <div className="os-saver-clock-stage">
      <motion.div
        className="os-saver-clock"
        animate={{ left: `${spot.x}%`, top: `${spot.y}%` }}
        transition={{ duration: 2.4, ease: 'easeInOut' }}
      >
        <strong>{time}</strong>
        <span>{date}</span>
        {place && (
          <span>
            {place.source === 'fallback' ? '' : `${place.city} · `}
            {w ? `${describe(w.condition).icon} ${w.temp}°${w.unit}` : ''}
          </span>
        )}
      </motion.div>
    </div>
  );
}
