// Chat in public.chat_messages: rooms anyone reads, private conversations
// only their two members read, and new messages and takedowns over one
// Realtime channel. Usernames come with a page of messages, or from the
// context's cache for a message that arrives live.

import { isDM, LOBBY, type ChatHandlers, type ChatMessage, type ChatSocial } from '../chat';
import { SocialError } from '../errors';
import { refusal, type SupabaseContext } from './context';

export function supabaseChat(ctx: SupabaseContext): ChatSocial {
  const { client, member, usernames, usernameOf } = ctx;

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
  // so the channel starts over as the member changes. Added as the backend
  // is made, so it runs before anything the site adds.
  ctx.listeners.add(() => {
    if (!chatChannel) return;
    client.removeChannel(chatChannel);
    watchAll();
  });

  return {
    async listRooms() {
      const { data, error } = await client.from('chat_rooms').select('id, name, topic').order('position');
      if (error) {
        roomless = true;
        return [LOBBY];
      }
      return data?.length ? data : [LOBBY];
    },

    async chatActivity() {
      if (roomless) return [];
      const { data, error } = await client.rpc('chat_activity');
      if (error) return [];
      return data.map((a) => ({ room: a.room, last_at: a.last_at }));
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
    }
  };
}
