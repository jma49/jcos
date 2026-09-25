import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { describe, getWeather, localMinutes, type Condition, type Weather } from './weather';

// The desktop follows the sky over San Jose: the wallpaper takes on the
// light of the hour there (dawn, golden hour, dusk, night) and shows the
// weather (rain, drizzle, storms, snow, fog) behind the windows.

type RGBA = [number, number, number, number];

/** Used until the forecast arrives, or if it never does. */
const DEFAULT_SUNRISE = 7 * 60;
const DEFAULT_SUNSET = 19 * 60;

const NIGHT: RGBA = [10, 20, 62, 0.66];
const DAWN: RGBA = [255, 150, 130, 0.24];
const DAY: RGBA = [255, 190, 140, 0];
const GOLDEN: RGBA = [255, 160, 55, 0.26];
const DUSK: RGBA = [110, 60, 145, 0.36];

/** The wallpaper tint at a time of day, eased between the light of sunrise and sunset. */
export function tintAt(minutes: number, sunrise: number, sunset: number): RGBA {
  const stops: [number, RGBA][] = [
    [sunrise - 60, NIGHT],
    [sunrise, DAWN],
    [sunrise + 75, DAY],
    [sunset - 100, DAY],
    [sunset - 15, GOLDEN],
    [sunset + 25, DUSK],
    [sunset + 80, NIGHT]
  ];
  if (minutes <= stops[0][0] || minutes >= stops[stops.length - 1][0]) return NIGHT;
  const i = stops.findIndex(([at]) => at > minutes);
  const [a, from] = stops[i - 1];
  const [b, to] = stops[i];
  const t = (minutes - a) / (b - a);
  return from.map((v, k) => v + (to[k] - v) * t) as RGBA;
}

/** How much a condition greys the scene, and how many particles it draws per megapixel. */
const MOOD: Record<Condition, { gloom: number; drops: number; flakes: number; fog: boolean }> = {
  clear: { gloom: 0, drops: 0, flakes: 0, fog: false },
  cloudy: { gloom: 0.08, drops: 0, flakes: 0, fog: false },
  overcast: { gloom: 0.18, drops: 0, flakes: 0, fog: false },
  fog: { gloom: 0.12, drops: 0, flakes: 0, fog: true },
  drizzle: { gloom: 0.2, drops: 60, flakes: 0, fog: false },
  rain: { gloom: 0.26, drops: 170, flakes: 0, fog: false },
  storm: { gloom: 0.34, drops: 240, flakes: 0, fog: false },
  snow: { gloom: 0.14, drops: 0, flakes: 110, fog: false }
};

const TIMES: Record<string, (sunrise: number, sunset: number) => number> = {
  dawn: (sunrise) => sunrise,
  day: () => 12 * 60,
  golden: (_, sunset) => sunset - 25,
  dusk: (_, sunset) => sunset + 25,
  night: () => 0
};

/** `?sky=dusk,rain` pins the time of day and the weather, for demos and testing. */
function override() {
  const words = new URLSearchParams(window.location.search).get('sky')?.toLowerCase().split(',') ?? [];
  const time = words.find((w) => w in TIMES);
  const condition = words.find((w) => w in MOOD) as Condition | undefined;
  return { time, condition };
}

export interface SkyState {
  weather: Weather | null;
  condition: Condition;
  tint: RGBA;
}

/** San Jose's light and weather, rechecked every minute. */
export function useSky(): SkyState {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [now, setNow] = useState(() => localMinutes());

  useEffect(() => {
    getWeather().then(setWeather, () => {});
    const timer = setInterval(() => setNow(localMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const pinned = override();
  const sunrise = weather?.sunrise ?? DEFAULT_SUNRISE;
  const sunset = weather?.sunset ?? DEFAULT_SUNSET;
  const minutes = pinned.time ? TIMES[pinned.time](sunrise, sunset) : now;
  return {
    weather,
    condition: pinned.condition ?? weather?.condition ?? 'clear',
    tint: tintAt(minutes, sunrise, sunset)
  };
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  phase: number;
}

/** Rain streaks or snowflakes on a canvas that fills the desktop. */
function Precipitation({ drops, flakes }: { drops: number; flakes: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let particles: Particle[] = [];
    let w = 0;
    let h = 0;

    const spawn = (anywhere: boolean): Particle => ({
      x: Math.random() * (w + 200) - 100,
      y: anywhere ? Math.random() * h : -30,
      speed: drops ? 700 + Math.random() * 450 : 25 + Math.random() * 45,
      size: drops ? 10 + Math.random() * 14 : 1 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2
    });

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(((drops || flakes) * w * h) / 1_000_000);
      particles = Array.from({ length: count }, () => spawn(true));
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    let frame = 0;
    const draw = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      if (drops) {
        ctx.strokeStyle = 'rgba(210, 225, 245, 0.4)';
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      }
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y += p.speed * dt;
        if (drops) {
          p.x -= p.speed * 0.12 * dt;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.size * 0.12, p.y - p.size);
        } else {
          p.phase += dt;
          p.x += Math.sin(p.phase) * 18 * dt;
          ctx.moveTo(p.x + p.size, p.y);
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        }
        if (p.y - p.size > h) particles[i] = spawn(false);
      }
      if (drops) ctx.stroke();
      else ctx.fill();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [drops, flakes]);

  return <canvas ref={canvas} className="os-sky-canvas" />;
}

/** Now and then, a lightning flash. */
function Lightning() {
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        setFlash((n) => n + 1);
        next();
      }, 7000 + Math.random() * 12000);
    };
    next();
    return () => clearTimeout(timer);
  }, []);
  return flash ? <div key={flash} className="os-sky-flash" /> : null;
}

/** The tint and weather layers, drawn over the wallpaper and under everything else. */
export function Sky({ sky }: { sky: SkyState }) {
  const reduced = useReducedMotion();
  const mood = MOOD[sky.condition];
  const [r, g, b, a] = sky.tint;

  return (
    <div className="os-sky" aria-hidden="true">
      <div className="os-sky-tint" style={{ backgroundColor: `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a.toFixed(3)})` }} />
      <div className="os-sky-gloom" style={{ opacity: mood.gloom }} />
      {mood.fog && <div className="os-sky-fog" />}
      {!reduced && (mood.drops > 0 || mood.flakes > 0) && <Precipitation drops={mood.drops} flakes={mood.flakes} />}
      {!reduced && sky.condition === 'storm' && <Lightning />}
    </div>
  );
}

/** Menu bar item: the San Jose weather the desktop is showing. Opens the Dashboard. */
export function SkyStatus({ sky, onOpen }: { sky: SkyState; onOpen: () => void }) {
  const { label, icon } = describe(sky.condition);
  if (!sky.weather) return null;
  return (
    <button
      type="button"
      className="os-sky-status"
      onClick={onOpen}
      title={`San Jose · ${label}. The desktop follows the sky there.`}
      aria-label={`San Jose weather: ${label}, ${sky.weather.temp} degrees`}
    >
      <span aria-hidden="true">{icon}</span>
      {sky.weather.temp}°
    </button>
  );
}
