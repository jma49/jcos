// Current weather, daylight and a short forecast for a place, from
// Open-Meteo (no key needed). Shared by the Dashboard widgets and the
// desktop sky, so each place is fetched once per half hour.

import { useEffect, useState } from 'react';
import { usesFahrenheit, type Place } from './place';

export type Condition = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

interface Forecast {
  /** "2026-09-26" */
  date: string;
  high: number;
  low: number;
  condition: Condition;
}

export interface Weather {
  temp: number;
  high: number;
  low: number;
  unit: 'F' | 'C';
  code: number;
  condition: Condition;
  /** Minutes after local midnight at the place. */
  sunrise: number;
  sunset: number;
  /** The next days, tomorrow first. */
  forecast: Forecast[];
}

/** WMO weather codes grouped into what the desktop can show. */
const CONDITIONS: { codes: number[]; condition: Condition; label: string; icon: string }[] = [
  { codes: [0], condition: 'clear', label: 'Clear', icon: '☀️' },
  { codes: [1, 2], condition: 'cloudy', label: 'Partly Cloudy', icon: '⛅' },
  { codes: [3], condition: 'overcast', label: 'Overcast', icon: '☁️' },
  { codes: [45, 48], condition: 'fog', label: 'Fog', icon: '🌫️' },
  { codes: [51, 53, 55, 56, 57], condition: 'drizzle', label: 'Drizzle', icon: '🌦️' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], condition: 'rain', label: 'Rain', icon: '🌧️' },
  { codes: [71, 73, 75, 77, 85, 86], condition: 'snow', label: 'Snow', icon: '🌨️' },
  { codes: [95, 96, 99], condition: 'storm', label: 'Thunderstorms', icon: '⛈️' }
];

export const describe = (condition: Condition) => CONDITIONS.find((c) => c.condition === condition) ?? CONDITIONS[0];

const conditionOf = (code: number) => (CONDITIONS.find((c) => c.codes.includes(code)) ?? CONDITIONS[0]).condition;

/** "2026-09-25T07:02" → minutes after midnight. */
const minutesOf = (iso: string) => {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return h * 60 + m;
};

/** Minutes after midnight right now in a time zone. */
export function localMinutes(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** How long a forecast is reused before it's fetched again. */
const WEATHER_TTL = 30 * 60_000;

const cache = new Map<string, { at: number; request: Promise<Weather> }>();

/** The weather at a place, in the units people there use. */
export function getWeather(place: Place): Promise<Weather> {
  const unit = usesFahrenheit(place) ? 'F' : 'C';
  const key = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)},${unit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL) return hit.request;

  const request = fetch(
    'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
      `&temperature_unit=${unit === 'F' ? 'fahrenheit' : 'celsius'}` +
      `&timezone=${encodeURIComponent(place.timeZone)}&forecast_days=6`
  )
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d): Weather => ({
      temp: Math.round(d.current.temperature_2m),
      unit,
      code: d.current.weather_code,
      condition: conditionOf(d.current.weather_code),
      high: Math.round(d.daily.temperature_2m_max[0]),
      low: Math.round(d.daily.temperature_2m_min[0]),
      sunrise: minutesOf(d.daily.sunrise[0]),
      sunset: minutesOf(d.daily.sunset[0]),
      forecast: (d.daily.time as string[]).slice(1).map((date, i) => ({
        date,
        high: Math.round(d.daily.temperature_2m_max[i + 1]),
        low: Math.round(d.daily.temperature_2m_min[i + 1]),
        condition: conditionOf(d.daily.weather_code[i + 1])
      }))
    }));
  cache.set(key, { at: Date.now(), request });
  // Let a later caller retry after a failure.
  request.catch(() => cache.delete(key));
  return request;
}

/** The weather at a place, refreshed as it expires; `error` once a fetch fails. */
export function useWeather(place: Place | null): Weather | null | 'error' {
  const [state, setState] = useState<{ key: string; weather: Weather | 'error' } | null>(null);
  const key = place ? `${place.latitude},${place.longitude},${place.country}` : '';

  useEffect(() => {
    if (!place) return;
    let live = true;
    const load = () =>
      getWeather(place).then(
        (weather) => live && setState({ key, weather }),
        () => live && setState((s) => (s?.key === key && s.weather !== 'error' ? s : { key, weather: 'error' }))
      );
    load();
    const timer = setInterval(load, WEATHER_TTL);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [key]);

  return state?.key === key ? state.weather : null;
}
