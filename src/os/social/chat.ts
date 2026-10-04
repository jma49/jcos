// Chat: public rooms and private conversations between two members. The
// Supabase side is supabase/chat.ts, the stand-in's local/chat.ts; what's
// unread and the alerts are chatState.ts.

import type { Account } from './accounts';

/** A message's length at most: the table's check (why it's a constant: limits.ts). */
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

export interface ChatSocial {
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
