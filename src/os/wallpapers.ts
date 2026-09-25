// Desktop pictures beyond photos: solid colours, patterns and a dynamic sky.
// The store keeps one string: a photo's URL (as before), or `color:<id>`,
// `pattern:<id>` or `dynamic:sky`. backgroundFor() turns it into CSS.

import { accentFromPixels, brightness } from './accent';
import type { Condition } from './weather';

export interface SolidColor {
  id: string;
  name: string;
  color: string;
}

export interface Pattern {
  id: string;
  name: string;
  /** A CSS background (layers, sizes) that tiles or fills the desktop. */
  background: string;
  /** The accent this pattern gives, since it isn't sampled. */
  accent: string;
  /** How bright its top edge is, 0 to 1, for the menu bar's text. */
  top: number;
}

export const SOLID_COLORS: SolidColor[] = [
  { id: 'aqua', name: 'Aqua Blue', color: '#3f7fc9' },
  { id: 'aqua-dark', name: 'Aqua Dark Blue', color: '#1e3f73' },
  { id: 'graphite', name: 'Graphite', color: '#5d646e' },
  { id: 'silver', name: 'Silver', color: '#b3b8bf' },
  { id: 'kelp', name: 'Kelp', color: '#2f5b3c' },
  { id: 'mint', name: 'Mint', color: '#79bf9f' },
  { id: 'lavender', name: 'Lavender', color: '#8b7fbd' },
  { id: 'plum', name: 'Plum', color: '#5b2f55' },
  { id: 'clay', name: 'Clay', color: '#b0694a' }
];

const svg = (body: string, w: number, h: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

export const PATTERNS: Pattern[] = [
  {
    id: 'waves',
    name: 'Aqua Waves',
    // Soft white swells over a deep-to-light blue.
    background: [
      `${svg(
        `<g fill='none' stroke='white' stroke-linecap='round'>` +
          `<path d='M-40 260 C 200 140 420 380 700 230 S 1180 120 1480 260' stroke-width='70' stroke-opacity='0.10'/>` +
          `<path d='M-40 420 C 260 300 520 560 820 400 S 1240 300 1480 430' stroke-width='110' stroke-opacity='0.08'/>` +
          `<path d='M-40 600 C 300 500 560 720 900 590 S 1260 520 1480 620' stroke-width='60' stroke-opacity='0.12'/>` +
          `</g>`,
        1440,
        900
      )} center / cover no-repeat`,
      'radial-gradient(ellipse at 30% 20%, #8fc7f5, #3f7fc9 45%, #163a73)'
    ].join(', '),
    accent: '#3a7fd0',
    top: 0.5
  },
  {
    id: 'pinstripe',
    name: 'Blue Pinstripe',
    background: 'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.07) 0 2px, transparent 2px 4px), linear-gradient(#5b8fd0, #2c5c9d)',
    accent: '#3875d7',
    top: 0.5
  },
  {
    id: 'metal',
    name: 'Brushed Metal',
    background: `${svg(
      `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.0012 0.9' numOctaves='3' seed='7' stitchTiles='stitch'/><feColorMatrix values='0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 0 1'/></filter><rect width='100%' height='100%' filter='url(%23g)' opacity='0.45'/>`,
      1600,
      240
    )}, linear-gradient(#d9d9d9, #9d9d9d)`,
    accent: '#6b7684',
    top: 0.8
  },
  {
    id: 'graph',
    name: 'Graph Paper',
    background:
      'linear-gradient(rgba(60, 110, 170, 0.18) 1px, transparent 1px) 0 0 / 24px 24px, ' +
      'linear-gradient(90deg, rgba(60, 110, 170, 0.18) 1px, transparent 1px) 0 0 / 24px 24px, ' +
      'linear-gradient(rgba(60, 110, 170, 0.3) 1px, transparent 1px) 0 0 / 120px 120px, ' +
      'linear-gradient(90deg, rgba(60, 110, 170, 0.3) 1px, transparent 1px) 0 0 / 120px 120px, #f4f1e8',
    accent: '#3f73b3',
    top: 0.93
  }
];

export const SKY = 'dynamic:sky';

type Rgb = [number, number, number];

/** Sky colours (top, horizon) at points through the day, relative to sunrise and sunset. */
const SKY_STOPS = (sunrise: number, sunset: number): [number, Rgb, Rgb][] => [
  [sunrise - 90, [8, 12, 34], [24, 30, 70]],
  [sunrise - 20, [40, 44, 96], [214, 120, 110]],
  [sunrise + 30, [96, 140, 205], [250, 190, 150]],
  [sunrise + 120, [58, 128, 214], [168, 206, 240]],
  [sunset - 120, [58, 128, 214], [168, 206, 240]],
  [sunset - 30, [74, 104, 170], [250, 170, 90]],
  [sunset + 15, [48, 44, 104], [226, 108, 84]],
  [sunset + 70, [14, 18, 48], [52, 40, 90]],
  [sunset + 140, [8, 12, 34], [24, 30, 70]]
];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

