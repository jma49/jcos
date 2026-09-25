import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { getSocial, type Post } from './social';
import { useOSData } from './context';
import { plain } from './apps/inline';

// More screen savers: Flurry (after Mac OS X's), Soapbox (Jincheng's posts,
// in the manner of "Word of the Day") and a bouncing JM. Each fills its
// parent, so System Preferences can show it in a small preview too.

/** A canvas that fills its parent at device resolution, redrawn by `frame` every animation frame. */
function useCanvas(
  frame: (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void,
  reset?: (w: number, h: number) => void
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useRef(frame);
  draw.current = frame;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      reset?.(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    let last = performance.now();
    let id = 0;
    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      draw.current(ctx, w, h, dt);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvas} className="os-saver-canvas" />;
}

interface Stream {
  hue: number;
  /** Frequencies and phases of the sums of sines the head follows. */
  fx: number[];
  fy: number[];
  px: number[];
  py: number[];
  trail: { x: number; y: number }[];
}

const makeStream = (hue: number): Stream => ({
  hue,
  fx: [0.31 + Math.random() * 0.2, 0.73 + Math.random() * 0.3],
  fy: [0.27 + Math.random() * 0.2, 0.61 + Math.random() * 0.3],
  px: [Math.random() * 6, Math.random() * 6],
  py: [Math.random() * 6, Math.random() * 6],
  trail: []
});

/** Flurry: glowing wisps of colour winding around the centre, as in Mac OS X. */
export function Flurry() {
  const reduced = useReducedMotion();
  const streams = useRef<Stream[]>([]);
  const time = useRef(0);
  const TRAIL = 150;
  const STRANDS = 5;

  return useCanvas(
    (ctx, w, h, dt) => {
      if (!streams.current.length) streams.current = [makeStream(200), makeStream(320), makeStream(40), makeStream(140)];
      time.current += dt * (reduced ? 0.5 : 1.9);
      const t = time.current;
      // The whole trail is redrawn each frame, so clear fully (a partial fade leaves grey ghosts).
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const r = Math.min(w, h) * 0.36;
      const scale = Math.min(w, h);
      for (const s of streams.current) {
        const x = w / 2 + r * (Math.sin(t * s.fx[0] + s.px[0]) * 0.7 + Math.sin(t * s.fx[1] + s.px[1]) * 0.3);
        const y = h / 2 + r * (Math.cos(t * s.fy[0] + s.py[0]) * 0.7 + Math.sin(t * s.fy[1] + s.py[1]) * 0.3);
        s.trail.push({ x, y });
        if (s.trail.length > TRAIL) s.trail.shift();
        s.hue = (s.hue + dt * 10) % 360;
        // Several strands per stream, fanning out towards the tail like Flurry's wisps.
        for (let strand = 0; strand < STRANDS; strand++) {
          const spread = (strand - (STRANDS - 1) / 2) * scale * 0.012;
          const wobble = strand * 1.7;
          for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            for (let i = 0; i < s.trail.length; i++) {
              const k = 1 - i / s.trail.length;
              const off = spread * k * (1 + 0.5 * Math.sin(t * 2 + i * 0.15 + wobble));
              const p = s.trail[i];
              if (i === 0) ctx.moveTo(p.x + off, p.y - off);
              else ctx.lineTo(p.x + off, p.y - off);
            }
            const hue = (s.hue + strand * 9) % 360;
            // A wide, faint glow, then a thin bright core.
            ctx.strokeStyle = pass === 0 ? `hsla(${hue}, 95%, 55%, 0.07)` : `hsla(${hue}, 100%, 72%, 0.35)`;
            ctx.lineWidth = pass === 0 ? scale * 0.028 : scale * 0.0035;
            ctx.stroke();
          }
        }
      }
    },
    () => {
      for (const s of streams.current) s.trail = [];
    }
  );
}

const BOUNCE_COLORS = ['#ff5f57', '#febc2e', '#28c840', '#3a95ee', '#a05cf0', '#ff8a3d', '#ffffff'];

/** A bouncing JM, changing colour at every wall. Hitting a corner is an event. */
export function Bounce() {
  const reduced = useReducedMotion();
  const pos = useRef({ x: 40, y: 40, vx: 1, vy: 1, color: 0, flash: 0 });

  return useCanvas(
    (ctx, w, h, dt) => {
      const p = pos.current;
      const size = Math.max(28, Math.min(w, h) * 0.14);
      ctx.font = `${size}px 'Apple Garamond', 'EB Garamond', Garamond, Georgia, serif`;
      const tw = ctx.measureText('JM').width;
      const th = size * 0.8;
      const speed = Math.min(w, h) * (reduced ? 0.05 : 0.16);
      p.x += p.vx * speed * dt;
      p.y += p.vy * speed * dt;
      let hits = 0;
      if (p.x <= 0 || p.x + tw >= w) {
        p.vx *= -1;
        p.x = Math.max(0, Math.min(w - tw, p.x));
        hits++;
      }
      if (p.y <= 0 || p.y + th >= h) {
        p.vy *= -1;
        p.y = Math.max(0, Math.min(h - th, p.y));
        hits++;
      }
      if (hits) p.color = (p.color + 1) % BOUNCE_COLORS.length;
      if (hits === 2) p.flash = 1;
      ctx.fillStyle = p.flash > 0 ? `rgba(255, 255, 255, ${p.flash * 0.35})` : '#000';
      ctx.fillRect(0, 0, w, h);
      p.flash = Math.max(0, p.flash - dt);
      ctx.fillStyle = BOUNCE_COLORS[p.color];
      ctx.textBaseline = 'top';
      ctx.fillText('JM', p.x, p.y - size * 0.1);
    },
    (w, h) => {
      pos.current.x = Math.random() * w * 0.5;
      pos.current.y = Math.random() * h * 0.5;
    }
  );
}

const QUOTE_MS = 9000;

/** Jincheng's Soapbox posts, one at a time in large type; the bio if there are none. */
export function SoapboxSaver() {
  const { bio, name } = useOSData();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let live = true;
    getSocial()
      .then((social) => social?.listPosts())
      .then((list) => live && setPosts(list ?? []))
      .catch(() => live && setPosts([]));
    const timer = setInterval(() => setIndex((i) => i + 1), QUOTE_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const quotes =
    posts && posts.length
      ? posts.map((p) => ({
          text: p.body,
          kind: p.kind === 'rant' ? 'Rant' : 'Note',
          meta: [new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), p.place]
            .filter(Boolean)
            .join(' · ')
        }))
      : bio.short.map((p) => ({ text: plain(p), kind: 'About', meta: name }));
  const quote = quotes[index % quotes.length];

  return (
    <div className="os-saver-quote-stage">
      <AnimatePresence mode="wait">
        {posts !== null && quote && (
          <motion.figure
            key={index}
            className="os-saver-quote"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 1.1, ease: 'easeInOut' }}
          >
            <span className="os-saver-quote-kind">{quote.kind}</span>
            <blockquote>{quote.text}</blockquote>
            <figcaption>{quote.meta}</figcaption>
          </motion.figure>
        )}
      </AnimatePresence>
    </div>
  );
}
