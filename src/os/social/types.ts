import type { Disc, Song } from '../../lib/library';
import type { JobsSocial } from './jobs';
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
export type Refusal = 'signed-out' | 'limit' | 'already' | 'taken' | 'credentials' | 'invalid' | 'expired' | 'conflict' | 'failed';

export class SocialError extends Error {
  constructor(
    readonly reason: Refusal,
    message: string
  ) {
    super(message);
  }
}

// ---------- The backend ----------

/** Everything the site asks of the backend. Job Hunt's part is its own (jobs.ts). */
export interface Social extends JobsSocial {
  /** The signed-in member, or null. Known once the session has been read. */
  account: () => Account | null;
  /** Calls back with the member whenever someone signs in or out (and once, now). */
  onAccount: (callback: (account: Account | null) => void) => () => void;
  usernameAvailable: (username: string) => Promise<boolean>;
  signUp: (username: string, password: string, recoveryEmail?: string) => Promise<Account>;
  signIn: (username: string, password: string) => Promise<Account>;
  signOut: () => Promise<void>;

  /**
   * Emails a link to choose a new password, if the account has a recovery
   * address. Answers the same whether or not it has one.
   */
  requestReset: (username: string) => Promise<void>;
  /** Whose a reset link is, or null once it has expired or been used. */
  checkReset: (token: string) => Promise<string | null>;
  /** Sets a new password with a reset link, then signs in with it. */
  resetPassword: (token: string, password: string) => Promise<Account>;
  /** The signed-in member's recovery address, or null. */
  recoveryEmail: () => Promise<string | null>;
  /** Sets the signed-in member's recovery address, or removes it with null. */
  setRecoveryEmail: (email: string | null) => Promise<void>;
  /**
   * Whether the signed-in member is Jincheng, the owner (false signed out).
   * Only to decide what to show: the database keeps the owner's rooms shut.
   */
  isOwner: () => Promise<boolean>;

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
  /** One song from the library, as the database has it now; null if there's no such song. */
  song: (id: string) => Promise<Song | null>;
  /** What Jincheng is playing for everyone, by the database's clock; null when nothing is. */
  nowPlaying: () => Promise<NowPlaying | null>;
  /**
   * Calls back when Jincheng plays or stops a song, with the song and the
   * time it has left (null when stopped), and `onConnected` each time the
   * watch starts or resumes after the connection dropped (changes made
   * meanwhile aren't sent again); returns a function that stops watching.
   */
  watchNowPlaying: (
    onChange: (now: Pick<NowPlaying, 'songId' | 'remainingMs'> | null) => void,
    onConnected?: () => void
  ) => () => void;

  /** DVD Player's shelf as the database has it now (the library's copy can be a minute old). */
  shelf: () => Promise<Disc[]>;
  /** Burns a disc for everyone, as the shelf keeps it. Only the owner may. */
  burnDisc: (disc: Omit<Disc, 'added'>) => Promise<Disc>;
  /** Changes one of the discs: its name, its case, or its length once known. Only the owner may. */
  relabelDisc: (id: string, change: Partial<Pick<Disc, 'title' | 'artist' | 'cover' | 'coverX' | 'duration'>>) => Promise<void>;
  /** Takes a disc off the shelf. Only the owner may. */
  removeDisc: (id: string) => Promise<void>;
  /**
   * Calls back as discs are burned (`burned`), relabelled or taken off the
   * shelf, from any page or the bot; returns a function that stops watching.
   */
  watchDiscs: (handlers: { onDisc: (disc: Disc, burned: boolean) => void; onRemove: (id: string) => void }) => () => void;

  /** Jincheng's ratings, plays and playlists, as the database has them now. */
  listening: () => Promise<Listening>;
  /** Rates a song one to five stars, or clears its rating with 0. Only the owner may. */
  rateSong: (id: string, rating: number) => Promise<void>;
  /** Counts a play of a song listened to the end. Only the owner's are counted. */
  songPlayed: (id: string) => Promise<void>;
  /**
   * Saves songs into the playlist called `name` (whatever its case),
   * making it if there's none, and returns its id. Only the owner may.
   */
  savePlaylist: (name: string, songs: string[]) => Promise<number>;
  /** Takes a song out of one of the playlists. Only the owner may. */
  unlistSong: (playlist: number, song: string) => Promise<void>;
  /** Deletes one of the playlists. Only the owner may. */
  deletePlaylist: (playlist: number) => Promise<void>;

  /**
   * Jincheng's home folder: the documents anyone may read (those in
   * Public) and, for the owner, the rest and the diary.
   */
  home: (owner: boolean) => Promise<Home>;
  /**
   * Writes one of Jincheng's documents: a new one without an `id`, else a
   * save made from `version`, refused ('conflict') if it has been saved or
   * thrown away since. Only the owner may.
   */
  saveDocument: (doc: DocumentDraft) => Promise<HomeDocument>;
  /** Throws one of Jincheng's documents away. Only the owner may. */
  deleteDocument: (id: string) => Promise<void>;
  /** Writes an entry in Jincheng's diary, as saveDocument does a document. */
  saveEntry: (entry: EntryDraft) => Promise<DiaryEntry>;
  /** Takes an entry out of the diary. */
  deleteEntry: (id: string) => Promise<void>;

  /** The signed-in member's own stickies (nobody else's, the owner's included); none signed out. */
  myStickies: () => Promise<Sticky[]>;
  /** Puts up a sticky of the member's own. */
  addSticky: (sticky: StickyChange) => Promise<Sticky>;
  /**
   * Changes one of the member's stickies. Moving, sizing, colouring or
   * rolling it up is never out of date; a change of its text names the
   * `version` it was typed over, refused ('conflict') if the text was
   * saved elsewhere since or the sticky taken down.
   */
  changeSticky: (id: string, change: StickyChange, version?: number) => Promise<Sticky>;
  /** Takes one of the member's stickies down. */
  removeSticky: (id: string) => Promise<void>;

