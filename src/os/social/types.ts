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

/** Someone on the desktop, and roughly where they are (city and country, if known). */
export interface Visitor {
  id: string;
  color: string;
  city?: string;
  country?: string;
  /** This browser. */
  self?: boolean;
}

export type VisitorInfo = Omit<Visitor, 'id' | 'self'>;

interface PresenceHandlers {
  /** Everyone on the desktop, this visitor included. */
  onVisitors: (visitors: Visitor[]) => void;
  /** Another visitor's pointer, as fractions of their viewport; x < 0 means it left the page. */
  onCursor: (id: string, x: number, y: number, color: string) => void;
  onLeave: (id: string) => void;
}

export interface Presence {
  moveCursor: (x: number, y: number) => void;
  /** Updates what others see about this visitor, e.g. once they're located. */
  update: (info: VisitorInfo) => void;
  leave: () => void;
}

// ---------- Soapbox ----------

export const REACTIONS = ['👍', '😂', '🫂', '🔥'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** A Soapbox post: Jincheng's own note or rant, sent from Telegram. */
export interface Post {
  id: string;
  body: string;
  kind: 'note' | 'rant';
  place: string | null;
  weather: string | null;
  created_at: string;
  /** How many of each reaction it has. */
  reactions: Partial<Record<Reaction, number>>;
}

// ---------- Chat ----------

export const CHAT_MAX = 500;

export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
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

  /** Up to 100 chat messages, oldest first: the latest, or those before `before` (a created_at). */
  listChat: (before?: string) => Promise<ChatMessage[]>;
  sendChat: (body: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  /** Live messages and takedowns; returns a function that stops watching. */
  watchChat: (handlers: ChatHandlers) => () => void;
}
