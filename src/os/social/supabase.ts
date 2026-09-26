// The social features on Supabase (supabase/schema.sql): accounts through
// Supabase Auth, notes, reactions and chat in Postgres behind row-level
// security, presence and live chat through Realtime.

import { createClient, type PostgrestError, type User } from '@supabase/supabase-js';
import { CURSOR_COLORS } from './social';
import {
  NOTES_PER_DAY,
  PASSWORD_MIN,
  SocialError,
  USERNAME,
  type Account,
  type ChatMessage,
  type Note,
  type Post,
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
      const { data: posts, error } = await client
        .from('soapbox_posts')
        .select('id, body, kind, place, weather, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      const ids = (posts ?? []).map((p) => p.id);
      const { data: reactions } = ids.length
        ? await client.from('soapbox_reactions').select('post_id, emoji').in('post_id', ids)
        : { data: [] };
      const counts = new Map<string, Post['reactions']>();
      for (const r of reactions ?? []) {
        const tally = counts.get(r.post_id) ?? {};
        tally[r.emoji as Reaction] = (tally[r.emoji as Reaction] ?? 0) + 1;
        counts.set(r.post_id, tally);
      }
      return (posts ?? []).map((p) => ({ ...(p as Omit<Post, 'reactions'>), reactions: counts.get(p.id) ?? {} }));
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

    async listChat(before) {
      let query = client
        .from('chat_messages')
        .select('id, user_id, body, created_at, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (before) query = query.lt('created_at', before);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((m) => {
          const profile = m.profiles as unknown as { username: string } | null;
          if (profile) usernames.set(m.user_id, profile.username);
          return { id: String(m.id), user_id: m.user_id, body: m.body, created_at: m.created_at, username: profile?.username ?? 'someone' };
        })
        .reverse();
    },

    async sendChat(body) {
      member();
      const { error } = await client.from('chat_messages').insert({ body: body.trim() });
      if (error) throw refusal(error);
    },

    async deleteChat(id) {
      member();
      const { error } = await client.from('chat_messages').delete().eq('id', Number(id));
      if (error) throw refusal(error);
    },

    watchChat({ onMessage, onRemove }) {
      const channel = client
        .channel('chat-room')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async ({ new: m }) => {
          const row = m as { id: number; user_id: string; body: string; created_at: string };
          onMessage({ id: String(row.id), user_id: row.user_id, body: row.body, created_at: row.created_at, username: await usernameOf(row.user_id) });
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, ({ old }) => {
          if ((old as { id?: number }).id !== undefined) onRemove(String((old as { id: number }).id));
        })
        .subscribe();
      return () => {
        client.removeChannel(channel);
      };
    },

    joinPresence(info, { onVisitors, onCursor, onLeave }) {
      const id = crypto.randomUUID();
      let me: VisitorInfo = info;
      let subscribed = false;
      const channel = client.channel('desktop', {
        config: { presence: { key: id }, broadcast: { self: false } }
      });
      const visitors = () =>
        Object.entries(channel.presenceState<VisitorInfo>()).map(([key, [meta]]) => ({
          id: key,
          color: meta?.color ?? CURSOR_COLORS[0],
          city: meta?.city,
          country: meta?.country,
          self: key === id
        }));
      channel
        .on('presence', { event: 'sync' }, () => onVisitors(visitors()))
        .on('presence', { event: 'leave' }, ({ key }) => onLeave(key))
        .on('broadcast', { event: 'cursor' }, ({ payload }) => onCursor(payload.id, payload.x, payload.y, payload.color))
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          subscribed = true;
          channel.track(me);
        });
      return {
        moveCursor: (x, y) => {
          channel.send({ type: 'broadcast', event: 'cursor', payload: { id, x, y, color: me.color } });
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
