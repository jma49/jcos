import { useEffect, useState } from 'react';
import { CURSOR_COLORS, CURSOR_INTERVAL, getSocial, type Presence as Channel } from './social';
import { MOBILE_BREAKPOINT, useWindows } from './store';

/** A remote cursor fades out after this long without moving. */
const IDLE_MS = 4000;

interface Cursor {
  x: number;
  y: number;
  color: string;
  at: number;
}

/**
 * Joins the desktop's presence channel: counts who's here for the menu bar
 * and draws other visitors' pointers. Phones are counted but don't send a
 * pointer, since they have none.
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

    getSocial().then((social) => {
      if (!social || cancelled) return;
      channel = social.joinPresence(color, {
        onCount: (count) => useWindows.getState().setOnline(count),
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
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        window.addEventListener('pointermove', onMove);
        document.addEventListener('pointerout', onOut);
      }
    });

    // Re-render now and then so idle cursors fade.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      clearTimeout(queued);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      channel?.leave();
      useWindows.getState().setOnline(null);
    };
  }, []);

  return (
    <div className="os-cursors" aria-hidden="true">
      {Object.entries(cursors).map(([id, c]) => (
        <svg
          key={id}
          className="os-cursor"
          data-idle={now - c.at > IDLE_MS || undefined}
          style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, color: c.color }}
          viewBox="0 0 16 22"
          width="16"
          height="22"
        >
          <path d="M1 1v17l4.5-4.2 3 6.7 2.6-1.2-3-6.6H14z" fill="currentColor" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

/** Menu bar item: how many people are on the desktop. */
export function OnlineStatus() {
  const online = useWindows((s) => s.online);
  if (!online) return null;
  const others = online - 1;
  const label = others === 0 ? 'Just you on this desktop' : `${online} people on this desktop right now`;
  return (
    <span className="os-online" title={label} aria-label={label}>
      <svg viewBox="0 0 16 12" width="15" height="11" aria-hidden="true">
        <circle cx="5.5" cy="3" r="2.6" fill="currentColor" />
        <path d="M0.5 11.5c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8z" fill="currentColor" />
        <circle cx="11.5" cy="3.6" r="2.1" fill="currentColor" opacity="0.6" />
        <path d="M9.6 7.1c2.9-0.6 5.9 0.9 5.9 4.4h-4.3c0-1.9-0.6-3.3-1.6-4.4z" fill="currentColor" opacity="0.6" />
      </svg>
      {online}
    </span>
  );
}
