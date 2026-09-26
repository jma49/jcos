import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { useFocusedId, useWindows } from '../core/store';
import { audio } from '../core/sound';
import { loadSettings, saveJSON } from '../core/storage';

// Synth, after ryOS's: two octaves of keys played with the mouse, a finger
// or the computer's keys, a few waveforms and presets, a filter, an echo
// and an oscilloscope. Everything is Web Audio, through the one sound
// switch and volume (turning a note on turns sound on, as Play does).

interface Patch {
  wave: OscillatorType;
  /** Seconds. */
  attack: number;
  release: number;
  /** Low-pass cutoff in Hz. */
  cutoff: number;
  /** 0 to 1: how much of the sound echoes. */
  echo: number;
  /** Cents between two oscillators; 0 for one. */
  detune: number;
}

const PRESETS: Record<string, Patch> = {
  Keys: { wave: 'triangle', attack: 0.005, release: 0.6, cutoff: 6000, echo: 0.15, detune: 0 },
  Organ: { wave: 'sine', attack: 0.02, release: 0.15, cutoff: 9000, echo: 0.1, detune: 1200 },
  Pad: { wave: 'sawtooth', attack: 0.6, release: 1.8, cutoff: 1400, echo: 0.35, detune: 12 },
  Bass: { wave: 'sawtooth', attack: 0.005, release: 0.25, cutoff: 700, echo: 0, detune: 6 },
  Chip: { wave: 'square', attack: 0.001, release: 0.08, cutoff: 12000, echo: 0.2, detune: 0 }
};
const WAVES: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];
const WAVE_LABEL: Record<string, string> = { sine: 'Sine', triangle: 'Triangle', square: 'Square', sawtooth: 'Saw' };

const KEY = 'os-synth';
const saved = () => loadSettings<Patch & { octave: number }>(KEY, { ...PRESETS.Keys, octave: 4 });

/** Computer keys to semitones above the lowest C, like GarageBand's Musical Typing. */
const KEYMAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17
};
const LETTER: Record<number, string> = Object.fromEntries(Object.entries(KEYMAP).map(([code, n]) => [n, code === 'Semicolon' ? ';' : code === 'Quote' ? '’' : code.slice(3)]));

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
/** Two octaves and a note: C to E. */
const SPAN = 29;

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Voice {
  oscs: OscillatorNode[];
  env: GainNode;
}

/** The sound engine: a voice per held note into a filter, an echo, the volume and a scope. */
class Engine {
  ctx: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  wet: GainNode;
  analyser: AnalyserNode;
  voices = new Map<number, Voice>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    this.wet = ctx.createGain();
    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    // Dry and echoed, then the volume, then out (and to the scope).
    this.filter.connect(this.master);
    this.filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.wet).connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(ctx.destination);
  }

  set(patch: Patch, level: number) {
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(patch.cutoff, t, 0.02);
    this.wet.gain.setTargetAtTime(patch.echo, t, 0.02);
    this.master.gain.setTargetAtTime(level, t, 0.02);
  }

  on(midi: number, patch: Patch) {
    if (this.voices.has(midi)) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.22, t + Math.max(0.002, patch.attack));
    env.connect(this.filter);
    const oscs = (patch.detune ? [-patch.detune / 2, patch.detune / 2] : [0]).map((cents) => {
      const osc = this.ctx.createOscillator();
      osc.type = patch.wave;
      osc.frequency.value = frequency(midi);
      osc.detune.value = cents;
      osc.connect(env);
      osc.start(t);
      return osc;
    });
    this.voices.set(midi, { oscs, env });
  }

  off(midi: number, patch: Patch) {
    const voice = this.voices.get(midi);
    if (!voice) return;
    this.voices.delete(midi);
    const t = this.ctx.currentTime;
    voice.env.gain.cancelScheduledValues(t);
    voice.env.gain.setValueAtTime(Math.max(0.0001, voice.env.gain.value), t);
    voice.env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, patch.release));
    voice.oscs.forEach((o) => o.stop(t + patch.release + 0.05));
  }

  close() {
    this.voices.forEach((v) => v.oscs.forEach((o) => o.stop()));
    this.voices.clear();
    this.master.disconnect();
  }
}

