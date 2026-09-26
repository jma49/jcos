// A stand-in for the Supabase backend during `astro dev`, so accounts,
// Stickies, reactions, chat and presence can be tried without a project.
// Everything lives in this browser's localStorage, and chat and presence go
// between its tabs over BroadcastChannels. It keeps the same rules as the
// database (three notes a day, one reaction per visitor unless signed in),
// but it's not secure in any way: passwords are stored as typed.

import { loadJSON, saveJSON } from '../core/storage';
import {
  CHAT_MAX,
  LOBBY,
  cleanInfo,
  dmPeer,
  isDM,
  NOTES_PER_DAY,
  PASSWORD_MIN,
  SocialError,
  USERNAME,
  type Account,
  type ChatHandlers,
  type ChatMessage,
  type ChatRoom,
  type Note,
  type Post,
  type Reaction,
  type Social,
  type VisitorInfo
} from './types';

const NOTES_KEY = 'os-dev-notes';
const REACTIONS_KEY = 'os-dev-reactions';
const USERS_KEY = 'os-dev-users';
const SESSION_KEY = 'os-dev-session';
const CHAT_KEY = 'os-dev-chat';

/** Stand-in Soapbox posts; the real ones come from the Telegram bot. */
const SAMPLE_POSTS: Omit<Post, 'reactions'>[] = [
  {
    id: 'sample-4',
    body: 'Tahoe this weekend. The lake does the blue thing on purpose.',
    kind: 'note',
    place: 'South Lake Tahoe',
    weather: '☀️ 64°F',
    created_at: '2026-09-25T20:30:00Z',
    // Stand-ins from the desktop pictures; real ones come from the bot.
    images: [
      { url: '/os/wallpapers/photos/landscapes/mono_lake.webp', width: 2560, height: 1600 },
      { url: '/os/wallpapers/photos/landscapes/french_alps.webp', width: 2560, height: 1600 }
    ]
  },
  {
    id: 'sample-3',
    body: 'Sent a V6 today after three weeks on it. The trick was trusting the left heel hook.',
    kind: 'note',
    place: 'San Jose',
    weather: '☀️ 74°F',
    created_at: '2026-09-24T02:10:00Z',
    images: []
  },
  {
    id: 'sample-2',
    body: 'Flaky test of the week: passes locally, fails in CI, and only on Tuesdays. Time zones. It is always time zones.',
    kind: 'rant',
    place: 'San Jose',
    weather: '⛅ 68°F',
    created_at: '2026-09-22T18:40:00Z',
    images: []
  },
  {
    id: 'sample-1',
    body: 'Rebuilt my portfolio as a fake Mac OS X desktop. No regrets.\nOkay, a few regrets about CSS gradients.',
    kind: 'note',
    place: 'San Jose',
    weather: '🌫️ 61°F',
    created_at: '2026-09-20T05:15:00Z',
    images: []
  }
];
/** The rooms a real project seeds (supabase/schema.sql). */
const ROOMS: ChatRoom[] = [
  LOBBY,
  { id: 'music', name: 'Music', topic: 'What’s on your iPod' },
  { id: 'dev', name: 'Dev', topic: 'Code, tools and testing' },
  { id: 'photography', name: 'Photography', topic: 'Pictures and places' }
];

const HEARTBEAT = 2000;
const EXPIRE = 5000;

interface StoredUser extends Account {
  password: string;
}

/** Reactions by post, then by who: an account id, or 'browser' for someone signed out. */
type StoredReactions = Record<string, Record<string, Reaction>>;

