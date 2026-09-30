// A stand-in for the Supabase backend during `astro dev`, so accounts,
// Stickies, reactions, chat, presence, DVD Player's shelf and the iPod's
// ratings and playlists can be tried without a project.
// Everything lives in this browser's localStorage, and chat and presence go
// between its tabs over BroadcastChannels. It keeps the same rules as the
// database (three notes a day, one reaction per visitor unless signed in),
// but it's not secure in any way: passwords are stored as typed.

import type { Disc } from '../../lib/library';
import { loadJSON, saveJSON } from '../core/storage';
import { playlistNameProblem } from './playlistNames';
import { localJobs } from './jobs';
import {
  CHAT_MAX,
  LOBBY,
  cleanInfo,
  dmPeer,
  isDM,
  CALENDARS,
  EVENT_MOST,
  NOTE_COLORS,
  NOTES_PER_DAY,
  PASSWORD_MIN,
  SocialError,
  STICKY_MAX,
  STICKY_MOST,
  TODO_MOST,
  USERNAME,
  type Account,
  type ChatHandlers,
  type ChatMessage,
  type ChatRoom,
  type DiaryEntry,
  type Home,
  type HomeDocument,
  type Listening,
  type Note,
  type Post,
  type Reaction,
  type Social,
  type Sticky,
  type StickyChange,
  type CalendarEvent,
  type Todo,
  type VisitorInfo
} from './types';

const NOTES_KEY = 'os-dev-notes';
/** Every member's own stickies, by account id. */
const STICKIES_KEY = 'os-dev-stickies';
/** Every member's own calendar, by account id. */
const CALENDAR_KEY = 'os-dev-calendar';
const REACTIONS_KEY = 'os-dev-reactions';
const USERS_KEY = 'os-dev-users';
const SESSION_KEY = 'os-dev-session';
const CHAT_KEY = 'os-dev-chat';
const RESETS_KEY = 'os-dev-resets';
const DISCS_KEY = 'os-dev-discs';
const LISTENING_KEY = 'os-dev-listening';
const HOME_KEY = 'os-dev-home';
/** The member the stand-in treats as the owner: sign up as this to see the owner's rooms. */
const DEV_OWNER = 'jincheng';
/** The stand-in's shelf changes, told to this browser's other tabs as Realtime tells other visitors. */
const discChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('os-dev-discs');
type DiscChange = { type: 'disc'; disc: Disc; burned: boolean } | { type: 'remove'; id: string };

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
  recovery?: string;
}

/** A password reset link; the stand-in "emails" it to the console. */
interface StoredReset {
  token: string;
  username: string;
  expires: number;
  used?: boolean;
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
  /** The owner, or a refusal as the database's row-level security would give. */
  const owner = (what: string) => {
    if (member().username !== DEV_OWNER) throw new SocialError('failed', `Only Jincheng can change ${what}.`);
  };

  const listening = () => loadJSON<Listening>(LISTENING_KEY, { stats: {}, playlists: [] });

  const home = () => loadJSON<Home>(HOME_KEY, { documents: [], diary: [] });
  /** Changes the stored home folder from what's stored now; a refusal thrown by `change` stores nothing. */
  const changeHome = <T,>(change: (h: Home) => T): T => {
    const h = home();
    const result = change(h);
    saveJSON(HOME_KEY, h);
    return result;
  };
  const changedElsewhere = () => new SocialError('conflict', 'It was changed or thrown away somewhere else since this copy was opened.');

