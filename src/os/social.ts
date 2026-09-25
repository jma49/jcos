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

export interface PresenceHandlers {
  /** How many people (this visitor included) are on the desktop. */
  onCount: (count: number) => void;
  /** Another visitor's pointer, as fractions of their viewport; x < 0 means it left the page. */
  onCursor: (id: string, x: number, y: number, color: string) => void;
  onLeave: (id: string) => void;
}

export interface Presence {
  moveCursor: (x: number, y: number) => void;
  leave: () => void;
}

export interface Social {
  /** The newest approved notes. */
  listNotes: () => Promise<Note[]>;
  /** Submits a note for review; it isn't visible until approved. */
  postNote: (note: Pick<Note, 'body' | 'name' | 'color'>) => Promise<void>;
  joinPresence: (color: string, handlers: PresenceHandlers) => Presence;
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
      // No .select(): the new row isn't approved, so it can't be read back.
      const { error } = await client.from('notes').insert(note);
      if (error) throw new Error(error.message);
    },

    joinPresence(color, { onCount, onCursor, onLeave }) {
      const id = crypto.randomUUID();
      const channel = client.channel('desktop', {
        config: { presence: { key: id }, broadcast: { self: false } }
      });
      channel
        .on('presence', { event: 'sync' }, () => onCount(Object.keys(channel.presenceState()).length))
        .on('presence', { event: 'leave' }, ({ key }) => onLeave(key))
        .on('broadcast', { event: 'cursor' }, ({ payload }) => onCursor(payload.id, payload.x, payload.y, payload.color))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') channel.track({ color });
        });
      return {
        moveCursor: (x, y) => {
          channel.send({ type: 'broadcast', event: 'cursor', payload: { id, x, y, color } });
        },
        leave: () => {
          client.removeChannel(channel);
        }
      };
    }
  };
}
