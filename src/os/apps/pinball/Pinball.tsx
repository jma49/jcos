import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../../core/registry';
import { play } from '../../core/sound';
import { useFocusedId } from '../../core/store';
import { loadJSON, saveJSON } from '../../core/storage';
import { BALL, flip, H, newGame, plunge, pull, RANKS, SEGMENTS, step, TARGETS, tipOf, W, type Sound, type State } from './table';

// Pinball: the table (table.ts) drawn on a canvas, tilted back for depth,
// with the score, balls and rank beside it. Z and / (or the arrow keys, or
// Shift) are the flippers, Space pulls and lets go of the plunger, F2
// starts over. On a phone, tap either half for a flipper. The game pauses
// while the window isn't in front.

const BEST_KEY = 'os-pinball-best';

const SOUNDS: Record<Sound, Parameters<typeof play>[0]> = {
  bumper: 'pop',
  sling: 'click',
  flipper: 'tick',
  lane: 'tick',
  target: 'click',
  drain: 'error',
  launch: 'restore',
  rank: 'chime',
  hole: 'minimize'
};
const sound = (s: Sound) => play(SOUNDS[s]);

/** A fixed field of stars, the same every time. */
const STARS = Array.from({ length: 90 }, (_, i) => {
  const r = Math.sin(i * 12.9898) * 43758.5453;
  const r2 = Math.sin(i * 78.233) * 12345.678;
  return { x: (r - Math.floor(r)) * W, y: (r2 - Math.floor(r2)) * H, s: 0.4 + ((i * 7) % 10) / 10 };
});

