// The pinball table: its shape, its parts, the physics that moves the ball
// through them and the rules that score it. Everything is in table units
// (400 × 700, y down); Pinball.tsx draws it and feeds it input.
//
// An original table in the spirit of 3D Pinball's Space Cadet: a launch
// lane on the right, three pop bumpers, two slingshots, a bank of drop
// targets, three top lanes, and a wormhole. Completing things raises your
// rank, from Cadet to Fleet Admiral.

export const W = 400;
export const H = 700;
export const BALL = 9;

const GRAVITY = 1150;
const MAX_SPEED = 2600;
const STEPS = 10;

export interface Vec {
  x: number;
  y: number;
}

interface Segment {
  a: Vec;
  b: Vec;
  /** How much of the speed into it comes back. */
  bounce: number;
  /** Speed added straight out of it when hit hard enough (slingshots). */
  kick?: number;
  /** Only stops a ball coming down (the launch lane's gate). */
  oneWay?: boolean;
  kind?: 'wall' | 'sling' | 'target';
  /** For drop targets: which one. */
  target?: number;
}

export interface Bumper {
  c: Vec;
  r: number;
  /** When it last fired, for the flash. */
  lit: number;
}

export interface Flipper {
  pivot: Vec;
  length: number;
  /** Radians: resting and raised. The angle is measured from +x, y down. */
  rest: number;
  up: number;
  angle: number;
  /** Radians a second, this step. */
  omega: number;
  pressed: boolean;
}

export interface Lane {
  c: Vec;
  lit: boolean;
  /** The ball was inside it last step (a lane lights once per pass). */
  inside: boolean;
}

export const RANKS = ['Cadet', 'Ensign', 'Lieutenant', 'Captain', 'Lt. Commander', 'Commander', 'Commodore', 'Admiral', 'Fleet Admiral'];

export type Sound = 'bumper' | 'sling' | 'flipper' | 'lane' | 'target' | 'drain' | 'launch' | 'rank' | 'hole';

export interface State {
  ball: Vec & { vx: number; vy: number };
  /** Resting in the launch lane, waiting for the plunger. */
  inLane: boolean;
  /** 0 to 1 while the plunger is held. */
  plunger: number;
  plunging: boolean;
  flippers: [Flipper, Flipper];
  bumpers: Bumper[];
  lanes: Lane[];
  /** Drop targets still standing. */
  targets: boolean[];
  /** The wormhole: where it is, and when the ball in it comes out (0 when empty). */
  hole: { c: Vec; r: number; until: number };
  score: number;
  balls: number;
  multiplier: number;
  rank: number;
  /** Missions done towards the next rank (two per rank). */
  progress: number;
  /** A drain before this time gives the ball back, once per ball. */
  saveUntil: number;
  saveUsed: boolean;
  /** A line of text to show, and until when. */
  message: { text: string; until: number } | null;
  over: boolean;
  time: number;
}

const v = (x: number, y: number): Vec => ({ x, y });
const wall = (a: Vec, b: Vec, bounce = 0.35): Segment => ({ a, b, bounce, kind: 'wall' });

/** An arc of wall, as short segments. */
function arc(c: Vec, r: number, from: number, to: number, steps = 14, bounce = 0.4): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < steps; i++) {
    const t0 = from + ((to - from) * i) / steps;
    const t1 = from + ((to - from) * (i + 1)) / steps;
    out.push(wall(v(c.x + r * Math.cos(t0), c.y + r * Math.sin(t0)), v(c.x + r * Math.cos(t1), c.y + r * Math.sin(t1)), bounce));
  }
  return out;
}

const LANE_X = 352;
const LANE_START = v(368, 640);

