// Interface sounds, synthesized with Web Audio (no recordings, so nothing
// of Apple's is copied). Off until the visitor turns them on in the menu
// bar or System Preferences; browsers only allow audio after a click or
// key press anyway.

import { useWindows } from './store';

export type Sound = 'open' | 'close' | 'minimize' | 'restore' | 'click' | 'pop' | 'error' | 'chime' | 'trash';

let context: AudioContext | null = null;

function audio() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

/** A tone that glides from `from` to `to` Hz with a quick attack and an exponential fade. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  { from, to = from, at = 0, length, type = 'sine', gain = 0.3 }: { from: number; to?: number; at?: number; length: number; type?: OscillatorType; gain?: number }
) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + length);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** A burst of filtered noise, swept from one band to another: a whoosh. */
function whoosh(ctx: AudioContext, out: AudioNode, { from, to, length, gain = 0.25 }: { from: number; to: number; length: number; gain?: number }) {
  const start = ctx.currentTime;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(from, start);
  band.frequency.exponentialRampToValueAtTime(to, start + length);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + length * 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);
  noise.connect(band).connect(env).connect(out);
  noise.start(start);
}

const RECIPES: Record<Sound, (ctx: AudioContext, out: AudioNode) => void> = {
  open: (ctx, out) => {
    whoosh(ctx, out, { from: 500, to: 2600, length: 0.22, gain: 0.18 });
    tone(ctx, out, { from: 660, to: 990, length: 0.14, gain: 0.06 });
  },
  close: (ctx, out) => {
    whoosh(ctx, out, { from: 2200, to: 500, length: 0.18, gain: 0.14 });
  },
  minimize: (ctx, out) => {
    whoosh(ctx, out, { from: 2600, to: 300, length: 0.38, gain: 0.2 });
  },
  restore: (ctx, out) => {
    whoosh(ctx, out, { from: 300, to: 2600, length: 0.32, gain: 0.18 });
  },
  click: (ctx, out) => {
    tone(ctx, out, { from: 1800, to: 1200, length: 0.03, type: 'triangle', gain: 0.12 });
  },
  pop: (ctx, out) => {
    tone(ctx, out, { from: 420, to: 880, length: 0.09, gain: 0.25 });
  },
  error: (ctx, out) => {
    // A low, hollow thud, in the spirit of "Basso".
    tone(ctx, out, { from: 150, to: 110, length: 0.32, type: 'triangle', gain: 0.4 });
    tone(ctx, out, { from: 300, to: 220, length: 0.18, gain: 0.08 });
  },
  chime: (ctx, out) => {
    // A soft major chord, rolled: the "sounds are on" hello.
    [349.23, 440, 523.25, 698.46].forEach((f, i) => tone(ctx, out, { from: f, at: i * 0.05, length: 1.4, gain: 0.12 }));
  },
  trash: (ctx, out) => {
    whoosh(ctx, out, { from: 900, to: 400, length: 0.25, gain: 0.25 });
    tone(ctx, out, { from: 110, to: 70, length: 0.2, type: 'triangle', gain: 0.3 });
  }
};

/** Plays a sound if the visitor has sounds on. */
export function play(sound: Sound, { force = false } = {}) {
  const { soundOn, volume } = useWindows.getState();
  if (!soundOn && !force) return;
  const ctx = audio();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  RECIPES[sound](ctx, out);
}

let watching = false;

/** Plays window sounds as windows open, close, minimize and come back. Call once. */
export function watchWindows() {
  if (watching) return;
  watching = true;
  useWindows.subscribe((state, prev) => {
    if (state.windows === prev.windows) return;
    for (const id of Object.keys(state.windows)) {
      const before = prev.windows[id];
      const now = state.windows[id];
      if (!before) return play('open');
      if (!before.minimized && now.minimized) return play('minimize');
      if (before.minimized && !now.minimized) return play('restore');
    }
    if (Object.keys(prev.windows).some((id) => !state.windows[id])) play('close');
  });
}
