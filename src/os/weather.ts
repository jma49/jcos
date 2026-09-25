// Current weather and daylight in San Jose, from Open-Meteo (no key needed).
// Shared by the Dashboard widget and the desktop sky, so it's fetched once.

export const TIME_ZONE = 'America/Los_Angeles';

export type Condition = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Weather {
  temp: number;
  high: number;
  low: number;
  code: number;
  condition: Condition;
  /** Minutes after local midnight in San Jose. */
  sunrise: number;
  sunset: number;
}

/** WMO weather codes grouped into what the desktop can show. */
export const CONDITIONS: { codes: number[]; condition: Condition; label: string; icon: string }[] = [
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

/** "2026-09-25T07:02" → minutes after midnight. */
const minutesOf = (iso: string) => {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return h * 60 + m;
};

/** Minutes after midnight right now in San Jose. */
export function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

let request: Promise<Weather> | null = null;

/** The current San Jose weather, fetched once per page load. */
export function getWeather(): Promise<Weather> {
  request ??= fetch(
    'https://api.open-meteo.com/v1/forecast?latitude=37.3382&longitude=-121.8863' +
      '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset' +
      '&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=1'
  )
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => ({
      temp: Math.round(d.current.temperature_2m),
      code: d.current.weather_code,
      condition: (CONDITIONS.find((c) => c.codes.includes(d.current.weather_code)) ?? CONDITIONS[0]).condition,
      high: Math.round(d.daily.temperature_2m_max[0]),
      low: Math.round(d.daily.temperature_2m_min[0]),
      sunrise: minutesOf(d.daily.sunrise[0]),
      sunset: minutesOf(d.daily.sunset[0])
    }));
  // Let a later caller retry after a failure.
  request.catch(() => (request = null));
  return request;
}