function draw(ctx: CanvasRenderingContext2D, s: State) {
  const t = s.time;
  // Deep space, a few stars and a ringed planet, under glass.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1446');
  bg.addColorStop(0.6, '#070b2a');
  bg.addColorStop(1, '#03040f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const star of STARS) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + star.x);
    ctx.fillStyle = '#fff';
    ctx.fillRect(star.x, star.y, star.s, star.s);
  }
  ctx.globalAlpha = 1;
  const planet = ctx.createRadialGradient(170, 430, 6, 190, 450, 62);
  planet.addColorStop(0, '#7fb6ff');
  planet.addColorStop(0.7, '#2c4fa8');
  planet.addColorStop(1, 'rgba(20, 30, 90, 0)');
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(190, 450, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 200, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(190, 450, 92, 18, -0.25, 0, Math.PI * 2);
  ctx.stroke();

  // The rank, faintly, on the playfield.
  ctx.fillStyle = 'rgba(160, 190, 255, 0.28)';
  ctx.font = '700 15px "Lucida Grande", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(RANKS[s.rank].toUpperCase(), 190, 540);
  if (s.multiplier > 1) ctx.fillText(`${s.multiplier}×`, 190, 560);

  // Walls, in neon.
  ctx.lineCap = 'round';
  ctx.shadowColor = '#45d4ff';
  ctx.shadowBlur = 8;
  for (const seg of SEGMENTS) {
    ctx.strokeStyle = seg.kind === 'sling' ? '#ff8a3d' : '#55ccff';
    ctx.lineWidth = seg.kind === 'sling' ? 5 : 4;
    ctx.beginPath();
    ctx.moveTo(seg.a.x, seg.a.y);
    ctx.lineTo(seg.b.x, seg.b.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Slingshot bodies.
  ctx.fillStyle = 'rgba(255, 120, 60, 0.25)';
  for (const tri of [
    [92, 520, 92, 572, 134, 590],
    [286, 520, 286, 572, 244, 590]
  ]) {
    ctx.beginPath();
    ctx.moveTo(tri[0], tri[1]);
    ctx.lineTo(tri[2], tri[3]);
    ctx.lineTo(tri[4], tri[5]);
    ctx.closePath();
    ctx.fill();
  }

  // Top lanes.
  for (const lane of s.lanes) {
    ctx.fillStyle = lane.lit ? '#ffe066' : 'rgba(255, 224, 102, 0.18)';
    ctx.shadowColor = '#ffe066';
    ctx.shadowBlur = lane.lit ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(lane.c.x, lane.c.y + 10);
    ctx.lineTo(lane.c.x - 7, lane.c.y - 2);
    ctx.lineTo(lane.c.x + 7, lane.c.y - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Drop targets: standing, or a faint slot where one fell.
  TARGETS.forEach((seg, i) => {
    ctx.fillStyle = s.targets[i] ? '#ff5d8f' : 'rgba(255, 93, 143, 0.15)';
    ctx.fillRect(seg.a.x - 4, seg.a.y, 8, seg.b.y - seg.a.y);
  });

  // The wormhole, swirling.
  const hole = ctx.createRadialGradient(s.hole.c.x, s.hole.c.y, 2, s.hole.c.x, s.hole.c.y, s.hole.r + 6);
  hole.addColorStop(0, '#000');
  hole.addColorStop(0.6, '#2a0a55');
  hole.addColorStop(1, 'rgba(140, 80, 255, 0)');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(s.hole.c.x, s.hole.c.y, s.hole.r + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b48cff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.hole.c.x, s.hole.c.y, s.hole.r, t * 4, t * 4 + Math.PI * 1.3);
  ctx.stroke();

  // Pop bumpers, flashing when hit.
  for (const b of s.bumpers) {
    const flash = t - b.lit < 0.12;
    const g = ctx.createRadialGradient(b.c.x - 6, b.c.y - 6, 3, b.c.x, b.c.y, b.r);
    g.addColorStop(0, flash ? '#fff' : '#ffe27a');
    g.addColorStop(1, flash ? '#ffb13b' : '#e5484d');
    ctx.fillStyle = g;
    ctx.shadowColor = '#ff6a3d';
    ctx.shadowBlur = flash ? 24 : 10;
    ctx.beginPath();
    ctx.arc(b.c.x, b.c.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The plunger, pulled back as it's held.
  const py = 652 + s.plunger * 18;
  ctx.fillStyle = '#9aa3b5';
  ctx.fillRect(360, py, 16, 700 - py);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(357, py - 3, 22, 6);

  // Flippers.
  for (const f of s.flippers) {
    const tip = tipOf(f);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(f.pivot.x, f.pivot.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.strokeStyle = '#e5484d';
    ctx.lineWidth = 12;
    ctx.stroke();
  }

  // The ball.
  if (!s.hole.until) {
    const { x, y } = s.ball;
    const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, BALL);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.45, '#c3c9d4');
    g.addColorStop(1, '#4a5160');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, BALL, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function Pinball({ win }: AppProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<State>(newGame());
  const front = useFocusedId() === win.id;
  const frontRef = useRef(front);
  frontRef.current = front;
  const [hud, setHud] = useState({ score: 0, balls: 3, rank: 0, multiplier: 1, message: '' as string, over: false, inLane: true });
  const [best, setBest] = useState(() => loadJSON<number>(BEST_KEY, 0));

  const restart = () => {
    game.current = newGame();
  };

  // The loop: step the table, draw it, and update the score beside it now and then.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let shown = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = game.current;
      const running = frontRef.current && !document.hidden;
      if (running) {
        pull(s, dt);
        step(s, dt, sound);
      }
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (el && ctx) {
        const scale = el.width / W;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        draw(ctx, s);
      }
      const message = !running && !s.over ? 'Paused' : s.message && s.time < s.message.until ? s.message.text : '';
      const key = `${s.score}|${s.balls}|${s.rank}|${s.multiplier}|${message}|${s.over}|${s.inLane}`;
      if (key !== shown) {
        shown = key;
        setHud({ score: s.score, balls: s.balls, rank: s.rank, multiplier: s.multiplier, message, over: s.over, inLane: s.inLane });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // A new best score is kept when the game ends.
  useEffect(() => {
    if (hud.over && hud.score > best) {
      setBest(hud.score);
      saveJSON(BEST_KEY, hud.score);
    }
  }, [hud.over]);

  // The table is as big as fits the space, at the screen's resolution.
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const box = stage.current;
    if (!el || !box) return;
    const fit = () => {
      const { width, height } = box.getBoundingClientRect();
      const h = Math.max(100, Math.min(height - 16, ((width - 16) * H) / W));
      const w = (h * W) / H;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.width = Math.round(w * devicePixelRatio);
      el.height = Math.round(h * devicePixelRatio);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // The keyboard, while the table is in front.
  useEffect(() => {
    if (!front) return;
    const LEFT = new Set(['KeyZ', 'ArrowLeft', 'ShiftLeft']);
    const RIGHT = new Set(['Slash', 'ArrowRight', 'ShiftRight']);
    const PLUNGE = new Set(['Space', 'ArrowDown', 'Enter']);
    const handle = (down: boolean) => (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = game.current;
      if (LEFT.has(e.code)) flip(s, 0, down, sound);
      else if (RIGHT.has(e.code)) flip(s, 1, down, sound);
      else if (PLUNGE.has(e.code)) {
        if (!e.repeat) plunge(s, down, sound);
      } else if (down && e.code === 'F2') restart();
      else return;
      e.preventDefault();
    };
    const down = handle(true);
    const up = handle(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      flip(game.current, 0, false, sound);
      flip(game.current, 1, false, sound);
    };
  }, [front]);

  // Touch and mouse: a press on either half of the table works that
  // flipper until that finger lifts, wherever it has moved to.
  const pressing = useRef(new Map<number, 0 | 1>());
  const pointer = (down: boolean) => (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = game.current;
    if (down) {
      if (s.over) return;
      const r = e.currentTarget.getBoundingClientRect();
      const side = e.clientX - r.left < r.width / 2 ? 0 : 1;
      e.currentTarget.setPointerCapture(e.pointerId);
      pressing.current.set(e.pointerId, side);
      flip(s, side, true, sound);
      return;
    }
    const side = pressing.current.get(e.pointerId);
    if (side === undefined) return;
    pressing.current.delete(e.pointerId);
    // The other finger may still be holding the same flipper.
    if (![...pressing.current.values()].includes(side)) flip(s, side, false, sound);
  };

  return (
    <div className="os-app os-pinball">
      <div className="os-pinball-hud">
        <div>
          <span>Score</span>
          <strong>{hud.score.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Ball</span>
          <strong>{hud.over ? '–' : Math.max(1, 4 - hud.balls)}</strong>
        </div>
        <div>
          <span>Rank</span>
          <strong>{RANKS[hud.rank]}</strong>
        </div>
        <div>
          <span>Best</span>
          <strong>{Math.max(best, hud.over ? hud.score : 0).toLocaleString('en-US')}</strong>
        </div>
      </div>
      <div ref={stage} className="os-pinball-stage">
        <canvas
          ref={canvas}
          className="os-pinball-table"
          onPointerDown={pointer(true)}
          onPointerUp={pointer(false)}
          onPointerCancel={pointer(false)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Pinball table"
        />
        {hud.message && <p className="os-pinball-message">{hud.message}</p>}
      </div>
      <div className="os-pinball-bar">
        {hud.over ? (
          <button type="button" className="os-button os-button-primary" onClick={restart}>
            New Game
          </button>
        ) : (
          <button
            type="button"
            className="os-button os-button-primary"
            disabled={!hud.inLane}
            onPointerDown={() => plunge(game.current, true, sound)}
            onPointerUp={() => plunge(game.current, false, sound)}
            onPointerLeave={() => plunge(game.current, false, sound)}
          >
            Hold to Launch
          </button>
        )}
        <span>Z and / flip · Space launches · F2 new game</span>
      </div>
    </div>
  );
}
