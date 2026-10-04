// A member's own stickies in public.stickies: row-level security gives each
// member theirs alone, and the database holds them to sticky_limit.

import type { Tables } from '../../../lib/database.types';
import { changedElsewhere, SocialError } from '../errors';
import type { NoteColor } from '../notes';
import type { StickiesSocial, Sticky } from '../stickies';
import { refusal, type SupabaseContext } from './context';

/** The columns of a member's sticky, as they read it. */
const STICKY_COLUMNS = 'id,body,color,x,y,width,height,collapsed,version,updated_at';

type StickyRow = Pick<Tables<'stickies'>, 'id' | 'body' | 'color' | 'x' | 'y' | 'width' | 'height' | 'collapsed' | 'version' | 'updated_at'>;

const stickyOf = (row: StickyRow): Sticky => ({
  id: row.id,
  body: row.body,
  color: row.color as NoteColor,
  x: row.x,
  y: row.y,
  width: row.width,
  height: row.height,
  collapsed: row.collapsed,
  version: row.version,
  updated: row.updated_at
});

/** A sticky the database's checks refuse. */
const badSticky = () => new SocialError('invalid', 'A sticky holds 4,000 characters at most, in one of its six colours.');

export function supabaseStickies({ client, account, member, ready }: SupabaseContext): StickiesSocial {
  return {
    async myStickies() {
      await ready;
      if (!account()) return [];
      const { data, error } = await client.from('stickies').select(STICKY_COLUMNS).order('created_at');
      if (error) throw error;
      return (data ?? []).map(stickyOf);
    },

    async addSticky(sticky) {
      member();
      const { data, error } = await client.from('stickies').insert(sticky).select(STICKY_COLUMNS).single();
      if (error) throw error.code === '23514' ? badSticky() : refusal(error);
      return stickyOf(data);
    },

    // Only a change of the text names the version it was made from: moving
    // a note never makes what's typed into it elsewhere out of date.
    async changeSticky(id, change, version) {
      member();
      let request = client.from('stickies').update(change).eq('id', id);
      if (change.body !== undefined && version !== undefined) request = request.eq('version', version);
      const { data, error } = await request.select(STICKY_COLUMNS).maybeSingle();
      if (error) throw error.code === '23514' ? badSticky() : refusal(error);
      if (!data) throw changedElsewhere();
      return stickyOf(data);
    },

    async removeSticky(id) {
      member();
      const { error } = await client.from('stickies').delete().eq('id', id);
      if (error) throw refusal(error);
    }
  };
}
