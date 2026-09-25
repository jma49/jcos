import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useWindows } from './store';
import { useOSData } from './context';
import { describe as describeWeather, getWeather, type Weather } from './weather';

// Tiger-style Dashboard: an overlay of widgets that zoom in over a dimmed desktop.

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function ClockWidget() {
  const now = useNow(1000);
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
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
  return (
    <div className="os-widget os-widget-clock">
      <svg viewBox="0 0 100 100" aria-label={now.toLocaleTimeString('en-US')}>
        <defs>
          <radialGradient id="clock-face" cx="50%" cy="35%" r="70%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#dcdcdc" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="#1b1b1b" />
        <circle cx="50" cy="50" r="44" fill="url(#clock-face)" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1="10"
            x2="50"
            y2={i % 3 === 0 ? 16 : 13}
            stroke="#333"
            strokeWidth={i % 3 === 0 ? 2 : 1}
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        {hand(h * 30, 22, 3.2, '#222')}
        {hand(m * 6, 32, 2.2, '#222')}
        {hand(s * 6, 36, 1, '#d8302a')}
        <circle cx="50" cy="50" r="2.4" fill="#d8302a" />
        <ellipse cx="50" cy="28" rx="34" ry="18" fill="#fff" opacity="0.35" />
      </svg>
      <span>San Jose</span>
    </div>
  );
}

function CalendarWidget() {
  const now = useNow(60_000);
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="os-widget os-widget-calendar">
      <div className="os-cal-page">
        <span>{now.toLocaleDateString('en-US', { weekday: 'long' })}</span>
        <strong>{now.getDate()}</strong>
      </div>
      <div className="os-cal-month">
        <p>{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        <div className="os-cal-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <b key={i}>{d}</b>
          ))}
          {cells.map((d, i) => (
            <span key={i} data-today={d === now.getDate() || undefined}>
              {d ?? ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeatherWidget() {
  const [weather, setWeather] = useState<Weather | null | 'error'>(null);
  useEffect(() => {
    getWeather()
      .then(setWeather)
      .catch(() => setWeather('error'));
  }, []);

  const { label, icon } = describeWeather(weather && weather !== 'error' ? weather.condition : 'clear');

  return (
    <div className="os-widget os-widget-weather">
      <p className="os-weather-city">San Jose</p>
      {weather === null && <p className="os-weather-note">Loading…</p>}
      {weather === 'error' && <p className="os-weather-note">Weather unavailable</p>}
      {weather && weather !== 'error' && (
        <>
          <div className="os-weather-now">
            <span className="os-weather-icon" aria-hidden="true">
              {icon}
            </span>
            <strong>{weather.temp}°</strong>
          </div>
          <p className="os-weather-note">
            {label} · H {weather.high}° L {weather.low}°
          </p>
        </>
      )}
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
    { key: 'github', node: <GitHubWidget user={githubUser} /> },
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
