// Stickies (notes visitors leave) and presence (who else is on the desktop).
//
// Production talks to Supabase with the public anon (or publishable) key;
// see supabase/schema.sql. The URL and key are read from PUBLIC_SUPABASE_*
// or, as the Supabase integration for Vercel names them, from
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Without
// them the features stay hidden, except in `astro dev`, which falls back to
// a stand-in that works across tabs of one browser.

export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_MAX = 280;
export const NAME_MAX = 40;

export interface Note {
  id: string;
  body: string;
  name: string;
  color: NoteColor;
  created_at: string;
}

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

export interface PresenceHandlers {
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

/** Thrown by postNote when this visitor already has a note up. */
export class AlreadyPostedError extends Error {
  constructor() {
    super('You’ve already left a note.');
  }
}

export interface Social {
  /** The newest visible notes. */
  listNotes: () => Promise<Note[]>;
  /** Puts a note up. Each visitor gets one; a second throws AlreadyPostedError. */
  postNote: (note: Pick<Note, 'body' | 'name' | 'color'>) => Promise<void>;
  joinPresence: (info: VisitorInfo, handlers: PresenceHandlers) => Presence;
  /** The newest Soapbox posts, with their reaction counts. */
  listPosts: () => Promise<Post[]>;
  /** Reacts to a post. Each visitor gets one reaction per post; a second throws AlreadyPostedError. */
  react: (postId: string, reaction: Reaction) => Promise<void>;
}

/** Colours for visitors' cursors. */
export const CURSOR_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#0090ff', '#8e4ec6', '#d6409f'];

/** How often a moving cursor is sent to others, at most. */
export const CURSOR_INTERVAL = 100;

let pending: Promise<Social | null> | null = null;

/** The social backend, loaded on first use, or null when there isn't one. */
export function getSocial(): Promise<Social | null> {
  pending ??= load().catch((error) => {
    console.warn(`[social] ${error}`);
    return null;
  });
  return pending;
}

async function load(): Promise<Social | null> {
  // Written out in full so Vite inlines each value on its own.
  const url = import.meta.env.PUBLIC_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return supabaseSocial(url, key);
  if (import.meta.env.DEV) return (await import('./social-local')).localSocial();
  return null;
}

async function supabaseSocial(url: string, key: string): Promise<Social> {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async listNotes() {
      const { data, error } = await client
        .from('notes')
        .select('id, body, name, color, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return data as Note[];
    },

    async postNote(note) {
      // No .select(): visitors can't read back the columns the database fills in.
      const { error } = await client.from('notes').insert(note);
      if (error?.code === '23505') throw new AlreadyPostedError();
      if (error) throw new Error(error.message);
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

    async react(postId, reaction) {
      const { error } = await client.from('soapbox_reactions').insert({ post_id: postId, emoji: reaction });
      if (error?.code === '23505') throw new AlreadyPostedError();
      if (error) throw new Error(error.message);
    },

    joinPresence(info, { onVisitors, onCursor, onLeave }) {
      const id = crypto.randomUUID();
      let me = info;
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
