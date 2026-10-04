// Chat in this browser: the rooms a real project seeds, private
// conversations only their two members read, and new messages told to
// this browser's other tabs over a BroadcastChannel.

import { loadJSON, saveJSON } from '../../core/storage';
import { CHAT_MAX, dmPeer, isDM, LOBBY, type ChatHandlers, type ChatMessage, type ChatRoom, type ChatSocial } from '../chat';
import { SocialError } from '../errors';
import type { LocalContext } from './context';

const CHAT_KEY = 'os-dev-chat';

/** The rooms a real project seeds (supabase/migrations/20260926071227_chat_rooms.sql). */
const ROOMS: ChatRoom[] = [
  LOBBY,
  { id: 'music', name: 'Music', topic: 'What’s on your iPod' },
  { id: 'dev', name: 'Dev', topic: 'Code, tools and testing' },
  { id: 'photography', name: 'Photography', topic: 'Pictures and places' }
];

export function localChat({ account, member, users }: LocalContext): ChatSocial {
  /** Every message this browser has, including private ones; messages from before rooms are the Lobby's. */
  const everyMessage = () => loadJSON<ChatMessage[]>(CHAT_KEY, []).map((m) => ({ ...m, room: m.room ?? LOBBY.id }));
  /** What the database would let this visitor read. */
  const readable = (m: ChatMessage) => {
    const current = account();
    return !isDM(m.room) || (current !== null && m.room.split(':').includes(current.id));
  };
  const chat = () => everyMessage().filter(readable);
  const chatChannel = new BroadcastChannel('os-dev-chat');
  const chatWatchers = new Set<ChatHandlers>();
  chatChannel.onmessage = ({ data }) => {
    for (const w of chatWatchers) {
      if (data.type === 'message') readable(data.message) && w.onMessage(data.message);
      else w.onRemove(data.id);
    }
  };
  /** Tells this tab's watchers and every other tab's. */
  const announce = (data: { type: 'message'; message: ChatMessage } | { type: 'remove'; id: string }) => {
    chatChannel.postMessage(data);
    chatChannel.onmessage?.({ data } as MessageEvent);
  };

  return {
    async listRooms() {
      return ROOMS;
    },

    async chatActivity() {
      const last = new Map<string, string>();
      for (const m of chat()) if (m.created_at > (last.get(m.room) ?? '')) last.set(m.room, m.created_at);
      return [...last].map(([room, last_at]) => ({ room, last_at }));
    },

    async findMember(username) {
      const user = users().find((u) => u.username === username.trim().toLowerCase());
      return user ? { id: user.id, username: user.username } : null;
    },

    async usernameOf(id) {
      return users().find((u) => u.id === id)?.username ?? 'someone';
    },

    async listChat(room, before) {
      const all = chat().filter((m) => m.room === room && (!before || m.created_at < before));
      return all.slice(-100);
    },

    async sendChat(room, body) {
      const me = member();
      const text = body.trim().slice(0, CHAT_MAX);
      if (!text) throw new SocialError('invalid', 'Say something first.');
      const open = isDM(room) ? room.split(':').includes(me.id) && users().some((u) => u.id === dmPeer(room, me.id)) : ROOMS.some((r) => r.id === room);
      if (!open) throw new SocialError('invalid', 'You can’t write to that conversation.');
      const message: ChatMessage = { id: crypto.randomUUID(), room, user_id: me.id, username: me.username, body: text, created_at: new Date().toISOString() };
      saveJSON(CHAT_KEY, [...everyMessage(), message]);
      announce({ type: 'message', message });
    },

    async deleteChat(id) {
      const me = member();
      saveJSON(
        CHAT_KEY,
        everyMessage().filter((m) => m.id !== id || m.user_id !== me.id)
      );
      announce({ type: 'remove', id });
    },

    watchChat(handlers) {
      chatWatchers.add(handlers);
      return () => chatWatchers.delete(handlers);
    }
  };
}