/** The fixed walls, slingshots and gate. */
export const SEGMENTS: Segment[] = [
  // Outer walls and the dome.
  wall(v(22, 700), v(22, 190)),
  ...arc(v(201, 190), 179, Math.PI, 2 * Math.PI, 24),
  wall(v(380, 190), v(380, 700)),
  // The launch lane's inner wall, and the gate at its top that lets the ball out but not back.
  wall(v(LANE_X, 700), v(LANE_X, 215)),
  { a: v(LANE_X, 215), b: v(380, 180), bounce: 0.3, oneWay: true, kind: 'wall' },
  // The plunger's floor.
  wall(v(LANE_X, 652), v(380, 652), 0.1),
  // Outlane guides, and the inlanes that feed the flippers.
  wall(v(22, 520), v(66, 560)),
  wall(v(66, 560), v(66, 600)),
  wall(v(66, 600), v(106, 632)),
  wall(v(LANE_X, 520), v(310, 560)),
  wall(v(310, 560), v(310, 600)),
  wall(v(310, 600), v(272, 632)),
  // Slingshots: their long faces kick.
  wall(v(92, 520), v(92, 572)),
  { a: v(92, 520), b: v(134, 590), bounce: 0.6, kick: 520, kind: 'sling' },
  wall(v(92, 572), v(134, 590)),
  wall(v(286, 520), v(286, 572)),
  { a: v(286, 520), b: v(244, 590), bounce: 0.6, kick: 520, kind: 'sling' },
  wall(v(286, 572), v(244, 590)),
  // Posts between the top lanes.
  wall(v(128, 78), v(128, 104)),
  wall(v(178, 66), v(178, 96)),
  wall(v(228, 66), v(228, 96)),
  wall(v(278, 78), v(278, 104))
];

/** The drop targets, down the left wall. */
export const TARGETS: Segment[] = [0, 1, 2].map((i) => ({
  a: v(30, 282 + i * 36),
  b: v(30, 306 + i * 36),
  bounce: 0.5,
  kind: 'target' as const,
  target: i
}));

const FLIPPER_LENGTH = 58;

export function newGame(): State {
  const flipper = (pivot: Vec, rest: number, up: number): Flipper => ({ pivot, length: FLIPPER_LENGTH, rest, up, angle: rest, omega: 0, pressed: false });
  return {
    ball: { ...LANE_START, vx: 0, vy: 0 },
    inLane: true,
    plunger: 0,
    plunging: false,
    // Left pivots at the left and points right; right mirrors it.
    flippers: [flipper(v(112, 640), 0.5, -0.45), flipper(v(266, 640), Math.PI - 0.5, Math.PI + 0.45)],
    bumpers: [
      { c: v(150, 190), r: 22, lit: 0 },
      { c: v(250, 180), r: 22, lit: 0 },
      { c: v(200, 262), r: 22, lit: 0 }
    ],
    lanes: [153, 203, 253].map((x) => ({ c: v(x, 86), lit: false, inside: false })),
    targets: [true, true, true],
    hole: { c: v(312, 330), r: 13, until: 0 },
    score: 0,
    balls: 3,
    multiplier: 1,
    rank: 0,
    progress: 0,
    saveUntil: 0,
    saveUsed: false,
    message: { text: 'Launch with Space', until: 4 },
    over: false,
    time: 0
  };
}

const tipOf = (f: Flipper): Vec => ({ x: f.pivot.x + f.length * Math.cos(f.angle), y: f.pivot.y + f.length * Math.sin(f.angle) });

/** The point on segment a–b closest to p. */
function closest(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/**
 * Pushes the ball out of a contact at `q` (within `radius` of its centre)
 * and reflects its speed against the surface, which may be moving.
 * Returns how hard it hit, or 0 if it didn't.
 */
function collide(s: State, q: Vec, radius: number, bounce: number, surface: Vec = { x: 0, y: 0 }) {
  const b = s.ball;
  const dx = b.x - q.x;
  const dy = b.y - q.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= radius || dist === 0) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  b.x = q.x + nx * radius;
  b.y = q.y + ny * radius;
  const rvx = b.vx - surface.x;
  const rvy = b.vy - surface.y;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  b.vx = rvx - (1 + bounce) * vn * nx + surface.x;
  b.vy = rvy - (1 + bounce) * vn * ny + surface.y;
  // A little rolling friction along the surface.
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  b.vx -= vt * 0.01 * tx;
  b.vy -= vt * 0.01 * ty;
  return -vn;
}

