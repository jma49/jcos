// The social features on Supabase (supabase/schema.sql): accounts through
// Supabase Auth, notes, reactions and chat in Postgres behind row-level
// security, presence and live chat through Realtime.

import { createClient, type PostgrestError, type User } from '@supabase/supabase-js';
import { CURSOR_COLORS } from './social';
import {
  LOBBY,
  NOTES_PER_DAY,
  cleanInfo,
  isDM,
  PASSWORD_MIN,
  SocialError,
  USERNAME,
  type Account,
  type ChatHandlers,
  type ChatMessage,
  type ChatRoom,
  type Note,
  type Post,
  type PostImage,
  type Reaction,
  type Social,
  type VisitorInfo
} from './types';

/**
 * Supabase Auth wants an email address; an account is a username, so it
 * gets one made from it. The database only accepts accounts made this way.
 */
const addressOf = (username: string) => `${username}@users.majincheng.com`;

const accountOf = (user: User | null | undefined): Account | null =>
  user ? { id: user.id, username: String(user.user_metadata?.username ?? user.email?.split('@')[0] ?? '') } : null;

/** Turns a database refusal into one the interface can explain. */
function refusal(error: PostgrestError): SocialError {
  if (error.code === 'P0429') return new SocialError('limit', error.message);
  if (error.code === '42501') return new SocialError('signed-out', 'Sign in first.');
  if (error.code === '23505') return new SocialError('already', 'You’ve already done that.');
  return new SocialError('failed', error.message);
}

