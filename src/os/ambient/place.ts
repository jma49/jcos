// Where the visitor is. The desktop's light, weather and clock follow them:
// by default the place comes from their IP address (api/geo.ts), and the
// Weather widget lets them pick another city, which is remembered.
//
// Order: `?place=<city>` in the URL (for demos, not saved), then a city the
// visitor picked, then their IP location, then San Jose as a last resort.

import { useWindows } from '../core/store';
import { loadJSON, saveJSON } from '../core/storage';

export interface Place {
  city: string;
  /** State or province, when known. */
  region?: string;
  /** ISO 3166-1 alpha-2 code, e.g. "US". */
  country?: string;
  latitude: number;
  longitude: number;
  /** IANA time zone, e.g. "Asia/Tokyo". */
  timeZone: string;
  /** How the place was found. `fallback` means the visitor couldn't be located. */
  source: 'ip' | 'chosen' | 'url' | 'fallback';
}

/** Where Jincheng is. */
export const HOME: Place = {
  city: 'San Jose',
  region: 'California',
  country: 'US',
  latitude: 37.3382,
  longitude: -121.8863,
  timeZone: 'America/Los_Angeles',
  source: 'fallback'
};

const SAVED_KEY = 'os-place';

/** Countries that measure temperature in Fahrenheit. */
const FAHRENHEIT = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'LR', 'MM', 'BS', 'KY', 'PW', 'FM', 'MH']);

export function usesFahrenheit(place: Pick<Place, 'country'>) {
  return FAHRENHEIT.has(place.country ?? '');
}

/** The browser's own time zone, used when a place names none (or an invalid one). */
export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || HOME.timeZone;
}

function validTimeZone(zone: string | null | undefined) {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** The time zone clocks should use: the place's, unless the visitor couldn't be located. */
export function clockTimeZone(place: Place | null) {
  return place && place.source !== 'fallback' ? place.timeZone : deviceTimeZone();
}

/** Hours `zone` is ahead of `from` right now (negative when behind). */
export function hoursAhead(zone: string, from: string, date = new Date()) {
  const wall = (timeZone: string) => {
    const c = wallClock(date, timeZone);
    return Date.UTC(c.year, c.month, c.day, c.hour, c.minute);
  };
  return (wall(zone) - wall(from)) / 3_600_000;
}

/** Distance between two places in kilometres (haversine). */
export function distanceKm(a: Pick<Place, 'latitude' | 'longitude'>, b: Pick<Place, 'latitude' | 'longitude'>) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** Whether two time zones read the same wall clock right now. */
export function sameTime(a: string, b: string, date = new Date()) {
  return hoursAhead(a, b, date) === 0;
}

/** "Tokyo, Japan" or "Austin, TX"-style label. */
export function placeLabel(place: Place) {
  if (place.country === 'US' && place.region) return `${place.city}, ${place.region}`;
  if (!place.country) return place.city;
  try {
    const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(place.country);
    return country ? `${place.city}, ${country}` : place.city;
  } catch {
    return place.city;
  }
}

/** Cities matching a search, from Open-Meteo's geocoder (no key needed). */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (!query.trim()) return [];
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(query.trim())}`,
    { signal }
  );
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data: {
    results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number; timezone?: string }[];
  } = await res.json();
  return (data.results ?? []).map((r) => ({
    city: r.name,
    region: r.admin1,
    country: r.country_code?.toUpperCase(),
    latitude: r.latitude,
    longitude: r.longitude,
    timeZone: validTimeZone(r.timezone) ?? deviceTimeZone(),
    source: 'chosen'
  }));
}

function savedPlace(): Place | null {
  const place = loadJSON<Place | null>(SAVED_KEY, null);
  if (place && Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && place.city) {
    return { ...place, timeZone: validTimeZone(place.timeZone) ?? deviceTimeZone(), source: 'chosen' };
  }
  return null;
}

async function ipPlace(): Promise<Place | null> {
  const res = await fetch('/api/geo');
  if (res.status !== 200 || !res.headers.get('content-type')?.includes('json')) return null;
  const d: { city: string | null; region: string | null; country: string | null; latitude: number; longitude: number; timeZone: string | null } =
    await res.json();
  return {
    city: d.city ?? 'Your location',
    region: d.region ?? undefined,
    country: d.country ?? undefined,
    latitude: d.latitude,
    longitude: d.longitude,
    timeZone: validTimeZone(d.timeZone) ?? deviceTimeZone(),
    source: 'ip'
  };
}

async function locate(): Promise<Place> {
  const query = new URLSearchParams(window.location.search).get('place');
  if (query) {
    const [match] = await searchPlaces(query).catch(() => []);
    if (match) return { ...match, source: 'url' };
  }
  const saved = savedPlace();
  if (saved) return saved;
  return (await ipPlace().catch(() => null)) ?? HOME;
}

let started = false;

/** Finds the visitor once per page load and puts the place in the store. */
export function startLocating() {
  if (started) return;
  started = true;
  locate().then((place) => useWindows.getState().setPlace(place));
}

/** Uses a city the visitor picked from now on, or goes back to their IP location with null. */
export function choosePlace(place: Place | null) {
  saveJSON(SAVED_KEY, place ? { ...place, source: 'chosen' } : null);
  if (place) {
    useWindows.getState().setPlace({ ...place, source: 'chosen' });
    return;
  }
  ipPlace()
    .catch(() => null)
    .then((found) => useWindows.getState().setPlace(found ?? HOME));
}

/** The visitor's place, or null while it's being looked up. */
export function usePlace() {
  return useWindows((s) => s.place);
}

export interface WallClock {
  year: number;
  /** 0–11, like Date#getMonth. */
  month: number;
  day: number;
  /** 0 (Sunday) to 6. */
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** What a wall clock in `timeZone` reads at `date`. */
export function wallClock(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')) - 1,
    day: Number(get('day')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second'))
  };
}
