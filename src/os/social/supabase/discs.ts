// DVD Player's shelf in public.discs: everyone reads it, only the owner
// (or the bot) writes it, and changes reach open desktops over Realtime.

import { discOf, type Disc } from '../../../lib/library';
import type { DiscsSocial } from '../discs';
import { SocialError } from '../errors';
import { notOwner, refusal, type SupabaseContext } from './context';

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

export function supabaseDiscs({ client, member }: SupabaseContext): DiscsSocial {
  return {
    async shelf() {
      const { data, error } = await client.from('discs').select(DISC_COLUMNS).order('added_at').order('id');
      if (error) throw error;
      return (data ?? []).map(discOf);
    },

    async burnDisc(disc) {
      member();
      const { data, error } = await client.from('discs').insert({ ...discRow(disc), id: disc.id, title: disc.title }).select(DISC_COLUMNS).single();
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
    }
  };
}