function say(s: State, text: string, seconds = 2.5) {
  s.message = { text, until: s.time + seconds };
}

function award(s: State, points: number) {
  s.score += points * s.multiplier;
}

/** A mission done: two raise the rank. */
function mission(s: State, name: string, sound: (x: Sound) => void) {
  s.progress++;
  if (s.progress >= 2 && s.rank < RANKS.length - 1) {
    s.progress = 0;
    s.rank++;
    award(s, 5000 * s.rank);
    say(s, `Promoted to ${RANKS[s.rank]}!`, 3);
    sound('rank');
  } else {
    say(s, name);
  }
}

/** Moves the game on by `dt` seconds. `sound` is told about things worth hearing. */
export function step(s: State, dt: number, sound: (x: Sound) => void) {
  if (s.over) return;
  s.time += dt;
  const h = Math.min(dt, 1 / 30) / STEPS;

  for (let i = 0; i < STEPS; i++) {
    // Flippers swing towards where they're held.
    for (const f of s.flippers) {
      const target = f.pressed ? f.up : f.rest;
      const speed = f.pressed ? 26 : 16;
      const diff = target - f.angle;
      const move = Math.sign(diff) * Math.min(Math.abs(diff), speed * h);
      f.omega = move / h;
      f.angle += move;
    }

    const b = s.ball;
    if (s.inLane) {
      // Resting on the plunger until it's let go.
      b.x = LANE_START.x;
      b.y = LANE_START.y - s.plunger * 18;
      b.vx = b.vy = 0;
      continue;
    }
    if (s.hole.until) {
      if (s.time < s.hole.until) continue;
      // Out of the wormhole, down towards the flippers.
      s.hole.until = 0;
      b.x = s.hole.c.x - 18;
      b.y = s.hole.c.y + 10;
      b.vx = -260;
      b.vy = 120;
    }

    b.vy += GRAVITY * h;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx *= MAX_SPEED / speed;
      b.vy *= MAX_SPEED / speed;
    }
    b.x += b.vx * h;
    b.y += b.vy * h;

    for (const seg of SEGMENTS) {
      if (seg.oneWay && b.vy < 0) continue;
      const hit = collide(s, closest(b, seg.a, seg.b), BALL + 2, seg.bounce);
      if (hit && seg.kick && hit > 120) {
        // Slingshot: kick straight out of the face.
        const q = closest(b, seg.a, seg.b);
        const d = Math.hypot(b.x - q.x, b.y - q.y) || 1;
        b.vx += ((b.x - q.x) / d) * seg.kick;
        b.vy += ((b.y - q.y) / d) * seg.kick;
        award(s, 50);
        sound('sling');
      }
    }

    TARGETS.forEach((seg, t) => {
      if (!s.targets[t]) return;
      if (collide(s, closest(b, seg.a, seg.b), BALL + 3, seg.bounce) > 60) {
        s.targets[t] = false;
        award(s, 500);
        sound('target');
        if (s.targets.every((up) => !up)) {
          award(s, 5000);
          s.targets = [true, true, true];
          mission(s, 'Targets cleared: 5,000', sound);
        }
      }
    });

    for (const bumper of s.bumpers) {
      const d = Math.hypot(b.x - bumper.c.x, b.y - bumper.c.y) || 1;
      const hit = collide(s, { x: bumper.c.x + ((b.x - bumper.c.x) / d) * bumper.r, y: bumper.c.y + ((b.y - bumper.c.y) / d) * bumper.r }, BALL + 1, 0.5);
      if (hit) {
        const nx = (b.x - bumper.c.x) / d;
        const ny = (b.y - bumper.c.y) / d;
        b.vx += nx * 480;
        b.vy += ny * 480;
        if (s.time - bumper.lit > 0.08) {
          award(s, 100);
          sound('bumper');
        }
        bumper.lit = s.time;
      }
    }

    for (const f of s.flippers) {
      const q = closest(b, f.pivot, tipOf(f));
      // The flipper's own speed where the ball touches it.
      const surface = { x: -f.omega * (q.y - f.pivot.y), y: f.omega * (q.x - f.pivot.x) };
      collide(s, q, BALL + 7, 0.25, surface);
    }

    // Top lanes light as the ball rolls through them.
    for (const lane of s.lanes) {
      const inside = Math.hypot(b.x - lane.c.x, b.y - lane.c.y) < 14;
      if (inside && !lane.inside) {
        lane.lit = true;
        award(s, 250);
        sound('lane');
        if (s.lanes.every((l) => l.lit)) {
          s.lanes.forEach((l) => (l.lit = false));
          s.multiplier = Math.min(5, s.multiplier + 1);
          mission(s, `Lanes lit: ${s.multiplier}× scoring`, sound);
        }
      }
      lane.inside = inside;
    }

    // The wormhole swallows a slow enough ball.
    if (Math.hypot(b.x - s.hole.c.x, b.y - s.hole.c.y) < s.hole.r && Math.hypot(b.vx, b.vy) < 900) {
      s.hole.until = s.time + 1.2;
      b.x = s.hole.c.x;
      b.y = s.hole.c.y;
      b.vx = b.vy = 0;
      award(s, 2500);
      sound('hole');
      say(s, 'Wormhole: 2,500');
    }

    // Back down the launch lane, resting on the plunger: ready to go again.
    if (b.x > LANE_X && b.y > 600 && Math.abs(b.vy) < 40 && Math.abs(b.vx) < 40) {
      s.inLane = true;
      s.plunger = 0;
      return;
    }

    // Drained.
    if (b.y > H + 20) {
      if (s.time < s.saveUntil && !s.saveUsed) {
        s.saveUsed = true;
        say(s, 'Ball saved');
      } else {
        s.balls--;
        s.multiplier = 1;
        s.saveUsed = false;
        sound('drain');
        if (s.balls <= 0) {
          s.over = true;
          say(s, 'Game over', 99);
          return;
        }
        say(s, `Ball ${4 - s.balls}`);
      }
      s.inLane = true;
      s.plunger = 0;
      return;
    }
  }
}

