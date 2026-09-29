// The social features on Supabase (supabase/schema.sql): accounts through
// Supabase Auth, notes, reactions and chat in Postgres behind row-level
// security, presence and live chat through Realtime.

import { createClient, type PostgrestError, type User } from '@supabase/supabase-js';
import { CURSOR_COLORS } from './social';
import { discOf, songOf, type Disc } from '../../lib/library';
import { playlistNameProblem } from './playlistNames';
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
  type DiaryEntry,
  type HomeDocument,
  type HomeFolder,
  type Listening,
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

/** The columns of a disc, as the shelf gives them to everyone. */
const DISC_COLUMNS = 'id,title,artist,cover,cover_x,duration_ms,added_at';

/** A disc's fields as the database names them, leaving out what isn't given. */
const discRow = (d: Partial<Disc>) => ({
  ...(d.id !== undefined ? { id: d.id } : {}),
  ...(d.title !== undefined ? { title: d.title } : {}),
  ...('artist' in d ? { artist: d.artist ?? null } : {}),
  ...(d.cover !== undefined ? { cover: d.cover } : {}),
  ...(d.coverX !== undefined ? { cover_x: d.coverX } : {}),
  ...(d.duration !== undefined ? { duration_ms: d.duration } : {})
});

/** A write only the owner may make, from anyone else: row-level security refuses it (42501). */
const notOwner = (what = 'the discs everyone sees') => new SocialError('failed', `Only Jincheng can change ${what}.`);

interface StatsRow {
  song_id: string;
  rating: number | null;
  plays: number;
  played_at: string | null;
}

interface PlaylistRow {
  id: number;
  name: string;
  playlist_songs: { song_id: string }[] | null;
}

/** The columns of a document and of a diary entry, as the owner (or, in Public, anyone) reads them. */
const DOCUMENT_COLUMNS = 'id,folder,name,body,version,updated_at';
const ENTRY_COLUMNS = 'id,day,body,version,created_at,updated_at';

interface DocumentRow {
  id: string;
  folder: HomeFolder;
  name: string;
  body: string;
  version: number;
  updated_at: string;
}