/** Top and horizon colours of the sky at a time of day, greyed by the weather. */
export function skyColors(minutes: number, sunrise: number, sunset: number, condition: Condition): [Rgb, Rgb] {
  const stops = SKY_STOPS(sunrise, sunset);
  let top = stops[0][1];
  let bottom = stops[0][2];
  if (minutes >= stops[stops.length - 1][0] || minutes <= stops[0][0]) {
    [, top, bottom] = stops[0];
  } else {
    const i = stops.findIndex(([at]) => at > minutes);
    const [a, ta, ba] = stops[i - 1];
    const [b, tb, bb] = stops[i];
    const t = (minutes - a) / (b - a);
    top = mix(ta, tb, t);
    bottom = mix(ba, bb, t);
  }
  const grey: Record<Condition, number> = {
    clear: 0,
    cloudy: 0.2,
    overcast: 0.5,
    fog: 0.55,
    drizzle: 0.45,
    rain: 0.55,
    storm: 0.65,
    snow: 0.45
  };
  const g = grey[condition];
  const toGrey = (c: Rgb): Rgb => {
    const l = (c[0] + c[1] + c[2]) / 3;
    return mix(c, [l, l, l], g);
  };
  return [toGrey(top), toGrey(bottom)];
}

const css = ([r, g, b]: Rgb) => `rgb(${r | 0}, ${g | 0}, ${b | 0})`;

export interface SkyInput {
  minutes: number;
  sunrise: number;
  sunset: number;
  condition: Condition;
}

/** The CSS background for a stored desktop picture (null is the default picture). */
export function backgroundFor(value: string | null, defaultUrl: string, sky: SkyInput): string {
  if (!value) return `url(${defaultUrl}) center / cover no-repeat`;
  if (value.startsWith('color:')) {
    const c = SOLID_COLORS.find((s) => s.id === value.slice(6));
    // Mac solid colours were flat; a faint vignette keeps them from looking dead.
    return c ? `radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(0, 0, 0, 0.18)), ${c.color}` : '#5a5550';
  }
  if (value.startsWith('pattern:')) return PATTERNS.find((p) => p.id === value.slice(8))?.background ?? '#5a5550';
  if (value === SKY) {
    const [top, bottom] = skyColors(sky.minutes, sky.sunrise, sky.sunset, sky.condition);
    return `linear-gradient(${css(top)}, ${css(mix(top, bottom, 0.55))} 62%, ${css(bottom)})`;
  }
  return `url(${value}) center / cover no-repeat`;
}

/** Whether a stored value is a picture file (sampled for its accent) rather than generated here. */
export const isPicture = (value: string | null) => !value || !/^(color|pattern|dynamic):/.test(value);

/** The accent for a generated desktop picture. */
export function accentForGenerated(value: string, sky: SkyInput): string | null {
  if (value.startsWith('pattern:')) return PATTERNS.find((p) => p.id === value.slice(8))?.accent ?? null;
  let rgb: Rgb | null = null;
  if (value.startsWith('color:')) {
    const hex = SOLID_COLORS.find((s) => s.id === value.slice(6))?.color;
    if (hex) rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  }
  if (value === SKY) {
    const [top, bottom] = skyColors(sky.minutes, sky.sunrise, sky.sunset, sky.condition);
    rgb = mix(top, bottom, 0.5);
  }
  if (!rgb) return null;
  return accentFromPixels(new Uint8ClampedArray([...rgb.map((v) => Math.round(v)), 255]));
}

/** How bright the top edge of a generated picture is, 0 to 1; null for pictures, which are sampled. */
export function topBrightnessOfGenerated(value: string, sky: SkyInput): number | null {
  if (value.startsWith('pattern:')) return PATTERNS.find((p) => p.id === value.slice(8))?.top ?? null;
  if (value.startsWith('color:')) {
    const hex = SOLID_COLORS.find((s) => s.id === value.slice(6))?.color;
    return hex ? brightness(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb)) : null;
  }
  if (value === SKY) return brightness(...skyColors(sky.minutes, sky.sunrise, sky.sunset, sky.condition)[0]);
  return null;
}

/**
 * The picture to show next when the desktop changes by itself: another one
 * from the collection the current one belongs to. The default picture moves
 * on to the photos; the dynamic sky already changes, so it stays.
 */
export function nextPicture(current: string | null, photos: string[]): string | null {
  let pool: string[];
  if (current?.startsWith('color:')) pool = SOLID_COLORS.map((c) => `color:${c.id}`);
  else if (current?.startsWith('pattern:')) pool = PATTERNS.map((p) => `pattern:${p.id}`);
  else if (current === SKY) return null;
  else pool = photos;
  const others = pool.filter((value) => value !== current);
  return others.length ? others[Math.floor(Math.random() * others.length)] : null;
}
