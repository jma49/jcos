import { useEffect, useRef, useState } from 'react';
import { CURSOR_COLORS, CURSOR_INTERVAL, getSocial, type Presence as Channel, type Visitor, type VisitorInfo } from './social';
import { isPhone, useWindows } from '../core/store';
import type { Place } from '../ambient/place';

/** A remote cursor fades out after this long without moving. */
const IDLE_MS = 4000;

interface Cursor {
  x: number;
  y: number;
  color: string;
  at: number;
}

/** "🇯🇵" for "JP"; empty for anything that isn't a two-letter code. */
function flag(country?: string) {
  if (!country || !/^[A-Z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** What others see about this visitor: a colour, and their city once located. */
function infoFor(color: string, place: Place | null): VisitorInfo {
  if (!place || place.source === 'fallback') return { color };
  return { color, city: place.city, country: place.country };
}

/**
 * Joins the desktop's presence channel: lists who's here, and from where,
 * for the menu bar, and draws other visitors' pointers labelled with their
 * city. Phones are counted but don't send a pointer, since they have none.
 */
export function Presence() {
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let channel: Channel | null = null;
    let cancelled = false;
    let last = 0;
    let queued = 0;
    const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

    const send = (x: number, y: number) => {
      const wait = CURSOR_INTERVAL - (performance.now() - last);
      clearTimeout(queued);
      if (wait > 0) {
        queued = window.setTimeout(() => send(x, y), wait);
        return;
      }
      last = performance.now();
      channel?.moveCursor(x, y);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') send(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    };
    const onOut = (e: PointerEvent) => !e.relatedTarget && send(-1, -1);

    let unsubscribe = () => {};
    getSocial().then((social) => {
      if (!social || cancelled) return;
      channel = social.joinPresence(infoFor(color, useWindows.getState().place), {
        onVisitors: (visitors) => useWindows.getState().setVisitors(visitors),
        onCursor: (id, x, y, c) =>
          setCursors((all) => {
            if (x < 0) {
              const { [id]: _gone, ...rest } = all;
              return rest;
            }
            return { ...all, [id]: { x, y, color: c, at: Date.now() } };
          }),
        onLeave: (id) =>
          setCursors((all) => {
            const { [id]: _gone, ...rest } = all;
            return rest;
          })
      });
      unsubscribe = useWindows.subscribe((state, prev) => {
        if (state.place !== prev.place) channel?.update(infoFor(color, state.place));
      });
      if (!isPhone()) {
        window.addEventListener('pointermove', onMove);
        document.addEventListener('pointerout', onOut);
      }
    });

    // Re-render now and then so idle cursors fade.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(tick);
      clearTimeout(queued);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      channel?.leave();
      useWindows.getState().setVisitors(null);
    };
  }, []);

  const visitors = useWindows((s) => s.visitors);
  const whereIs = (id: string) => {
    const v = visitors?.find((v) => v.id === id);
    return v?.city ? `${flag(v.country)} ${v.city}`.trim() : null;
  };

  return (
    <div className="os-cursors" aria-hidden="true">
      {Object.entries(cursors).map(([id, c]) => {
        const where = whereIs(id);
        return (
          <div
            key={id}
            className="os-cursor"
            data-idle={now - c.at > IDLE_MS || undefined}
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, color: c.color }}
          >
            <svg viewBox="0 0 16 22" width="16" height="22">
              <path d="M1 1v17l4.5-4.2 3 6.7 2.6-1.2-3-6.6H14z" fill="currentColor" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            {where && (
              <span className="os-cursor-label" style={{ background: c.color }}>
                {where}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function describeVisitor(v: Visitor) {
  const where = v.city ? `${flag(v.country)} ${v.city}`.trim() : 'Somewhere';
  return v.self ? `${where} (you)` : where;
}

/** Menu bar item: how many people are on the desktop; click for where they are. */
export function OnlineStatus() {
  const visitors = useWindows((s) => s.visitors);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!visitors?.length) return null;
  const online = visitors.length;
  const label = online === 1 ? 'Just you on this desktop' : `${online} people on this desktop right now`;
  // You first, then everyone else.
  const sorted = [...visitors].sort((a, b) => Number(!!b.self) - Number(!!a.self));

  return (
    <div ref={ref} className="os-online-wrap">
      <button
        type="button"
        className="os-online"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 12" width="15" height="11" aria-hidden="true">
          <circle cx="5.5" cy="3" r="2.6" fill="currentColor" />
          <path d="M0.5 11.5c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8z" fill="currentColor" />
          <circle cx="11.5" cy="3.6" r="2.1" fill="currentColor" opacity="0.6" />
          <path d="M9.6 7.1c2.9-0.6 5.9 0.9 5.9 4.4h-4.3c0-1.9-0.6-3.3-1.6-4.4z" fill="currentColor" opacity="0.6" />
        </svg>
        {online}
      </button>
      {open && (
        <div className="os-online-list os-menu-list" role="dialog" aria-label="People on this desktop">
          <p>{online === 1 ? 'Just you here right now' : `${online} people here right now`}</p>
          <ul>
            {sorted.map((v) => (
              <li key={v.id}>
                <i style={{ background: v.color }} aria-hidden="true" />
                {describeVisitor(v)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