  /** Changes the member's stored stickies from what's stored now; a refusal thrown by `change` stores nothing. */
  const changeStickies = <T,>(change: (mine: Sticky[]) => T): T => {
    const all = loadJSON<Record<string, Sticky[]>>(STICKIES_KEY, {});
    const mine = all[member().id] ?? [];
    const result = change(mine);
    saveJSON(STICKIES_KEY, { ...all, [member().id]: mine });
    return result;
  };
  /** Changes the member's stored calendar from what's stored now; a refusal thrown by `change` stores nothing. */
  const changeCalendar = <T,>(change: (mine: { events: CalendarEvent[]; todos: Todo[] }) => T): T => {
    const all = loadJSON<Record<string, { events: CalendarEvent[]; todos: Todo[] }>>(CALENDAR_KEY, {});
    const mine = all[member().id] ?? { events: [], todos: [] };
    const result = change(mine);
    saveJSON(CALENDAR_KEY, { ...all, [member().id]: mine });
    return result;
  };
  const calendarOf = () => (current ? (loadJSON<Record<string, { events: CalendarEvent[]; todos: Todo[] }>>(CALENDAR_KEY, {})[current.id] ?? { events: [], todos: [] }) : null);
  /** The database's checks on an event's or a to-do's title and calendar, and an event's times. */
  const checkEntry = (e: { title: string; calendar: string; starts?: number | null; ends?: number | null; priority?: number }) => {
    const titled = e.title.length >= 1 && e.title.length <= 200 && e.title === e.title.trim() && !/[\u0000-\u001f\u007f]/.test(e.title);
    const timed =
      (e.starts == null && e.ends == null) ||
      (e.starts != null && e.ends != null && e.starts >= 0 && e.starts <= 1439 && e.ends >= 1 && e.ends <= 1440 && e.ends > e.starts);
    const ranked = e.priority === undefined || (Number.isInteger(e.priority) && e.priority >= 0 && e.priority <= 3);
    if (!titled || !timed || !ranked || !(CALENDARS as readonly string[]).includes(e.calendar)) {
      throw new SocialError('invalid', 'A title is one line of 200 characters at most, and an event ends after it starts.');
    }
  };

  /** The database's checks on a sticky. */
  const checkSticky = (s: StickyChange) => {
    const size = (n: number | undefined, least: number, most: number) => n === undefined || (Number.isInteger(n) && n >= least && n <= most);
    const ok =
      (s.body === undefined || s.body.length <= STICKY_MAX) &&
      (s.color === undefined || NOTE_COLORS.includes(s.color)) &&
      size(s.x, 0, 10000) &&
      size(s.y, 0, 10000) &&
      size(s.width, 120, 900) &&
      size(s.height, 60, 900);
    if (!ok) throw new SocialError('invalid', 'A sticky holds 4,000 characters at most, in one of its six colours.');
  };
  /** Changes the stored listening from what's stored now, as another tab may have changed it. */
  const changeListening = (change: (l: Listening) => void) => {
    const l = listening();
    change(l);
    saveJSON(LISTENING_KEY, l);
  };

  const resets = () => loadJSON<StoredReset[]>(RESETS_KEY, []);
  const liveReset = (token: string) => resets().find((r) => r.token === token && !r.used && r.expires > Date.now());

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
    ...localJobs(owner),

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

