import { useEffect, useRef, useState } from 'react';
import { play } from '../../core/sound';
import type { ScreenInput } from './input';

// Brick, the iPod's own Breakout: turn the wheel to move the paddle, press
// the centre to serve (and to pause). The music keeps playing.

const W = 236;
const H = 183;
const COLS = 8;
const ROWS = 5;
const BRICK_H = 8;
const TOP = 22;
const PADDLE_W = 40;
const PADDLE_Y = H - 12;
const COLORS = ['#e8453c', '#f29b30', '#f5d33b', '#5cc25a', '#3d8fe0'];

interface Game {
  paddle: number;
  ball: { x: number; y: number; dx: number; dy: number };
  bricks: boolean[];
  served: boolean;
  paused: boolean;
  lives: number;
  score: number;
  over: 'won' | 'lost' | null;
}

const fresh = (): Game => ({
  paddle: W / 2,
  ball: { x: W / 2, y: PADDLE_Y - 4, dx: 1.6, dy: -2.1 },
  bricks: new Array(COLS * ROWS).fill(true),
  served: false,
  paused: false,
  lives: 3,
  score: 0,
  over: null
});

export function Brick({ input }: { input: (handle: ScreenInput | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(fresh());
  // Only the words under the board need React; the board draws itself.
  const [status, setStatus] = useState('Press the centre button to serve');

  useEffect(() => {
    input({
      step: (delta) => {
        const g = game.current;
        g.paddle = Math.min(W - PADDLE_W / 2, Math.max(PADDLE_W / 2, g.paddle + delta * 12));
        if (!g.served) g.ball.x = g.paddle;
      },
      choose: () => {
        const g = game.current;
        if (g.over) {
          game.current = fresh();
          setStatus('Press the centre button to serve');
        } else if (!g.served) {
          g.served = true;
          setStatus('');
        } else {
          g.paused = !g.paused;
          setStatus(g.paused ? 'Paused' : '');
        }
      },
      // The wheel's edges keep controlling the music.
      press: () => false
    });
    return () => input(null);
  }, [input]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = W * dpr;
    el.height = H * dpr;
    ctx.scale(dpr, dpr);
    const brickW = W / COLS;
    let frame = 0;

    const tick = () => {
      const g = game.current;
      if (g.served && !g.paused && !g.over) {
        const b = g.ball;
        b.x += b.dx;
        b.y += b.dy;
        if (b.x < 3 || b.x > W - 3) b.dx = -b.dx;
        if (b.y < 3) b.dy = Math.abs(b.dy);
        // The paddle: where it's hit sets the angle.
        if (b.dy > 0 && b.y >= PADDLE_Y - 3 && b.y <= PADDLE_Y + 2 && Math.abs(b.x - g.paddle) <= PADDLE_W / 2 + 2) {
          const off = (b.x - g.paddle) / (PADDLE_W / 2);
          const speed = Math.hypot(b.dx, b.dy);
          b.dx = speed * off * 0.85;
          b.dy = -Math.sqrt(Math.max(0.5, speed * speed - b.dx * b.dx));
          play('tick');
        }
        const col = Math.floor(b.x / brickW);
        const row = Math.floor((b.y - TOP) / BRICK_H);
        if (row >= 0 && row < ROWS && col >= 0 && col < COLS && g.bricks[row * COLS + col]) {
          g.bricks[row * COLS + col] = false;
          b.dy = -b.dy;
          g.score += (ROWS - row) * 10;
          play('pop');
          if (g.bricks.every((x) => !x)) {
            g.over = 'won';
            setStatus('You cleared it! Centre to play again');
          }
        }
        if (b.y > H + 4) {
          g.lives -= 1;
          play('error');
          if (g.lives <= 0) {
            g.over = 'lost';
            setStatus(`Game over · ${g.score} · Centre to play again`);
          } else {
            g.served = false;
            g.ball = { x: g.paddle, y: PADDLE_Y - 4, dx: 1.6, dy: -2.1 };
            setStatus('Centre to serve');
          }
        }
      }

      ctx.clearRect(0, 0, W, H);
      g.bricks.forEach((alive, i) => {
        if (!alive) return;
        const r = Math.floor(i / COLS);
        ctx.fillStyle = COLORS[r];
        ctx.fillRect((i % COLS) * brickW + 1, TOP + r * BRICK_H + 1, brickW - 2, BRICK_H - 2);
      });
      ctx.fillStyle = '#2b3440';
      ctx.fillRect(g.paddle - PADDLE_W / 2, PADDLE_Y, PADDLE_W, 4);
      ctx.beginPath();
      ctx.arc(g.ball.x, g.ball.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 10px LucidaGrande, sans-serif';
      ctx.fillText(`${g.score}`, 5, 13);
      ctx.textAlign = 'right';
      ctx.fillText('●'.repeat(Math.max(0, g.lives)), W - 5, 13);
      ctx.textAlign = 'left';
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="os-brick">
      <canvas ref={canvas} style={{ width: W, height: H }} />
      {status && <p>{status}</p>}
    </div>
  );
}
