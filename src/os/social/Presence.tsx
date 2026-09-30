import { useEffect, useRef, useState } from 'react';
import { CURSOR_COLORS, CURSOR_INTERVAL, getSocial, type Presence as Channel, type Visitor, type VisitorInfo } from './social';
import { isPhone, useWindows } from '../core/store';
import type { Place } from '../ambient/place';
import { useAccount } from './account';
import { useChatState } from './chatState';
import { connectSignals, deliverSignal } from './signals';
import { useAirDrop } from './airdrop';
import { isDM, type Account } from './types';
import { useSystem } from '../core/system';
import { flag, isCrowded, whereFrom } from './online';

/** A remote cursor fades out after this long without moving. */
const IDLE_MS = 4000;
/** And is forgotten after this long, in case its "gone" never arrived. */
const STALE_MS = 30_000;

/**
 * Whether anyone else has chosen to see pointers. Pointers are drawn only
 * for those who ask (System Preferences › Sharing), and sent only while
 * someone does: no one's pointer crosses another screen uninvited, and a
 * desktop where nobody watches sends none at all.
 */
export const anyoneWatching = (visitors: Pick<Visitor, 'self' | 'watching'>[] | null) =>
  !!visitors?.some((v) => !v.self && v.watching);

interface Cursor {
  x: number;
  y: number;
  color: string;
  at: number;
}

/**
 * What others see about this visitor: a colour, their city once located
 * (unless Sharing in System Preferences says not to), their username if
 * they're signed in, the public chat room they have open (never a private
 * conversation) and whether AirDrop can reach them.
 */
function infoFor(color: string, place: Place | null, account: Account | null, room: string | null): VisitorInfo {
  const info: VisitorInfo = { color };
  const shareCity = useSystem.getState().shareCity;
  if (place && place.source !== 'fallback' && shareCity) Object.assign(info, { city: place.city, country: place.country });
  if (account) info.username = account.username;
  if (room && !isDM(room)) info.room = room;
  if (useAirDrop.getState().discoverable === 'none') info.airdrop = false;
  if (useSystem.getState().showOthersPointers) info.watching = true;
  return info;
}

const currentInfo = (color: string) =>
  infoFor(color, useWindows.getState().place, useAccount.getState().account, useChatState.getState().room);

/**
 * Joins the desktop's presence channel: lists who's here, and from where,
 * for the menu bar, and, for a visitor who has asked to see them, draws
 * other visitors' pointers labelled with their city (see anyoneWatching). Phones are counted but don't send a pointer, since they have none.
 * A member's own other tabs and devices don't show as cursors.
 */
export function Presence() {
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [now, setNow] = useState(() => Date.now());
  const cursorCount = useRef(0);
  cursorCount.current = Object.keys(cursors).length;
  const crowded = useWindows((s) => s.crowded);

  useEffect(() => {
    let channel: Channel | null = null;
    let cancelled = false;
    let last = 0;
    let queued = 0;
    const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

    const send = (x: number, y: number) => {
      const { crowded, visitors } = useWindows.getState();
      if (crowded || (x >= 0 && !anyoneWatching(visitors))) return;
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
      if (e.pointerType === 'mouse' && useSystem.getState().sharePointer) send(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    };
    const onOut = (e: PointerEvent) => !e.relatedTarget && send(-1, -1);
    /** Takes the pointer off others' screens now, skipping the throttle. */
    const withdraw = () => {
      clearTimeout(queued);
      last = performance.now();
      channel?.moveCursor(-1, -1);
    };
    // Switching to another tab (or away from the browser) withdraws the
    // pointer, so it doesn't sit frozen on everyone else's screen, or on
    // this visitor's own other tab. Coming back drops cursors that went
    // quiet while this tab wasn't looking.
    const onVisibility = () => {
      if (document.hidden) return withdraw();
      const cutoff = Date.now() - IDLE_MS;
      setCursors((all) => {
        const kept = Object.entries(all).filter(([, c]) => c.at > cutoff);
        return kept.length === Object.keys(all).length ? all : Object.fromEntries(kept);
      });
    };

    let unsubscribe = () => {};
    getSocial().then((social) => {
      if (!social || cancelled) return;
      channel = social.joinPresence(currentInfo(color), {
        onVisitors: (visitors) => {
          const { crowded, setVisitors, setCrowded } = useWindows.getState();
          setVisitors(visitors);
          const now = isCrowded(visitors.length, crowded);
          if (now === crowded) return;
          setCrowded(now);
          // Take this pointer off everyone's screen, and theirs off this one.
          if (now) {
            withdraw();
            setCursors({});
          }
        },
        onCursor: (id, x, y, c) =>
          setCursors((all) => {
            // Not asked for: not drawn, and not kept (so no re-render either).
            if (useWindows.getState().crowded || !useSystem.getState().showOthersPointers) return all;
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
          }),
        onSignal: deliverSignal
      });
      connectSignals(channel);
      const refresh = () => channel?.update(currentInfo(color));
      const stops = [
        useWindows.subscribe((state, prev) => state.place !== prev.place && refresh()),
        useAccount.subscribe((state, prev) => state.account !== prev.account && refresh()),
        useChatState.subscribe((state, prev) => state.room !== prev.room && refresh()),
        useAirDrop.subscribe((state, prev) => state.discoverable !== prev.discoverable && refresh()),
        useSystem.subscribe((state, prev) => {
          if (state.shareCity !== prev.shareCity || state.showOthersPointers !== prev.showOthersPointers) refresh();
          if (!state.showOthersPointers && prev.showOthersPointers) setCursors({});
          // Take the pointer away from others' screens straight away.
          if (!state.sharePointer && prev.sharePointer) send(-1, -1);
        })
      ];
      unsubscribe = () => stops.forEach((stop) => stop());
      if (!isPhone()) {
        window.addEventListener('pointermove', onMove);
        document.addEventListener('pointerout', onOut);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', withdraw);
      }
    });

    // Re-render now and then so idle cursors fade, and forget stale ones;
    // nothing to do while no one else's pointer is showing.
    const tick = setInterval(() => {
      setCursors((all) => {
        const cutoff = Date.now() - STALE_MS;
        const kept = Object.entries(all).filter(([, c]) => c.at > cutoff);
        return kept.length === Object.keys(all).length ? all : Object.fromEntries(kept);
      });
      setNow((n) => (cursorCount.current ? Date.now() : n));
    }, 1000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(tick);
      clearTimeout(queued);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', withdraw);
      channel?.leave();
      connectSignals(null);
      useWindows.getState().setVisitors(null);
      useWindows.getState().setCrowded(false);
    };
  }, []);

  const visitors = useWindows((s) => s.visitors);
  const showPointers = useSystem((s) => s.showOthersPointers);
  const me = useAccount((s) => s.account?.username);
  /** This member's own other tabs and devices: their pointer is theirs, not someone else's. */
  const mine = (id: string) => !!me && visitors?.some((v) => v.id === id && v.username === me);
  const whereIs = (id: string) => {
    const v = visitors?.find((v) => v.id === id);
    if (!v) return null;
    // Members by name (with their flag), everyone else by city.
    if (v.username) return `${flag(v.country)} ${v.username}`.trim();
    return v.city ? whereFrom(v) : null;
  };

  return (
    <div className="os-cursors" aria-hidden="true">
      {Object.entries(showPointers && !crowded ? cursors : {}).map(([id, c]) => {
        if (mine(id)) return null;
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