interface EntryRow {
  id: string;
  day: string;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const documentOf = (row: DocumentRow): HomeDocument => ({
  id: row.id,
  folder: row.folder,
  name: row.name,
  body: row.body,
  version: row.version,
  updated: row.updated_at
});

const entryOf = (row: EntryRow): DiaryEntry => ({
  id: row.id,
  day: row.day,
  body: row.body,
  version: row.version,
  created: row.created_at,
  updated: row.updated_at
});

/** A save refused because another one landed first, or the thing is gone. */
const changedElsewhere = () => new SocialError('conflict', 'It was changed or thrown away somewhere else since this copy was opened.');

/** Jincheng's ratings, plays and playlists as the iPod uses them, leaving out what isn't set. */
export function listeningOf(stats: StatsRow[], playlists: PlaylistRow[]): Listening {
  return {
    stats: Object.fromEntries(
      stats.map((row) => [
        row.song_id,
        { ...(row.rating ? { rating: row.rating } : {}), plays: row.plays, ...(row.played_at ? { played: row.played_at } : {}) }
      ])
    ),
    playlists: playlists.map((row) => ({ id: Number(row.id), name: row.name, songs: (row.playlist_songs ?? []).map((s) => s.song_id) }))
  };
}

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
   * Whether the database predates rooms (supabase/migrations/20260926071227_chat_rooms.sql
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

    async isOwner() {
      if (!current) return false;
      const { data, error } = await client.rpc('is_owner');
      if (error) throw refusal(error);
      return data === true;
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
      // A database without supabase/migrations/20260926080833_soapbox_images.sql has no images yet.
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

    async song(id) {
      const { data, error } = await client
        .from('songs')
        .select('id,title,artist,album,cover,track,instrumental,lyrics_offset,lyrics_id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? songOf(data) : null;
    },

    async shelf() {
      const { data, error } = await client.from('discs').select(DISC_COLUMNS).order('added_at').order('id');
      if (error) throw error;
      return (data ?? []).map(discOf);
    },

    async burnDisc(disc) {
      member();
      const { data, error } = await client.from('discs').insert(discRow(disc)).select(DISC_COLUMNS).single();
      if (error) {
        if (error.code === '42501') throw notOwner();
        if (error.code === '23505') throw new SocialError('already', 'That video is already on the shelf.');
        throw refusal(error);
      }
      return discOf(data);
    },

    // Row-level security lets anyone else's change reach no row, without an
    // error; the site offers these only to the owner, and a disc already
    // gone is gone either way.
    async relabelDisc(id, change) {
      member();
      const { error } = await client.from('discs').update(discRow(change)).eq('id', id);
      if (error) throw error.code === '42501' ? notOwner() : refusal(error);
    },

    async removeDisc(id) {
      member();
      const { error } = await client.from('discs').delete().eq('id', id);
      if (error) throw error.code === '42501' ? notOwner() : refusal(error);
    },

    // Changes to the shelf, which only the owner and the bot write. Realtime
    // sends the row itself, so a burn doesn't send every visitor to the
    // database at once; a removal comes with the id alone.
    watchDiscs({ onDisc, onRemove }) {
      const channel = client
        .channel('discs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'discs' }, ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            const id = (old as { id?: unknown } | null)?.id;
            if (typeof id === 'string') onRemove(id);
            return;
          }
          const r = row as Parameters<typeof discOf>[0] | null;
          if (r && typeof r.id === 'string' && typeof r.title === 'string') onDisc(discOf(r), eventType === 'INSERT');
        })
        .subscribe();
      return () => {
        client.removeChannel(channel);
      };
    },

    // Jincheng's ratings, plays and playlists: everyone reads them, and the
    // database lets only the owner change them. Playlists come with their
    // songs in one request (PostgREST embeds them by the foreign key).
    async listening() {
      const [stats, playlists] = await Promise.all([
        client.from('song_stats').select('song_id,rating,plays,played_at'),
        client.from('playlists').select('id,name,playlist_songs(song_id)').order('id').order('position', { referencedTable: 'playlist_songs' })
      ]);
      if (stats.error) throw stats.error;
      if (playlists.error) throw playlists.error;
      return listeningOf(stats.data ?? [], playlists.data ?? []);
    },

    async rateSong(id, rating) {
      member();
      const { error } = await client.rpc('rate_song', { p_song: id, p_rating: rating });
      if (error) throw error.code === '42501' ? notOwner('the ratings everyone sees') : refusal(error);
    },

    async songPlayed(id) {
      member();
      const { error } = await client.rpc('song_played', { p_song: id });
      if (error) throw error.code === '42501' ? notOwner('the play counts everyone sees') : refusal(error);
    },

    async savePlaylist(name, songs) {
      member();
      const { data, error } = await client.rpc('save_playlist', { p_name: name, p_songs: songs });
      if (error) {
        if (error.code === '42501') throw notOwner('the playlists everyone sees');
        // A name the table's check refuses.
        if (error.code === '23514') throw new SocialError('invalid', playlistNameProblem(name) ?? 'That name won’t do.');
        throw refusal(error);
      }
      return Number(data);
    },

    // Row-level security lets anyone else's delete reach no row, without an
    // error; the site offers these only to the owner.
    async unlistSong(playlist, song) {
      member();
      const { error } = await client.from('playlist_songs').delete().eq('playlist_id', playlist).eq('song_id', song);
      if (error) throw error.code === '42501' ? notOwner('the playlists everyone sees') : refusal(error);
    },

    async deletePlaylist(playlist) {
      member();
      const { error } = await client.from('playlists').delete().eq('id', playlist);
      if (error) throw error.code === '42501' ? notOwner('the playlists everyone sees') : refusal(error);
    },

    // Jincheng's home folder. Row-level security gives anyone else only
    // the documents in Public, and no diary at all.
    async home(owner) {
      const [documents, diary] = await Promise.all([
        client.from('documents').select(DOCUMENT_COLUMNS).order('folder').order('name'),
        owner
          ? client.from('diary').select(ENTRY_COLUMNS).order('day', { ascending: false }).order('created_at')
          : Promise.resolve({ data: [] as EntryRow[], error: null })
      ]);
      if (documents.error) throw documents.error;
      if (diary.error) throw diary.error;
      return { documents: (documents.data ?? []).map(documentOf), diary: (diary.data ?? []).map(entryOf) };
    },

    // A save names the version it was made from, so one from an older copy
    // reaches no row and is refused rather than overwriting what's newer.
    async saveDocument({ id, version, folder, name, body }) {
      member();
      const request = id
        ? client.from('documents').update({ folder, name, body }).eq('id', id).eq('version', version ?? 0).select(DOCUMENT_COLUMNS).maybeSingle()
        : client.from('documents').insert({ folder, name, body }).select(DOCUMENT_COLUMNS).single();
      const { data, error } = await request;
      if (error) {
        if (error.code === '42501') throw notOwner('Jincheng’s documents');
        if (error.code === '23505') throw new SocialError('already', `There’s already a document called “${name}” in that folder.`);
        if (error.code === '23514') throw new SocialError('invalid', 'A name is one line, without “/” or “:”, and a document holds 100,000 characters at most.');
        throw refusal(error);
      }
      if (!data) throw changedElsewhere();
      return documentOf(data);
    },

    async deleteDocument(id) {
      member();
      const { error } = await client.from('documents').delete().eq('id', id);
      if (error) throw error.code === '42501' ? notOwner('Jincheng’s documents') : refusal(error);
    },

    async saveEntry({ id, version, day, body }) {
      member();
      const request = id
        ? client.from('diary').update({ day, body }).eq('id', id).eq('version', version ?? 0).select(ENTRY_COLUMNS).maybeSingle()
        : client.from('diary').insert({ day, body }).select(ENTRY_COLUMNS).single();
      const { data, error } = await request;
      if (error) throw error.code === '42501' ? notOwner('Jincheng’s diary') : refusal(error);
      if (!data) throw changedElsewhere();
      return entryOf(data);
    },

    async deleteEntry(id) {
      member();
      const { error } = await client.from('diary').delete().eq('id', id);
      if (error) throw error.code === '42501' ? notOwner('Jincheng’s diary') : refusal(error);
    },

    async nowPlaying() {
      const { data, error } = await client.rpc('now_playing_position');
      if (error) throw error;
      const row = (data as { song_id: string; elapsed_ms: number; remaining_ms: number }[] | null)?.[0];
      return row ? { songId: row.song_id, elapsedMs: Number(row.elapsed_ms), remainingMs: Number(row.remaining_ms) } : null;
    },

    // Changes to now_playing, which only the bot writes. Realtime reads them
    // from the database's log, so the row can be believed; reading it here
    // saves every visitor asking the database at the same moment when a song
    // starts. (Joining at the right second asks, see media/together.ts.)
    watchNowPlaying(onChange, onConnected) {
      const channel = client
        .channel('now-playing')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'now_playing' }, ({ eventType, new: row }) => {
          const r = row as { song_id?: unknown; ends_at?: unknown } | null;
          const ends = typeof r?.ends_at === 'string' ? Date.parse(r.ends_at) : NaN;
          if (eventType === 'DELETE' || typeof r?.song_id !== 'string' || !Number.isFinite(ends)) return onChange(null);
          onChange({ songId: r.song_id, remainingMs: Math.max(0, ends - Date.now()) });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onConnected?.();
        });
      return () => {
        client.removeChannel(channel);
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
