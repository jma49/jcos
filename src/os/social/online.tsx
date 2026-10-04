import { useEffect, useRef, useState } from 'react';
import { useWindows } from '../core/store';
import type { Visitor } from './types';

// Who's on the desktop, as the menu bar shows it: how many, and where
// they are. The list itself is kept by Presence.tsx, which joins the
// desktop's presence channel once the desktop has settled; this reads it
// from the store, so it's all the first load carries of presence.

/**
 * Past this many people, pointers stop: every visitor's pointer goes to
 * every other, so the messages grow with the square of the crowd. Everyone
 * sees about the same count, so they all stop together, and the desktop
 * shows how many are here instead. Pointers come back once the crowd is
 * down to CALM, a little lower, so a count hovering at the limit doesn't
 * switch them on and off.
 */
export const CROWD = 12;
export const CALM = 10;

/** Whether pointers are off, given how many are here and whether they were. */
export const isCrowded = (count: number, wasCrowded: boolean) => (wasCrowded ? count > CALM : count > CROWD);

/** The most people the menu bar's list names; the rest are counted. */
const LISTED = 30;

/** "🇯🇵" for "JP"; empty for anything that isn't a two-letter code. */
export function flag(country?: string) {
  if (!country || !/^[A-Z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** "🇯🇵 Tokyo", or "Somewhere" before they're located. */
export function whereFrom(v: Pick<Visitor, 'city' | 'country'>) {
  return v.city ? `${flag(v.country)} ${v.city}`.trim() : 'Somewhere';
}

function describeVisitor(v: Visitor) {
  const who = v.username ? `${v.username} · ${whereFrom(v)}` : whereFrom(v);
  return v.self ? `${who} (you)` : who;
}

/** Menu bar item: how many people are on the desktop; click for where they are. */
export function OnlineStatus() {
  const visitors = useWindows((s) => s.visitors);
  const crowded = useWindows((s) => s.crowded);
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
  const unlisted = sorted.length - LISTED;

  return (
    <div ref={ref} className="os-online-wrap">
      <button type="button" className="os-online" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
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
          {crowded && <p className="os-online-note">Pointers are hidden while more than {CROWD} people are here.</p>}
          <ul>
            {sorted.slice(0, LISTED).map((v) => (
              <li key={v.id}>
                <i style={{ background: v.color }} aria-hidden="true" />
                {describeVisitor(v)}
              </li>
            ))}
            {unlisted > 0 && <li className="os-online-more">and {unlisted} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