const since = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export function supabaseSocial(url: string, key: string): Social {
  const client = createClient(url, key, {
    // The session stays in this browser, so members stay signed in.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'os-auth' }
  });

  /** Calls the account-recovery Edge Function (supabase/functions/account-recovery). */
  const recovery = async (body: Record<string, string>) => {
    const { data, error } = await client.functions.invoke('account-recovery', { body });
    if (!error) return data as Record<string, unknown>;
    const response = (error as { context?: unknown }).context;
    const answer = response instanceof Response ? await response.json().catch(() => null) : null;
    const message = typeof answer?.error === 'string' ? answer.error : 'Couldn’t reach the server. Try again in a moment.';
    throw new SocialError(response instanceof Response && response.status === 410 ? 'expired' : 'failed', message);
  };

  let current: Account | null = null;
  const listeners = new Set<(account: Account | null) => void>();
  client.auth.onAuthStateChange((_event, session) => {
    const next = accountOf(session?.user);
    if (next?.id === current?.id && next?.username === current?.username) return;
    current = next;
    listeners.forEach((l) => l(current));
  });
  const ready = client.auth.getSession().then(({ data }) => {
    current = accountOf(data.session?.user);
    return current;
  });

  const member = () => {
    if (!current) throw new SocialError('signed-out', 'Sign in first.');
    return current;
  };

  /** Usernames by account, for chat messages that arrive without one. */
  const usernames = new Map<string, string>();
  const usernameOf = async (id: string) => {
    if (!usernames.has(id)) {
      const { data } = await client.from('profiles').select('username').eq('id', id).maybeSingle();
      usernames.set(id, data?.username ?? 'someone');
    }
    return usernames.get(id)!;
  };

  /**
   * Whether the database predates rooms (supabase/migrations/20260928_chat_rooms.sql
   * not run yet): then there's one room, the Lobby, and messages have no room.
   */
  let roomless = false;

  type Row = { id: number; user_id: string; body: string; created_at: string; room?: string };
  const messageOf = async (row: Row): Promise<ChatMessage> => ({
    id: String(row.id),
    room: row.room ?? LOBBY.id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    username: await usernameOf(row.user_id)
  });

  // One Realtime channel for chat, shared by everyone watching (the Chat
  // window and the alerts that run while it's closed): the client hands
  // back the same channel for the same name, so each can't have its own.
  const chatWatchers = new Set<ChatHandlers>();
  let chatChannel: ReturnType<typeof client.channel> | null = null;
  const watchAll = () => {
    chatChannel = client
      .channel('chat-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async ({ new: m }) => {
        const message = await messageOf(m as Row);
        chatWatchers.forEach((w) => w.onMessage(message));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, ({ old }) => {
        const id = (old as { id?: number }).id;
        if (id !== undefined) chatWatchers.forEach((w) => w.onRemove(String(id)));
      })
      .subscribe();
  };
  // Private conversations are only delivered to a member who's signed in,
  // so the channel starts over as the member changes.
  listeners.add(() => {
    if (!chatChannel) return;
    client.removeChannel(chatChannel);
    watchAll();
  });

  return {
    account: () => current,

    onAccount(callback) {
      listeners.add(callback);
      ready.then(() => listeners.has(callback) && callback(current));
      return () => listeners.delete(callback);
    },

    async usernameAvailable(username) {
      const { data, error } = await client.rpc('username_available', { name: username.toLowerCase() });
      if (error) throw refusal(error);
      return Boolean(data);
    },

    async signUp(username, password, recoveryEmail) {
      const name = username.trim().toLowerCase();
      if (!USERNAME.test(name)) throw new SocialError('invalid', 'A username is 3 to 20 letters, digits or underscores.');
      if (password.length < PASSWORD_MIN) throw new SocialError('invalid', `A password needs at least ${PASSWORD_MIN} characters.`);
      if (!(await this.usernameAvailable(name))) throw new SocialError('taken', 'That username is taken.');
      const { data, error } = await client.auth.signUp({
        email: addressOf(name),
        password,
        options: { data: { username: name, ...(recoveryEmail?.trim() ? { recovery_email: recoveryEmail.trim() } : {}) } }
      });
      if (error) {
        if (/registered|exists/i.test(error.message)) throw new SocialError('taken', 'That username is taken.');
        if (/password/i.test(error.message)) throw new SocialError('invalid', error.message);
        throw new SocialError('failed', 'Couldn’t make the account. Try again in a moment.');
      }
      // Without a session the project still asks for email confirmation (see the migration).
      if (!data.session) throw new SocialError('failed', 'Accounts aren’t open yet.');
      current = accountOf(data.user);
      return current!;
    },

    async signIn(username, password) {
      const name = username.trim().toLowerCase();
      const { data, error } = await client.auth.signInWithPassword({ email: addressOf(name), password });
      if (error) throw new SocialError('credentials', 'That username and password don’t match.');
      current = accountOf(data.user);
      return current!;
    },

    async requestReset(username) {
      await recovery({ action: 'request', username: username.trim().toLowerCase() });
    },

    async checkReset(token) {
      const { username } = (await recovery({ action: 'check', token })) as { username: string | null };
      return username;
    },

    async resetPassword(token, password) {
      const { username } = (await recovery({ action: 'reset', token, password })) as { username: string };
      return this.signIn(username, password);
    },

    async recoveryEmail() {
      member();
      const { data, error } = await client.rpc('my_recovery_email');
      if (error) throw refusal(error);
      return (data as string | null) ?? null;
    },

    async setRecoveryEmail(email) {
      member();
      const { error } = await client.rpc('set_recovery_email', { p_email: email ?? '' });
      if (error) {
        if (error.code === '23514') throw new SocialError('invalid', 'That doesn’t look like an email address.');
        throw refusal(error);
      }
    },

    async signOut() {
      await client.auth.signOut();
      current = null;
      listeners.forEach((l) => l(null));
    },

    async listNotes() {
      const { data, error } = await client
        .from('notes')
        .select('id, body, name, color, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return data as Note[];
    },

    async postNote(note) {
      member();
      // No .select(): visitors can't read back every column the database fills in.
      const { error } = await client.from('notes').insert(note);
      if (error) throw refusal(error);
    },

    async deleteNote(id) {
      member();
      const { error } = await client.from('notes').delete().eq('id', id);
      if (error) throw refusal(error);
    },

    async notesLeft() {
      if (!current) return 0;
      const { count, error } = await client
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', current.id)
        .gt('created_at', since(24));
      if (error) throw refusal(error);
      return Math.max(0, NOTES_PER_DAY - (count ?? 0));
    },

    async listPosts() {
      const query = (columns: string) =>
        client.from('soapbox_posts').select(columns).order('created_at', { ascending: false }).limit(100);
      let { data: posts, error } = await query('id, body, kind, place, weather, images, created_at');
      // A database without supabase/migrations/20260929_soapbox_images.sql has no images yet.
      if (error) ({ data: posts, error } = await query('id, body, kind, place, weather, created_at'));
      if (error) throw new Error(error.message);
      const rows = (posts ?? []) as unknown as (Omit<Post, 'reactions' | 'images'> & { images?: (PostImage & { message?: number })[] })[];
      const ids = rows.map((p) => p.id);
      const { data: reactions } = ids.length
        ? await client.from('soapbox_reactions').select('post_id, emoji').in('post_id', ids)
        : { data: [] };
      const counts = new Map<string, Post['reactions']>();
      for (const r of reactions ?? []) {
        const tally = counts.get(r.post_id) ?? {};
        tally[r.emoji as Reaction] = (tally[r.emoji as Reaction] ?? 0) + 1;
        counts.set(r.post_id, tally);
      }
      return rows.map((p) => ({
        ...p,
        // An album's photos arrive in any order; the message they came from puts them back.
        images: [...(p.images ?? [])].sort((a, b) => (a.message ?? 0) - (b.message ?? 0)).map(({ url, width, height }) => ({ url, width, height })),
        reactions: counts.get(p.id) ?? {}
      }));
    },

    async myReactions() {
      if (!current) return {};
      const { data, error } = await client.rpc('my_reactions');
      if (error) throw refusal(error);
      return Object.fromEntries((data as { post_id: string; emoji: Reaction }[]).map((r) => [r.post_id, r.emoji]));
    },

    async react(postId, reaction) {
      if (reaction === null) {
        member();
        const { error } = await client.from('soapbox_reactions').delete().eq('post_id', postId);
        if (error) throw refusal(error);
        return;
      }
      const { error } = await client.from('soapbox_reactions').insert({ post_id: postId, emoji: reaction });
      if (!error) return;
      // A member changing their mind: they already have a row for this post.
      if (error.code === '23505' && current) {
        const { error: update } = await client.from('soapbox_reactions').update({ emoji: reaction }).eq('post_id', postId);
        if (update) throw refusal(update);
        return;
      }
      if (error.code === '23505') throw new SocialError('already', 'Someone on your network already reacted to this one.');
      throw refusal(error);
    },

    async listRooms() {
      const { data, error } = await client.from('chat_rooms').select('id, name, topic').order('position');
      if (error) {
        roomless = true;
        return [LOBBY];
      }
      return data?.length ? (data as ChatRoom[]) : [LOBBY];
    },

    async chatActivity() {
      if (roomless) return [];
      const { data, error } = await client.rpc('chat_activity');
      if (error) return [];
      return (data as { room: string; last_at: string }[]).map((a) => ({ room: a.room, last_at: a.last_at }));
    },

    async findMember(username) {
      const { data } = await client.from('profiles').select('id, username').eq('username', username.trim().toLowerCase()).maybeSingle();
      if (data) usernames.set(data.id, data.username);
      return data;
    },

    usernameOf,

    async listChat(room, before) {
      if (roomless && room !== LOBBY.id) return [];
      let query = client
        .from('chat_messages')
        .select(roomless ? 'id, user_id, body, created_at, profiles(username)' : 'id, room, user_id, body, created_at, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!roomless) query = query.eq('room', room);
      if (before) query = query.lt('created_at', before);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as (Row & { profiles: { username: string } | null })[])
        .map((m) => {
          if (m.profiles) usernames.set(m.user_id, m.profiles.username);
          return {
            id: String(m.id),
            room: m.room ?? LOBBY.id,
            user_id: m.user_id,
            body: m.body,
            created_at: m.created_at,
            username: m.profiles?.username ?? 'someone'
          };
        })
        .reverse();
    },

    async sendChat(room, body) {
      member();
      if (roomless && room !== LOBBY.id) throw new SocialError('failed', 'This room isn’t open yet.');
      const { error } = await client.from('chat_messages').insert(roomless ? { body: body.trim() } : { body: body.trim(), room });
      if (error) {
        if (error.code === '42501' && isDM(room)) throw new SocialError('invalid', 'You can’t write to that conversation.');
        throw refusal(error);
      }
    },

    async deleteChat(id) {
      member();
      const { error } = await client.from('chat_messages').delete().eq('id', Number(id));
      if (error) throw refusal(error);
    },

    watchChat(handlers) {
      chatWatchers.add(handlers);
      if (!chatChannel) watchAll();
      return () => {
        chatWatchers.delete(handlers);
        if (chatWatchers.size || !chatChannel) return;
        client.removeChannel(chatChannel);
        chatChannel = null;
      };
    },

    joinPresence(info, { onVisitors, onCursor, onLeave, onSignal }) {
      const id = crypto.randomUUID();
      let me: VisitorInfo = info;
      let subscribed = false;
      const channel = client.channel('desktop', {
        config: { presence: { key: id }, broadcast: { self: false } }
      });
      const visitors = () =>
        Object.entries(channel.presenceState<VisitorInfo>()).map(([key, [meta]]) => ({
          ...cleanInfo(meta, CURSOR_COLORS[0]),
          id: key,
          self: key === id
        }));
      channel
        .on('presence', { event: 'sync' }, () => onVisitors(visitors()))
        .on('presence', { event: 'leave' }, ({ key }) => onLeave(key))
        .on('broadcast', { event: 'cursor' }, ({ payload }) => onCursor(payload.id, payload.x, payload.y, payload.color))
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          if (typeof payload?.event !== 'string' || typeof payload?.from !== 'string') return;
          onSignal({ event: payload.event, from: payload.from, payload: payload.payload ?? {} });
        })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          subscribed = true;
          channel.track(me);
        });
      return {
        id,
        moveCursor: (x, y) => {
          channel.send({ type: 'broadcast', event: 'cursor', payload: { id, x, y, color: me.color } });
        },
        signal: (event, payload) => {
          channel.send({ type: 'broadcast', event: 'signal', payload: { event, from: id, payload } });
        },
        update: (next) => {
          me = next;
          if (subscribed) channel.track(me);
        },
        leave: () => {
          client.removeChannel(channel);
        }
      };
    }
  };
}
