// Presence: who's on the desktop, their pointers, and the signals they
// send one another (typing, nudges, AirDrop). Nothing of it is kept, and
// nothing in it is verified: what arrives is cleaned here. The Supabase
// side is supabase/visitors.ts (a Realtime channel), the stand-in's
// local/visitors.ts (a BroadcastChannel between this browser's tabs).

import { USERNAME } from './accounts';

/**
 * What a visitor tells the others on the desktop: a cursor colour, roughly
 * where they are (city and country, if known), their username if they're
 * signed in, and the chat room they have open. None of it is verified.
 */
export interface VisitorInfo {
  color: string;
  city?: string;
  country?: string;
  username?: string;
  /** The chat room their Chat window shows (public rooms only). */
  room?: string;
  /** False when they've turned AirDrop off. */
  airdrop?: boolean;
  /** True when they've chosen to see other people's pointers: only then are pointers sent. */
  watching?: boolean;
}

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** What another visitor says about themselves, kept to the shapes above. */
export function cleanInfo(raw: unknown, fallbackColor: string): VisitorInfo {
  const info = (raw ?? {}) as Record<string, unknown>;
  const color = text(info.color, 20);
  const username = text(info.username, 20);
  const room = text(info.room, 24);
  return {
    color: color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallbackColor,
    city: text(info.city, 60),
    country: text(info.country, 2),
    username: username && USERNAME.test(username) ? username : undefined,
    room: room && /^[a-z0-9-]+$/.test(room) ? room : undefined,
    airdrop: info.airdrop === false ? false : undefined,
    watching: info.watching === true ? true : undefined
  };
}

/** Colours for visitors' cursors; a pointer in any other is refused. */
export const CURSOR_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#0090ff', '#8e4ec6', '#d6409f'];

/** Another visitor's pointer, as fractions of their viewport; (-1, -1) means it left the page. */
export interface CursorMove {
  id: string;
  x: number;
  y: number;
  color: string;
}

const fraction = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;

/**
 * A pointer someone sent, or null unless it's from someone on the desktop
 * now (`present`), within their viewport or leaving it, in one of our
 * colours. Anyone with the public key can send one.
 */
export function cleanCursor(raw: unknown, present: (id: string) => boolean): CursorMove | null {
  const { id, x, y, color } = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof id !== 'string' || !present(id)) return null;
  if (typeof color !== 'string' || !CURSOR_COLORS.includes(color)) return null;
  const leaving = x === -1 && y === -1;
  if (!leaving && !(fraction(x) && fraction(y))) return null;
  return { id, x: x as number, y: y as number, color };
}

/** Someone on the desktop. */
export interface Visitor extends VisitorInfo {
  id: string;
  /** This browser. */
  self?: boolean;
}

/**
 * A message from one visitor to the others on the desktop, for things that
 * aren't kept: typing, nudges, AirDrop. Anyone can send one, so a receiver
 * checks what's in it before using it.
 */
export interface Signal {
  event: string;
  /** The sender's presence id. */
  from: string;
  payload: Record<string, unknown>;
}

export interface PresenceHandlers {
  /** Everyone on the desktop, this visitor included. */
  onVisitors: (visitors: Visitor[]) => void;
  /** Another visitor's pointer, checked with cleanCursor. */
  onCursor: (cursor: CursorMove) => void;
  onLeave: (id: string) => void;
  onSignal: (signal: Signal) => void;
}

export interface Presence {
  /** This visitor's presence id, as others see it. */
  id: string;
  moveCursor: (x: number, y: number) => void;
  /** Sends a signal to everyone else on the desktop. */
  signal: (event: string, payload: Record<string, unknown>) => void;
  /** Updates what others see about this visitor, e.g. once they're located. */
  update: (info: VisitorInfo) => void;
  leave: () => void;
}

export interface PresenceSocial {
  joinPresence: (info: VisitorInfo, handlers: PresenceHandlers) => Presence;
}
