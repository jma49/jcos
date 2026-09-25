// The accent colour: selection, highlighted menu items, default buttons and
// focus rings. By default it comes from the desktop picture, the way ryOS
// does it: sample the image, find its most prominent colourful hue, and
// settle it at a lightness white text reads well on. The visitor can pick a
// fixed colour instead in System Preferences.

export type AccentChoice = 'auto' | 'blue' | 'graphite' | 'green' | 'orange' | 'purple' | 'red';

export const ACCENTS: Record<Exclude<AccentChoice, 'auto'>, { name: string; color: string }> = {
  blue: { name: 'Blue', color: '#3875d7' },
  graphite: { name: 'Graphite', color: '#6b7684' },
  green: { name: 'Green', color: '#3f9a4c' },
  orange: { name: 'Orange', color: '#d9762a' },
  purple: { name: 'Purple', color: '#8656c4' },
  red: { name: 'Red', color: '#cf4a40' }
};

/** Used when a picture can't be sampled. */
export const DEFAULT_ACCENT = ACCENTS.blue.color;

type Hsl = [h: number, s: number, l: number];

function toHsl(r: number, g: number, b: number): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toHex([h, s, l]: Hsl) {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * The accent for an image's pixels (RGBA, as from getImageData): the hue
 * with the most saturated, mid-light weight, at a readable lightness.
 * Mostly grey pictures get a muted tint of their strongest hue.
 */
export function accentFromPixels(data: Uint8ClampedArray): string {
  const BINS = 24;
  const weight = new Array<number>(BINS).fill(0);
  const hueX = new Array<number>(BINS).fill(0);
  const hueY = new Array<number>(BINS).fill(0);
  let colourful = 0;
  let counted = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, l] = toHsl(data[i], data[i + 1], data[i + 2]);
    counted++;
    if (l < 0.1 || l > 0.94) continue;
    // Vivid mid-tones count most; near-black, near-white and greys hardly at all.
    const w = s * s * (1 - Math.abs(l - 0.5) * 1.4);
    if (w <= 0) continue;
    const bin = Math.floor(h / (360 / BINS)) % BINS;
    weight[bin] += w;
    hueX[bin] += Math.cos((h * Math.PI) / 180) * w;
    hueY[bin] += Math.sin((h * Math.PI) / 180) * w;
    colourful += s;
  }
  if (!counted) return DEFAULT_ACCENT;

  // Neighbouring bins together, so a hue split across a boundary isn't undercounted.
  let best = 0;
  let bestScore = -1;
  for (let b = 0; b < BINS; b++) {
    const score = weight[(b + BINS - 1) % BINS] * 0.5 + weight[b] + weight[(b + 1) % BINS] * 0.5;
    if (score > bestScore) {
      best = b;
      bestScore = score;
    }
  }
  if (bestScore <= 0) return ACCENTS.graphite.color;

  const hue = (Math.atan2(hueY[best], hueX[best]) * 180) / Math.PI;
  const h = (hue + 360) % 360;
  const saturation = colourful / counted;
  // Greys and browns: a quiet tint. Colourful pictures: a clear colour.
  const s = saturation < 0.12 ? 0.22 : Math.min(0.72, Math.max(0.42, saturation * 1.6));
  // Yellows and greens look light at the same lightness; darken them for white text.
  const l = h > 40 && h < 170 ? 0.4 : 0.5;
  return toHex([h, s, l]);
}

const CACHE_KEY = 'os-accent-cache';

function cached(url: string): string | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')[url] ?? null;
  } catch {
    return null;
  }
}

function remember(url: string, color: string) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    // Keep the cache small: the last dozen pictures.
    const entries = Object.entries({ ...all, [url]: color }).slice(-12);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

/** A small copy of an Unsplash picture is plenty to sample. */
const sampleUrl = (url: string) => (url.includes('images.unsplash.com') ? url.replace(/([?&])w=\d+/, '$1w=160') : url);

/** The accent for a desktop picture; cached per picture in this browser. */
export async function accentFromPicture(url: string): Promise<string> {
  const hit = cached(url);
  if (hit) return hit;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = sampleUrl(url);
  await img.decode();
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return DEFAULT_ACCENT;
  ctx.drawImage(img, 0, 0, size, size);
  const color = accentFromPixels(ctx.getImageData(0, 0, size, size).data);
  remember(url, color);
  return color;
}

/** The cached accent for a picture, if it has been sampled before; for the first paint. */
export const cachedAccent = cached;