    async signUp(username, password, recoveryEmail) {
      const name = username.trim().toLowerCase();
      if (!USERNAME.test(name)) throw new SocialError('invalid', 'A username is 3 to 20 letters, digits or underscores.');
      if (password.length < PASSWORD_MIN) throw new SocialError('invalid', `A password needs at least ${PASSWORD_MIN} characters.`);
      if (!(await this.usernameAvailable(name))) throw new SocialError('taken', 'That username is taken.');
      const user: StoredUser = { id: crypto.randomUUID(), username: name, password, recovery: recoveryEmail?.trim() || undefined };
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

    async requestReset(username) {
      const user = users().find((u) => u.username === username.trim().toLowerCase());
      if (!user?.recovery) return;
      const token = crypto.randomUUID().replace(/-/g, '').padEnd(43, 'x');
      saveJSON(RESETS_KEY, [...resets(), { token, username: user.username, expires: Date.now() + 30 * 60_000 }]);
      console.info(`[social] A reset link for ${user.username}, "sent" to ${user.recovery}: ${location.origin}/?open=account&reset=${token}`);
    },

    async checkReset(token) {
      return liveReset(token)?.username ?? null;
    },

    async resetPassword(token, password) {
      if (password.length < PASSWORD_MIN) throw new SocialError('invalid', `A password needs at least ${PASSWORD_MIN} characters.`);
      const link = liveReset(token);
      if (!link) throw new SocialError('expired', 'This link has expired or has already been used. Ask for a new one.');
      saveJSON(RESETS_KEY, resets().map((r) => (r.username === link.username ? { ...r, used: true } : r)));
      saveJSON(USERS_KEY, users().map((u) => (u.username === link.username ? { ...u, password } : u)));
      return this.signIn(link.username, password);
    },

    async recoveryEmail() {
      const me = member();
      return users().find((u) => u.id === me.id)?.recovery ?? null;
    },

    async setRecoveryEmail(email) {
      const me = member();
      const address = email?.trim() || undefined;
      if (address && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new SocialError('invalid', 'That doesn’t look like an email address.');
      saveJSON(USERS_KEY, users().map((u) => (u.id === me.id ? { ...u, recovery: address } : u)));
    },

    async isOwner() {
      return current?.username === DEV_OWNER;
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

    // The snapshot is all the library there is here.
    async song() {
      return null;
    },
    // Only the bot plays songs for everyone, and there's no bot here.
    async nowPlaying() {
      return null;
    },
    watchNowPlaying() {
      return () => {};
    },

    // The shelf, in this browser; the member named DEV_OWNER is the owner.
    async shelf() {
      return loadJSON<Disc[]>(DISCS_KEY, []);
    },
    async burnDisc(disc) {
      if (member().username !== DEV_OWNER) throw new SocialError('failed', 'Only Jincheng can change the discs everyone sees.');
      const shelf = loadJSON<Disc[]>(DISCS_KEY, []);
      if (shelf.some((d) => d.id === disc.id)) throw new SocialError('already', 'That video is already on the shelf.');
      const burned: Disc = { ...disc, added: new Date().toISOString() };
      saveJSON(DISCS_KEY, [...shelf, burned]);
      discChannel?.postMessage({ type: 'disc', disc: burned, burned: true } satisfies DiscChange);
      return burned;
    },
    async relabelDisc(id, change) {
      if (member().username !== DEV_OWNER) throw new SocialError('failed', 'Only Jincheng can change the discs everyone sees.');
      const shelf = loadJSON<Disc[]>(DISCS_KEY, []).map((d) => (d.id === id ? { ...d, ...change } : d));
      saveJSON(DISCS_KEY, shelf);
      const disc = shelf.find((d) => d.id === id);
      if (disc) discChannel?.postMessage({ type: 'disc', disc, burned: false } satisfies DiscChange);
    },
    async removeDisc(id) {
      if (member().username !== DEV_OWNER) throw new SocialError('failed', 'Only Jincheng can change the discs everyone sees.');
      saveJSON(DISCS_KEY, loadJSON<Disc[]>(DISCS_KEY, []).filter((d) => d.id !== id));
      discChannel?.postMessage({ type: 'remove', id } satisfies DiscChange);
    },
    watchDiscs({ onDisc, onRemove }) {
      if (!discChannel) return () => {};
      const listener = ({ data }: MessageEvent<DiscChange>) => (data.type === 'disc' ? onDisc(data.disc, data.burned) : onRemove(data.id));
      discChannel.addEventListener('message', listener);
      return () => discChannel.removeEventListener('message', listener);
    },

    // Jincheng's ratings, plays and playlists, in this browser; the member
    // named DEV_OWNER is the owner, as for the shelf.
    async listening() {
      return listening();
    },
    async rateSong(id, rating) {
      owner('the ratings everyone sees');
      if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new SocialError('failed', 'A rating is one to five stars.');
      changeListening((l) => {
        const { rating: _, ...rest } = l.stats[id] ?? { plays: 0 };
        l.stats[id] = rating ? { ...rest, rating } : rest;
      });
    },
    async songPlayed(id) {
      owner('the play counts everyone sees');
      changeListening((l) => {
        const was = l.stats[id] ?? { plays: 0 };
        l.stats[id] = { ...was, plays: was.plays + 1, played: new Date().toISOString() };
      });
    },
    async savePlaylist(name, songs) {
      owner('the playlists everyone sees');
      const problem = playlistNameProblem(name);
      if (problem) throw new SocialError('invalid', problem);
      let id = 0;
      changeListening((l) => {
        const named = l.playlists.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
        const list = named ?? { id: Math.max(0, ...l.playlists.map((p) => p.id)) + 1, name: name.trim(), songs: [] };
        list.songs = [...new Set([...list.songs, ...songs])];
        if (!named) l.playlists.push(list);
        id = list.id;
      });
      return id;
    },
    async unlistSong(playlist, song) {
      owner('the playlists everyone sees');
      changeListening((l) => {
        const list = l.playlists.find((p) => p.id === playlist);
        if (list) list.songs = list.songs.filter((s) => s !== song);
      });
    },
    async deletePlaylist(playlist) {
      owner('the playlists everyone sees');
      changeListening((l) => {
        l.playlists = l.playlists.filter((p) => p.id !== playlist);
      });
    },

    // Jincheng's home folder, in this browser, with the database's rules:
    // Public for anyone, the rest and the diary for DEV_OWNER only.
    async home(asOwner) {
      const h = home();
      const mine = asOwner && current?.username === DEV_OWNER;
      // Documents kept before they had a date of their own count from their last save.
      const documents = h.documents.map((d) => ({ ...d, created: d.created ?? d.updated }));
      return { documents: documents.filter((d) => mine || d.folder === 'public'), diary: mine ? h.diary : [] };
    },
    async saveDocument({ id, version, folder, name, body }) {
      owner('Jincheng’s documents');
      const badName = name !== name.trim() || !name || name.length > 80 || /[\u0000-\u001f\u007f/:]/.test(name) || name.startsWith('.');
      if (badName || body.length > 100_000) {
        throw new SocialError('invalid', 'A name is one line, without “/” or “:”, and a document holds 100,000 characters at most.');
      }
      return changeHome((h) => {
        if (h.documents.some((d) => d.id !== id && d.folder === folder && d.name.toLowerCase() === name.toLowerCase())) {
          throw new SocialError('already', `There’s already a document called “${name}” in that folder.`);
        }
        const updated = new Date().toISOString();
        if (!id) {
          const made: HomeDocument = { id: crypto.randomUUID(), folder, name, body, version: 1, created: updated, updated };
          h.documents.push(made);
          return made;
        }
        const at = h.documents.findIndex((d) => d.id === id && d.version === version);
        if (at < 0) throw changedElsewhere();
        const saved = { ...h.documents[at], folder, name, body, version: h.documents[at].version + 1, updated };
        h.documents[at] = saved;
        return saved;
      });
    },
    async deleteDocument(id) {
      owner('Jincheng’s documents');
      changeHome((h) => {
        h.documents = h.documents.filter((d) => d.id !== id);
      });
    },
    async saveEntry({ id, version, day, body }) {
      owner('Jincheng’s diary');
      if (!body.trim() || body.length > 20_000) throw new SocialError('invalid', 'A diary entry says something, in 20,000 characters at most.');
      return changeHome((h) => {
        const now = new Date().toISOString();
        if (!id) {
          const made: DiaryEntry = { id: crypto.randomUUID(), day, body, version: 1, created: now, updated: now };
          h.diary.push(made);
          return made;
        }
        const at = h.diary.findIndex((e) => e.id === id && e.version === version);
        if (at < 0) throw changedElsewhere();
        const saved = { ...h.diary[at], day, body, version: h.diary[at].version + 1, updated: now };
        h.diary[at] = saved;
        return saved;
      });
    },
    async deleteEntry(id) {
      owner('Jincheng’s diary');
      changeHome((h) => {
        h.diary = h.diary.filter((e) => e.id !== id);
      });
    },

    // A member's own stickies, in this browser, each account's apart, with the database's rules.
    async myStickies() {
      if (!current) return [];
      return loadJSON<Record<string, Sticky[]>>(STICKIES_KEY, {})[current.id] ?? [];
    },
    async addSticky(sticky) {
      checkSticky(sticky);
      return changeStickies((mine) => {
        if (mine.length >= STICKY_MOST) throw new SocialError('limit', `You have ${STICKY_MOST} stickies already. Close one first.`);
        const made: Sticky = {
          id: crypto.randomUUID(),
          body: '',
          color: 'yellow',
          x: 60,
          y: 60,
          width: 220,
          height: 180,
          collapsed: false,
          ...sticky,
          version: 1,
          updated: new Date().toISOString()
        };
        mine.push(made);
        return made;
      });
    },
    async changeSticky(id, change, version) {
      checkSticky(change);
      return changeStickies((mine) => {
        const at = mine.findIndex((s) => s.id === id && (change.body === undefined || version === undefined || s.version === version));
        if (at < 0) throw changedElsewhere();
        const was = mine[at];
        const text = change.body !== undefined && change.body !== was.body;
        mine[at] = { ...was, ...change, version: text ? was.version + 1 : was.version, updated: new Date().toISOString() };
        return mine[at];
      });
    },
    async removeSticky(id) {
      changeStickies((mine) => {
        const at = mine.findIndex((s) => s.id === id);
        if (at >= 0) mine.splice(at, 1);
      });
    },

    // A member's own calendar, in this browser, each account's apart, with the database's rules.
    async myEvents(from, to) {
      return (calendarOf()?.events ?? []).filter((e) => e.day >= from && e.day <= to);
    },
    async myTodos() {
      return calendarOf()?.todos ?? [];
    },
    async saveEvent({ id, ...fields }) {
      checkEntry(fields);
      return changeCalendar((mine) => {
        if (!id) {
          if (mine.events.length >= EVENT_MOST) throw new SocialError('limit', `Your calendar holds ${EVENT_MOST} events already. Delete some first.`);
          const made: CalendarEvent = { id: crypto.randomUUID(), ...fields };
          mine.events.push(made);
          return made;
        }
        const at = mine.events.findIndex((e) => e.id === id);
        if (at < 0) throw changedElsewhere();
        mine.events[at] = { ...mine.events[at], ...fields };
        return mine.events[at];
      });
    },
    async removeEvent(id) {
      changeCalendar((mine) => {
        mine.events = mine.events.filter((e) => e.id !== id);
      });
    },
    async saveTodo({ id, ...fields }) {
      checkEntry(fields);
      return changeCalendar((mine) => {
        const now = new Date().toISOString();
        if (!id) {
          if (mine.todos.length >= TODO_MOST) throw new SocialError('limit', `You have ${TODO_MOST} to-dos already. Delete some you’ve done first.`);
          const made: Todo = { id: crypto.randomUUID(), ...fields, doneAt: fields.done ? now : null, created: now };
          mine.todos.push(made);
          return made;
        }
        const at = mine.todos.findIndex((t) => t.id === id);
        if (at < 0) throw changedElsewhere();
        const was = mine.todos[at];
        mine.todos[at] = { ...was, ...fields, doneAt: !fields.done ? null : was.done ? was.doneAt : now };
        return mine.todos[at];
      });
    },
    async removeTodo(id) {
      changeCalendar((mine) => {
        mine.todos = mine.todos.filter((t) => t.id !== id);
      });
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
