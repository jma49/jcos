import { describe, expect, test } from 'vitest';
import { flip, H, newGame, plunge, pull, step, W, type State } from './table';

// Two players, played for real: one who never touches the flippers, and
// one who flips whenever the ball comes near them. Neither should ever see
// the ball leave the table or come to rest where it can't be played.

/** A small seeded random number generator, so a failure repeats. */
function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

interface Result {
  seconds: number;
  over: boolean;
  drains: number;
}

function play(flipper: boolean, seed: number, limit = 600): Result {
  const random = seeded(seed);
  const s: State = newGame();
  const quiet = () => {};
  let drains = 0;
  let t = 0;
  let hold = 0;
  let still = 0;
  let last = { x: s.ball.x, y: s.ball.y };
  while (!s.over && t < limit) {
    const dt = 1 / 60;
    t += dt;
    if (s.inLane) {
      if (!s.plunging) {
        plunge(s, true, quiet);
        hold = 0.3 + random() * 0.7;
      } else if ((hold -= dt) <= 0) plunge(s, false, quiet);
    }
    const b = s.ball;
    if (flipper) {
      const near = b.y > 570 && b.vy > 0;
      flip(s, 0, near && b.x < 200 && random() < 0.7, quiet);
      flip(s, 1, near && b.x >= 190 && random() < 0.7, quiet);
    }
    pull(s, dt);
    step(s, dt, (e) => e === 'drain' && drains++);
    if (!s.inLane && !s.hole.until) {
      // Plain checks: an expect() every frame would be far too slow.
      if (b.x <= 0 || b.x >= W || b.y <= 0 || b.y >= H + 40) throw new Error(`the ball left the table at ${b.x}, ${b.y}`);
      const moved = Math.hypot(b.x - last.x, b.y - last.y) > 1;
      still = moved ? 0 : still + dt;
      if (still > 10) throw new Error(`the ball came to rest at ${Math.round(b.x)}, ${Math.round(b.y)}`);
      if (moved) last = { x: b.x, y: b.y };
    }
  }
  return { seconds: t, over: s.over, drains };
}

describe('the table', () => {
  test('a player who never flips loses all three balls within two minutes', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = play(false, seed);
      expect(r.over).toBe(true);
      expect(r.seconds).toBeLessThan(120);
    }
  }, 60_000);

  test('a player who flips keeps the ball in play, and nothing escapes or sticks', () => {
    const results = Array.from({ length: 8 }, (_, i) => play(true, 100 + i, 300));
    const average = results.reduce((a, r) => a + r.seconds, 0) / results.length;
    expect(average).toBeGreaterThan(60);
  }, 60_000);

  test('the ball saver gives a ball back once', () => {
    const s = newGame();
    plunge(s, true, () => {});
    plunge(s, false, () => {});
    // Straight down the middle, right away.
    s.ball.x = 200;
    s.ball.y = H + 30;
    step(s, 1 / 60, () => {});
    expect(s.balls).toBe(3);
    expect(s.saveUsed).toBe(true);
    plunge(s, true, () => {});
    plunge(s, false, () => {});
    s.ball.x = 200;
    s.ball.y = H + 30;
    step(s, 1 / 60, () => {});
    expect(s.balls).toBe(2);
  });
});
