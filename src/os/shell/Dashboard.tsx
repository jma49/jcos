import { useEffect, useState, type ReactNode } from 'react';
import { PlaceSearch } from '../ambient/PlaceSearch';
import { getSocial, type Post } from '../social/social';
import { flag } from '../social/Presence';
import { launch } from '../core/registry';
import { AnimatePresence, motion } from 'motion/react';
import { useWindows } from '../core/store';
import { useOSData } from '../core/context';
import { describe as describeWeather, useWeather } from '../ambient/weather';
import {
  choosePlace,
  clockTimeZone,
  distanceKm,
  HOME,
  hoursAhead,
  usePlace,
  wallClock,
  type Place,
  type WallClock
} from '../ambient/place';

// Tiger-style Dashboard: an overlay of widgets that zoom in over a dimmed
// desktop. The clock, calendar and weather are the visitor's; one widget
// shows what time it is where Jincheng is.

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** The visitor's wall clock, ticking every `intervalMs`. */
function useWallClock(intervalMs: number, timeZone?: string) {
  const place = usePlace();
  const zone = timeZone ?? clockTimeZone(place);
  const now = useNow(intervalMs);
  return { now, zone, clock: wallClock(now, zone) };
}

function ClockFace({ clock, size = 160, label }: { clock: WallClock; size?: number; label: string }) {
  const s = clock.second;
  const m = clock.minute + s / 60;
  const h = (clock.hour % 12) + m / 60;
  const hand = (deg: number, length: number, width: number, color: string) => (
    <line
      x1="50"
      y1="50"
      x2={50 + length * Math.sin((deg * Math.PI) / 180)}
      y2={50 - length * Math.cos((deg * Math.PI) / 180)}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  // Tiger's clock turns dark at night.
  const night = clock.hour < 6 || clock.hour >= 18;
  const id = `clock-face-${size}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label}>
      <defs>
        <radialGradient id={id} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor={night ? '#4a4a4a' : '#ffffff'} />
          <stop offset="1" stopColor={night ? '#1e1e1e' : '#dcdcdc'} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#1b1b1b" />
      <circle cx="50" cy="50" r="44" fill={`url(#${id})`} />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="50"
          y1="10"
          x2="50"
          y2={i % 3 === 0 ? 16 : 13}
          stroke={night ? '#ddd' : '#333'}
          strokeWidth={i % 3 === 0 ? 2 : 1}
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      {hand(h * 30, 22, 3.2, night ? '#eee' : '#222')}
      {hand(m * 6, 32, 2.2, night ? '#eee' : '#222')}
      {hand(s * 6, 36, 1, '#d8302a')}
      <circle cx="50" cy="50" r="2.4" fill="#d8302a" />
      <ellipse cx="50" cy="28" rx="34" ry="18" fill="#fff" opacity={night ? 0.12 : 0.35} />
    </svg>
  );
}

function ClockWidget() {
  const place = usePlace();
  const { now, zone, clock } = useWallClock(1000);
  const city = place && place.source !== 'fallback' ? place.city : 'Local time';
  return (
    <div className="os-widget os-widget-clock">
      <ClockFace clock={clock} label={now.toLocaleTimeString('en-US', { timeZone: zone })} />
      <span>{city}</span>
    </div>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function CalendarWidget() {
  const { clock } = useWallClock(60_000);
  const { year, month, day } = clock;
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="os-widget os-widget-calendar">
      <div className="os-cal-page">
        <span>{WEEKDAY_NAMES[clock.weekday]}</span>
        <strong>{day}</strong>
      </div>
      <div className="os-cal-month">
        <p>
          {MONTHS[month]} {year}
        </p>
        <div className="os-cal-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <b key={i}>{d}</b>
          ))}
          {cells.map((d, i) => (
            <span key={i} data-today={d === day || undefined}>
              {d ?? ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The back of the Weather widget: pick a city, or go back to the IP location. */
function PlacePicker({ place, onDone }: { place: Place | null; onDone: () => void }) {
  const pick = (next: Place | null) => {
    choosePlace(next);
    onDone();
  };

  return (
    <div className="os-weather-back">
      <label className="os-weather-city" htmlFor="os-weather-search">
        Show weather for
      </label>
      <PlaceSearch id="os-weather-search" onPick={pick} onCancel={onDone} />
      <div className="os-weather-actions">
        {place?.source === 'chosen' && (
          <button type="button" onClick={() => pick(null)}>
            Use my location
          </button>
        )}
        <button type="button" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

const shortDay = (date: string) => WEEKDAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()].slice(0, 3);

function WeatherWidget() {
  const place = usePlace();
  const weather = useWeather(place);
  const [flipped, setFlipped] = useState(false);
  const { label, icon } = describeWeather(weather && weather !== 'error' ? weather.condition : 'clear');

  return (
    <motion.div
      className="os-widget os-widget-weather"
      key={flipped ? 'back' : 'front'}
      initial={{ rotateY: 90 }}
      animate={{ rotateY: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {flipped ? (
        <PlacePicker place={place} onDone={() => setFlipped(false)} />
      ) : (
        <>
          <p className="os-weather-city">{place ? place.city : 'Locating…'}</p>
          <button type="button" className="os-widget-info" onClick={() => setFlipped(true)} aria-label="Change city" title="Change city">
            i
          </button>
          {place && weather === null && <p className="os-weather-note">Loading…</p>}
          {weather === 'error' && <p className="os-weather-note">Weather unavailable</p>}
          {weather && weather !== 'error' && (
            <>
              <div className="os-weather-now">
                <span className="os-weather-icon" aria-hidden="true">
                  {icon}
                </span>
                <strong>
                  {weather.temp}°<small>{weather.unit}</small>
                </strong>
              </div>
              <p className="os-weather-note">
                {label} · H {weather.high}° L {weather.low}°
              </p>
              <ol className="os-weather-forecast" aria-label="Forecast">
                {weather.forecast.slice(0, 5).map((day) => (
                  <li key={day.date} title={describeWeather(day.condition).label}>
                    <span>{shortDay(day.date)}</span>
                    <span aria-hidden="true">{describeWeather(day.condition).icon}</span>
                    <span>{day.high}°</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}

/** A guess at what Jincheng is doing, from the hour in San Jose. */
function whatJinchengIsUpTo({ hour, weekday }: WallClock) {
  const weekend = weekday === 0 || weekday === 6;
  if (hour < 7) return 'Probably asleep. Messages get answered in the morning.';
  if (hour < 9) return 'Starting the day.';
  if (weekend && hour < 19) return 'Weekend. Likely bouldering or out with a camera.';
  if (hour >= 12 && hour < 13) return 'Lunch break.';
  if (hour < 18) return 'Probably heads-down at work.';
  if (hour < 22) return 'Evening. Maybe at the climbing gym.';
  return 'Winding down for the night.';
}

function describeOffset(hours: number) {
  if (hours === 0) return 'Same time as you';
  const n = Math.abs(hours);
  const amount = Number.isInteger(n) ? `${n} h` : `${Math.floor(n)} h ${Math.round((n % 1) * 60)} min`;
  return `${amount} ${hours < 0 ? 'behind' : 'ahead of'} you`;
}

/** Jincheng's local time and weather, next to the visitor's own. */
function HomeWidget({ email }: { email: string }) {
  const place = usePlace();
  // Show San Jose's weather in the visitor's units, so the two compare.
  const weather = useWeather(place ? { ...HOME, country: place.country } : null);
  const { now, zone, clock } = useWallClock(1000, HOME.timeZone);
  const offset = hoursAhead(HOME.timeZone, clockTimeZone(place), now);
  const time = now.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
  // Within the Bay Area, roughly.
  const here = place !== null && place.source !== 'fallback' && distanceKm(place, HOME) < 80;

  return (
    <div className="os-widget os-widget-home">
      <p className="os-widget-title">Jincheng’s time · {HOME.city}</p>
      <div className="os-home-now">
        <ClockFace clock={clock} size={56} label={`${time} in ${HOME.city}`} />
        <div>
          <strong>{time}</strong>
          <span>
            {WEEKDAY_NAMES[clock.weekday]}
            {weather && weather !== 'error' && (
              <>
                {' · '}
                {describeWeather(weather.condition).icon} {weather.temp}°{weather.unit}
              </>
            )}
          </span>
        </div>
      </div>
      <p className="os-home-offset">{here ? 'You’re in the same area. Hi, neighbor!' : describeOffset(offset)}</p>
      <p className="os-home-status">{whatJinchengIsUpTo(clock)}</p>
      <a href={`mailto:${email}`}>Say hello →</a>
    </div>
  );
}

interface GitHubEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload: { action?: string; ref_type?: string; size?: number; commits?: { message: string }[] };
}

function describe(e: GitHubEvent): string | null {
  const repo = e.repo.name.split('/')[1];
  switch (e.type) {
    case 'PushEvent': {
      const msg = e.payload.commits?.at(-1)?.message.split('\n')[0];
      return msg ? `${repo}: ${msg}` : `Pushed to ${repo}`;
    }
    case 'PullRequestEvent':
      return `${e.payload.action === 'closed' ? 'Merged/closed' : 'Opened'} a PR in ${repo}`;
    case 'CreateEvent':
      return e.payload.ref_type === 'repository' ? `Created ${repo}` : null;
    case 'WatchEvent':
      return `Starred ${e.repo.name}`;
    default:
      return null;
  }
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 60 / 24)}d`;
}

function GitHubWidget({ user }: { user: string }) {
  const [events, setEvents] = useState<GitHubEvent[] | null | 'error'>(null);
  useEffect(() => {
    fetch(`https://api.github.com/users/${user}/events/public?per_page=30`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setEvents)
      .catch(() => setEvents('error'));
  }, [user]);

  const rows =
    events && events !== 'error'
      ? events.flatMap((e) => {
          const text = describe(e);
          return text ? [{ id: e.id, text, when: ago(e.created_at) }] : [];
        }).slice(0, 5)
      : [];

  return (
    <div className="os-widget os-widget-github">
      <p className="os-widget-title">GitHub · @{user}</p>
      {events === null && <p className="os-widget-muted">Loading…</p>}
      {events === 'error' && <p className="os-widget-muted">Activity unavailable</p>}
      {events && events !== 'error' && rows.length === 0 && <p className="os-widget-muted">No recent public activity</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <span>{r.text}</span>
            <time>{r.when}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The newest Soapbox post, as a speech bubble. Hidden when there's none. */
function SoapboxWidget() {
  const [post, setPost] = useState<Post | null>(null);
  useEffect(() => {
    let live = true;
    getSocial()
      .then((social) => social?.listPosts())
      .then((posts) => live && setPost(posts?.[0] ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!post) return null;

  return (
    <button
      type="button"
      className="os-widget os-widget-soapbox"
      data-kind={post.kind}
      onClick={() => {
        useWindows.getState().setDashboard(false);
        launch('soapbox');
      }}
      title="Open Soapbox"
    >
      <span className="os-widget-title">
        {post.kind === 'rant' ? '🔥 Latest rant' : '📝 Latest from Soapbox'} · {ago(post.created_at)} ago
      </span>
      <span className="os-soapbox-bubble">{post.body.length > 180 ? `${post.body.slice(0, 180)}…` : post.body}</span>
    </button>
  );
}

/** Where the people on the desktop right now are, by city. Hidden when it's just you. */
function VisitorsWidget() {
  const visitors = useWindows((s) => s.visitors) ?? [];
  if (visitors.length < 2) return null;
  const cities = new Map<string, { label: string; count: number; you: boolean }>();
  for (const v of visitors) {
    const key = v.city ? `${v.city}|${v.country ?? ''}` : '?';
    const label = v.city ? `${flag(v.country)} ${v.city}`.trim() : 'Somewhere';
    const row = cities.get(key) ?? { label, count: 0, you: false };
    row.count += 1;
    row.you ||= Boolean(v.self);
    cities.set(key, row);
  }
  const rows = [...cities.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 6);
  return (
    <div className="os-widget os-widget-visitors">
      <p className="os-widget-title">On the desktop now · {visitors.length}</p>
      <ul>
        {rows.map((r) => (
          <li key={r.label}>
            <span>
              {r.label}
              {r.you && <small> (you)</small>}
            </span>
            {r.count > 1 && <b>×{r.count}</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StickyWidget({ children }: { children: ReactNode }) {
  return <div className="os-widget os-widget-sticky">{children}</div>;
}

export function Dashboard() {
  const open = useWindows((s) => s.dashboardOpen);
  const setDashboard = useWindows((s) => s.setDashboard);
  const data = useOSData();
  const githubUser = new URL(data.links.github).pathname.slice(1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDashboard(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setDashboard]);

  const widgets = [
    { key: 'clock', node: <ClockWidget /> },
    { key: 'calendar', node: <CalendarWidget /> },
    { key: 'weather', node: <WeatherWidget /> },
    { key: 'home', node: <HomeWidget email={data.email} /> },
    { key: 'github', node: <GitHubWidget user={githubUser} /> },
    { key: 'soapbox', node: <SoapboxWidget /> },
    { key: 'visitors', node: <VisitorsWidget /> },
    {
      key: 'sticky',
      node: (
        <StickyWidget>
          Currently looking for software engineering roles in the Bay Area.
          <br />
          <br />
          {data.email}
        </StickyWidget>
      )
    }
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="os-dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onPointerDown={(e) => e.target === e.currentTarget && setDashboard(false)}
          role="dialog"
          aria-label="Dashboard"
        >
          <div className="os-dashboard-board" onPointerDown={(e) => e.target === e.currentTarget && setDashboard(false)}>
            {widgets.map((w, i) => (
              <motion.div
                key={w.key}
                className={`os-dashboard-slot os-slot-${w.key}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22, delay: i * 0.05 }}
              >
                {w.node}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