  /** The signed-in member's own events on the days `from` to `to` (YYYY-MM-DD, both kept); none signed out. */
  myEvents: (from: string, to: string) => Promise<CalendarEvent[]>;
  /** The signed-in member's own to-dos; none signed out. */
  myTodos: () => Promise<Todo[]>;
  /** Adds one of the member's events (no `id`), or changes it; refused ('conflict') if it was deleted elsewhere. */
  saveEvent: (event: EventDraft) => Promise<CalendarEvent>;
  removeEvent: (id: string) => Promise<void>;
  /** Adds one of the member's to-dos (no `id`), or changes it, as saveEvent does an event. */
  saveTodo: (todo: TodoDraft) => Promise<Todo>;
  removeTodo: (id: string) => Promise<void>;
}

/** The calendars iCal keeps events and to-dos in, as Tiger's started with (the database's check). */
export const CALENDARS = ['home', 'work'] as const;
export type CalendarName = (typeof CALENDARS)[number];

/** One of a member's own events, which only they read. */
export interface CalendarEvent {
  id: string;
  /** One line, 200 characters at most. */
  title: string;
  calendar: CalendarName;
  /** The day it's on (YYYY-MM-DD), where the member is. */
  day: string;
  /** When it starts and ends, in minutes after midnight; both null for all day. */
  starts: number | null;
  ends: number | null;
  notes: string;
}

export type EventDraft = Omit<CalendarEvent, 'id'> & { id?: string };

/** One of a member's own to-dos. */
export interface Todo {
  id: string;
  title: string;
  calendar: CalendarName;
  /** 0 none, 1 low, 2 medium, 3 high. */
  priority: number;
  /** The day it's due (YYYY-MM-DD), or null. */
  due: string | null;
  done: boolean;
  /** When it was done (the database's), or null. */
  doneAt: string | null;
  created: string;
}

export type TodoDraft = Pick<Todo, 'title' | 'calendar' | 'priority' | 'due' | 'done'> & { id?: string };

/** How many events and to-dos a member may keep (the database's event_limit and todo_limit). */
export const EVENT_MOST = 5000;
export const TODO_MOST = 1000;

/** A member's own sticky note on their desktop, which only they read. */
export interface Sticky {
  id: string;
  body: string;
  color: NoteColor;
  /** Where it sits on the desktop, in CSS pixels from its top left corner, and its size. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rolled up to its title bar. */
  collapsed: boolean;
  /** Counts saves of its text alone. */
  version: number;
  /** When it last changed (ISO 8601). */
  updated: string;
}

/** What a sticky is put up with, or changed by. */
export type StickyChange = Partial<Pick<Sticky, 'body' | 'color' | 'x' | 'y' | 'width' | 'height' | 'collapsed'>>;

/** How many stickies a member may keep, and how much each holds (the database's sticky_limit and check). */
export const STICKY_MOST = 50;
export const STICKY_MAX = 4000;

/** A folder of Jincheng's home that holds documents (Sites lists Jincheng's sites instead). */
export type HomeFolder = 'desktop' | 'documents' | 'downloads' | 'library' | 'movies' | 'music' | 'pictures' | 'public';

/** One of Jincheng's documents. */
export interface HomeDocument {
  id: string;
  folder: HomeFolder;
  /** With its extension: "Things to remember.txt". */
  name: string;
  body: string;
  /** Counts saves: a save names the version it was made from. */
  version: number;
  /** When it was first saved (ISO 8601): from then on, Time Machine shows it. */
  created: string;
  /** When it was last saved (ISO 8601). */
  updated: string;
}

/** A document as it's saved: `id` and `version` for one that's there. */
export type DocumentDraft = Pick<HomeDocument, 'folder' | 'name' | 'body'> & { id?: string; version?: number };

/** An entry in Jincheng's diary. */
export interface DiaryEntry {
  id: string;
  /** The day it's about (YYYY-MM-DD), in the writer's own time zone. */
  day: string;
  body: string;
  version: number;
  /** When it was written (ISO 8601), which orders a day's entries. */
  created: string;
  updated: string;
}

export type EntryDraft = Pick<DiaryEntry, 'day' | 'body'> & { id?: string; version?: number };

/** Jincheng's home folder, as far as the reader may see it. */
export interface Home {
  documents: HomeDocument[];
  /** Empty for anyone but the owner. */
  diary: DiaryEntry[];
}

/** Jincheng's rating and plays of a song. */
export interface SongStats {
  /** One to five stars; missing until rated. */
  rating?: number;
  /** How many times Jincheng has listened to it to the end, on the site. */
  plays: number;
  /** When Jincheng last did (ISO 8601). */
  played?: string;
}

/** One of Jincheng's own playlists: its songs' YouTube ids, in order. */
export interface Playlist {
  id: number;
  name: string;
  songs: string[];
}

/** What the iPod shows everyone of Jincheng's listening. */
export interface Listening {
  /** By song id; a song never rated or played isn't in it. */
  stats: Record<string, SongStats>;
  /** In the order they were made. */
  playlists: Playlist[];
}

/** A song Jincheng is playing for everyone on the desktop (/play in Telegram). */
export interface NowPlaying {
  /** The song's YouTube id. */
  songId: string;
  /** How far in it is, and how long it has left, in ms, by the database's clock. */
  elapsedMs: number;
  remainingMs: number;
}