export default function Synth({ win }: AppProps) {
  const [patch, setPatch] = useState<Patch>(() => {
    const { octave: _o, ...p } = saved();
    return p;
  });
  const [octave, setOctave] = useState(() => Math.min(6, Math.max(2, saved().octave)));
  const [held, setHeld] = useState<Set<number>>(new Set());
  const engine = useRef<Engine | null>(null);
  const scope = useRef<HTMLCanvasElement>(null);
  const pointerDown = useRef(false);
  const soundOn = useWindows((s) => s.soundOn);
  const volume = useWindows((s) => s.volume);
  const front = useFocusedId() === win.id;
  const patchRef = useRef(patch);
  patchRef.current = patch;
  const base = octave * 12 + 12;

  const update = (next: Partial<Patch>, nextOctave = octave) => {
    const merged = { ...patch, ...next };
    setPatch(merged);
    saveJSON(KEY, { ...merged, octave: nextOctave });
  };

  const ensure = () => {
    if (!engine.current) {
      const ctx = audio();
      if (!ctx) return null;
      engine.current = new Engine(ctx);
    }
    return engine.current;
  };

  // The volume and sound switch, and the patch, applied as they change.
  useEffect(() => {
    engine.current?.set(patch, soundOn ? volume * 0.8 : 0);
  }, [patch, soundOn, volume]);

  useEffect(() => () => engine.current?.close(), []);

  const noteOn = (midi: number) => {
    const { soundOn: on, setSound } = useWindows.getState();
    // Playing a note is asking for sound, as pressing Play is.
    if (!on) setSound(true);
    const e = ensure();
    if (!e) return;
    const { volume: v } = useWindows.getState();
    e.set(patchRef.current, v * 0.8);
    e.on(midi, patchRef.current);
    setHeld((h) => new Set(h).add(midi));
  };
  const noteOff = (midi: number) => {
    engine.current?.off(midi, patchRef.current);
    setHeld((h) => {
      const next = new Set(h);
      next.delete(midi);
      return next;
    });
  };

  // Musical Typing while the Synth is in front; Z and X change octave.
  useEffect(() => {
    if (!front) return;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.matches('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (e.code === 'KeyZ' || e.code === 'KeyX') {
        e.preventDefault();
        const next = Math.min(6, Math.max(2, octave + (e.code === 'KeyX' ? 1 : -1)));
        setOctave(next);
        update({}, next);
        return;
      }
      const n = KEYMAP[e.code];
      if (n === undefined) return;
      e.preventDefault();
      if (!e.repeat) noteOn(base + n);
    };
    const up = (e: KeyboardEvent) => {
      const n = KEYMAP[e.code];
      if (n !== undefined) noteOff(base + n);
    };
    // Leaving the window lets go of everything.
    const blur = () => engine.current?.voices.forEach((_, m) => noteOff(m));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [front, octave, base]);

  // The oscilloscope: the wave as it leaves, drawn every frame.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = scope.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(120, 255, 170, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += width / 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      const analyser = engine.current?.analyser;
      const data = new Uint8Array(analyser?.fftSize ?? 1024).fill(128);
      analyser?.getByteTimeDomainData(data);
      ctx.strokeStyle = '#7dffae';
      ctx.shadowColor = '#3dff8a';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = (v / 255) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const up = () => (pointerDown.current = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const preset = Object.entries(PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify(patch))?.[0] ?? '';
  const whites = Array.from({ length: SPAN }, (_, i) => i).filter((i) => !BLACK.has(i % 12));

  const keyProps = (n: number) => ({
    'data-held': held.has(base + n) || undefined,
    'aria-label': `${NAMES[n % 12]}${octave + Math.floor(n / 12)}`,
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      pointerDown.current = true;
      noteOn(base + n);
    },
    onPointerUp: () => noteOff(base + n),
    onPointerLeave: () => noteOff(base + n),
    onPointerEnter: () => pointerDown.current && noteOn(base + n)
  });

  return (
    <div className="os-app os-synth">
      <div className="os-synth-panel">
        <canvas ref={scope} className="os-synth-scope" width={320} height={90} aria-hidden="true" />
        <div className="os-synth-controls">
          <label>
            Preset
            <select value={preset} onChange={(e) => e.target.value && update(PRESETS[e.target.value])}>
              {!preset && <option value="">Custom</option>}
              {Object.keys(PRESETS).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <div className="os-segmented" role="group" aria-label="Waveform">
            {WAVES.map((w) => (
              <button key={w} type="button" aria-pressed={patch.wave === w} onClick={() => update({ wave: w })}>
                {WAVE_LABEL[w]}
              </button>
            ))}
          </div>
          <div className="os-synth-knobs">
            <label>
              Attack
              <input type="range" min={0.001} max={1.5} step={0.001} value={patch.attack} onChange={(e) => update({ attack: Number(e.target.value) })} />
            </label>
            <label>
              Release
              <input type="range" min={0.02} max={3} step={0.01} value={patch.release} onChange={(e) => update({ release: Number(e.target.value) })} />
            </label>
            <label>
              Tone
              <input
                type="range"
                min={Math.log(200)}
                max={Math.log(14000)}
                step={0.01}
                value={Math.log(patch.cutoff)}
                onChange={(e) => update({ cutoff: Math.round(Math.exp(Number(e.target.value))) })}
              />
            </label>
            <label>
              Echo
              <input type="range" min={0} max={0.7} step={0.01} value={patch.echo} onChange={(e) => update({ echo: Number(e.target.value) })} />
            </label>
          </div>
        </div>
      </div>

      <div className="os-synth-status">
        <span>
          Octave {octave} <kbd>Z</kbd> <kbd>X</kbd>
        </span>
        <span>{soundOn ? 'Play with the mouse, or with A–K on your keyboard' : 'Sound is off. Playing a note turns it on.'}</span>
      </div>

      <div className="os-synth-keys" role="group" aria-label="Keyboard" onContextMenu={(e) => e.preventDefault()}>
        {whites.map((n) => (
          <button key={n} type="button" className="os-synth-white" {...keyProps(n)}>
            {LETTER[n] && <span>{LETTER[n]}</span>}
          </button>
        ))}
        {Array.from({ length: SPAN }, (_, n) => n)
          .filter((n) => BLACK.has(n % 12))
          .map((n) => {
            // A black key sits over the line between the white keys either side of it.
            const left = whites.filter((w) => w < n).length;
            return (
              <button
                key={n}
                type="button"
                className="os-synth-black"
                style={{ left: `calc(${(left / whites.length) * 100}% - var(--black) / 2)` }}
                {...keyProps(n)}
              >
                {LETTER[n] && <span>{LETTER[n]}</span>}
              </button>
            );
          })}
      </div>
    </div>
  );
}