/** Holding or letting go of the plunger. Letting go launches the ball if it's in the lane. */
export function plunge(s: State, holding: boolean, sound: (x: Sound) => void) {
  if (!s.inLane || s.over) return;
  if (holding) {
    s.plunging = true;
    return;
  }
  if (!s.plunging) return;
  s.plunging = false;
  s.inLane = false;
  s.ball.vy = -(1500 + 700 * s.plunger);
  s.ball.vx = 0;
  s.plunger = 0;
  if (!s.saveUsed) s.saveUntil = s.time + 8;
  sound('launch');
}

/** Pulls the plunger back while it's held. */
export function pull(s: State, dt: number) {
  if (s.plunging) s.plunger = Math.min(1, s.plunger + dt * 1.2);
}

/** A flipper up or down; pressing also moves the lit top lanes along, as real tables do. */
export function flip(s: State, side: 0 | 1, pressed: boolean, sound: (x: Sound) => void) {
  const f = s.flippers[side];
  if (f.pressed === pressed) return;
  f.pressed = pressed;
  if (!pressed) return;
  sound('flipper');
  const lit = s.lanes.map((l) => l.lit);
  const shifted = side === 0 ? [...lit.slice(1), lit[0]] : [lit[lit.length - 1], ...lit.slice(0, -1)];
  s.lanes.forEach((l, i) => (l.lit = shifted[i]));
}

export { tipOf };