export function localSocial(): Social {
  const users = () => loadJSON<StoredUser[]>(USERS_KEY, []);
  let current = loadJSON<Account | null>(SESSION_KEY, null);
  const listeners = new Set<(account: Account | null) => void>();
  const become = (account: Account | null) => {
    current = account;
    saveJSON(SESSION_KEY, account);
    listeners.forEach((l) => l(account));
  };
  const member = () => {
    if (!current) throw new SocialError('signed-out', 'Sign in first.');
    return current;
  };

  const notes = () => loadJSON<Note[]>(NOTES_KEY, []);
  /** Every message this browser has, including private ones; messages from before rooms are the Lobby's. */
  const everyMessage = () => loadJSON<ChatMessage[]>(CHAT_KEY, []).map((m) => ({ ...m, room: m.room ?? LOBBY.id }));
  /** What the database would let this visitor read. */
  const readable = (m: ChatMessage) => !isDM(m.room) || (current !== null && m.room.split(':').includes(current.id));
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
    account: () => current,

    onAccount(callback) {
      listeners.add(callback);
      callback(current);
      return () => listeners.delete(callback);
    },

    async usernameAvailable(username) {
      const name = username.toLowerCase();
      return USERNAME.test(name) && !users().some((u) => u.username === name);
    },

    async signUp(username, password) {
      const name = username.trim().toLowerCase();
      if (!USERNAME.test(name)) throw new SocialError('invalid', 'A username is 3 to 20 letters, digits or underscores.');
      if (password.length < PASSWORD_MIN) throw new SocialError('invalid', `A password needs at least ${PASSWORD_MIN} characters.`);
      if (!(await this.usernameAvailable(name))) throw new SocialError('taken', 'That username is taken.');
      const user = { id: crypto.randomUUID(), username: name, password };
      saveJSON(USERS_KEY, [...users(), user]);
      become({ id: user.id, username: name });
      return current!;
    },

    async signIn(username, password) {
      const user = users().find((u) => u.username === username.trim().toLowerCase() && u.password === password);
      if (!user) throw new SocialError('credentials', 'That username and password don’t match.');
      become({ id: user.id, username: user.username });
      return current!;
    },

    async signOut() {
      become(null);
    },

    async listNotes() {
      return notes().sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async postNote(note) {
      const me = member();
      if ((await this.notesLeft()) <= 0) throw new SocialError('limit', 'That’s three notes today. Come back tomorrow.');
      saveJSON(NOTES_KEY, [...notes(), { ...note, id: crypto.randomUUID(), name: me.username, user_id: me.id, created_at: new Date().toISOString() }]);
    },

    async deleteNote(id) {
      const me = member();
      saveJSON(
        NOTES_KEY,
        notes().filter((n) => n.id !== id || n.user_id !== me.id)
      );
    },

    async notesLeft() {
      if (!current) return 0;
      const day = Date.now() - 86_400_000;
      const today = notes().filter((n) => n.user_id === current!.id && Date.parse(n.created_at) > day).length;
      return Math.max(0, NOTES_PER_DAY - today);
    },

    async listPosts() {
      const all = loadJSON<StoredReactions>(REACTIONS_KEY, {});
      return SAMPLE_POSTS.map((p) => {
        const reactions: Post['reactions'] = {};
        for (const r of Object.values(all[p.id] ?? {})) reactions[r] = (reactions[r] ?? 0) + 1;
        return { ...p, reactions };
      });
    },

    async myReactions() {
      if (!current) return {};
      const all = loadJSON<StoredReactions>(REACTIONS_KEY, {});
      return Object.fromEntries(Object.entries(all).flatMap(([post, by]) => (by[current!.id] ? [[post, by[current!.id]]] : [])));
    },

    async react(postId, reaction) {
      const all = loadJSON<StoredReactions>(REACTIONS_KEY, {});
      const who = current?.id ?? 'browser';
      const by = { ...(all[postId] ?? {}) };
      if (!current && by[who]) throw new SocialError('already', 'Someone on your network already reacted to this one.');
      if (reaction === null) delete by[member().id];
      else by[who] = reaction;
      saveJSON(REACTIONS_KEY, { ...all, [postId]: by });
    },

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
    },

    joinPresence(info, { onVisitors, onCursor, onLeave, onSignal }) {
      const id = crypto.randomUUID();
      const channel = new BroadcastChannel('os-dev-presence');
      const peers = new Map<string, { seen: number; info: VisitorInfo }>();
      let me = info;
      const report = () =>
        onVisitors([{ id, ...me, self: true }, ...[...peers].map(([peer, { info }]) => ({ id: peer, ...info }))]);

      channel.onmessage = ({ data }) => {
        if (data.type === 'signal') return onSignal({ event: data.event, from: data.id, payload: data.payload ?? {} });
        if (data.type === 'bye') {
          peers.delete(data.id);
          onLeave(data.id);
        } else {
          peers.set(data.id, { seen: Date.now(), info: cleanInfo(data.info ?? peers.get(data.id)?.info ?? { color: data.color }, data.color) });
          if (data.type === 'cursor') onCursor(data.id, data.x, data.y, data.color);
        }
        report();
      };

      const hello = () => channel.postMessage({ type: 'hello', id, info: me });
      const beat = setInterval(() => {
        hello();
        for (const [peer, { seen }] of peers) {
          if (Date.now() - seen > EXPIRE) {
            peers.delete(peer);
            onLeave(peer);
          }
        }
        report();
      }, HEARTBEAT);
      hello();
      report();

      return {
        id,
        moveCursor: (x, y) => channel.postMessage({ type: 'cursor', id, x, y, color: me.color }),
        signal: (event, payload) => channel.postMessage({ type: 'signal', id, event, payload }),
        update: (next) => {
          me = next;
          hello();
          report();
        },
        leave: () => {
          clearInterval(beat);
          channel.postMessage({ type: 'bye', id });
          channel.close();
        }
      };
    }
  };
}
