// What the social features share, whichever backend serves them: Supabase
// in production (supabase.ts) or a stand-in during `astro dev` (local.ts).

// ---------- Accounts ----------

/** A member: someone who signed up with a username and a password. */
export interface Account {
  id: string;
  username: string;
}

/** 3–20 lower-case letters, digits or underscores; the database checks the same. */
export const USERNAME = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 6;

// ---------- Stickies ----------

export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_MAX = 280;
/** Notes a member may put up in any 24 hours. */
export const NOTES_PER_DAY = 3;

export interface Note {
  id: string;
  body: string;
  /** The member's username (older notes: whatever name was typed). */
  name: string;
  color: NoteColor;
  /** Who put it up; null for notes from before accounts. */
  user_id: string | null;
  created_at: string;
}

// ---------- Presence ----------

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
    airdrop: info.airdrop === false ? false : undefined
  };
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

interface PresenceHandlers {
  /** Everyone on the desktop, this visitor included. */
  onVisitors: (visitors: Visitor[]) => void;
  /** Another visitor's pointer, as fractions of their viewport; x < 0 means it left the page. */
  onCursor: (id: string, x: number, y: number, color: string) => void;
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

// ---------- Soapbox ----------

export const REACTIONS = ['👍', '😂', '🫂', '🔥'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** A photo on a Soapbox post, in Supabase Storage. */
export interface PostImage {
  url: string;
  width: number;
  height: number;
}

/** A Soapbox post: Jincheng's own note or rant, sent from Telegram. */
export interface Post {
  id: string;
  body: string;
  kind: 'note' | 'rant';
  place: string | null;
  weather: string | null;
  created_at: string;
  /** Photos sent with it, in the order they were sent; none for most posts. */
  images: PostImage[];
  /** How many of each reaction it has. */
  reactions: Partial<Record<Reaction, number>>;
}

// ---------- Chat ----------

export const CHAT_MAX = 500;

/** A public room, set up by hand in the database. */
export interface ChatRoom {
  id: string;
  name: string;
  topic: string;
}

/** The room everyone starts in, and the only one before rooms existed. */
export const LOBBY: ChatRoom = { id: 'lobby', name: 'Lobby', topic: 'Everyone, about anything' };

/**
 * A private conversation between two members is a room too, named from
 * their two account ids in order: `dm:<id>:<id>`. Only those two can read
 * or write it.
 */
export const dmRoom = (a: string, b: string) => `dm:${[a, b].sort().join(':')}`;

export const isDM = (room: string) => room.startsWith('dm:');

/** The other member in a private conversation. */
export const dmPeer = (room: string, me: string) => room.split(':').slice(1).find((id) => id !== me) ?? me;

export interface ChatMessage {
  id: string;
  room: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
}

/** A room with something in it: when it last had a message. */
export interface ChatActivity {
  room: string;
  last_at: string;
}

export interface ChatHandlers {
  onMessage: (message: ChatMessage) => void;
  onRemove: (id: string) => void;
}

// ---------- Errors ----------

/**
 * Why something was refused, for the interface to explain: `signed-out`
 * (members only), `limit` (three notes a day, too many messages), `already`
 * (one reaction per visitor), `taken` (username), `credentials` (wrong
 * username or password), `invalid` (a bad username, password or note).
 */
export type Refusal = 'signed-out' | 'limit' | 'already' | 'taken' | 'credentials' | 'invalid' | 'failed';

export class SocialError extends Error {
  constructor(
    readonly reason: Refusal,
    message: string
  ) {
    super(message);
  }
}

// ---------- The backend ----------

export interface Social {
  /** The signed-in member, or null. Known once the session has been read. */
  account: () => Account | null;
  /** Calls back with the member whenever someone signs in or out (and once, now). */
  onAccount: (callback: (account: Account | null) => void) => () => void;
  usernameAvailable: (username: string) => Promise<boolean>;
  signUp: (username: string, password: string, recoveryEmail?: string) => Promise<Account>;
  signIn: (username: string, password: string) => Promise<Account>;
  signOut: () => Promise<void>;

  /** The newest visible notes. */
  listNotes: () => Promise<Note[]>;
  /** Puts a note up for the signed-in member (three a day). */
  postNote: (note: Pick<Note, 'body' | 'color'>) => Promise<void>;
  /** Takes down one of the member's own notes. */
  deleteNote: (id: string) => Promise<void>;
  /** How many more notes the member can put up right now. */
  notesLeft: () => Promise<number>;

  joinPresence: (info: VisitorInfo, handlers: PresenceHandlers) => Presence;

  /** The newest Soapbox posts, with their reaction counts. */
  listPosts: () => Promise<Post[]>;
  /** The signed-in member's own reactions, by post. */
  myReactions: () => Promise<Record<string, Reaction>>;
  /**
   * Reacts to a post. Members can change their reaction or take it back
   * (null); anyone else gets one per post and a second is refused.
   */
  react: (postId: string, reaction: Reaction | null) => Promise<void>;

  /** The public rooms, in order. */
  listRooms: () => Promise<ChatRoom[]>;
  /** The latest message's time in each public room and in the member's private conversations. */
  chatActivity: () => Promise<ChatActivity[]>;
  /** A member by username, to start a private conversation with. */
  findMember: (username: string) => Promise<Account | null>;
  /** A member's username by account id. */
  usernameOf: (id: string) => Promise<string>;
  /** Up to 100 messages in a room, oldest first: the latest, or those before `before` (a created_at). */
  listChat: (room: string, before?: string) => Promise<ChatMessage[]>;
  sendChat: (room: string, body: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  /**
   * Live messages in every room this visitor can read, and takedowns;
   * returns a function that stops watching.
   */
  watchChat: (handlers: ChatHandlers) => () => void;
}
