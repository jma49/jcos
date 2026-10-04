// Soapbox's posts (the bot writes them) and reactions: members react as
// themselves and can change their minds, anyone else gets one per post
// (the database keys them by a salted hash of the address).

import type { TablesInsert } from '../../../lib/database.types';
import { SocialError } from '../errors';
import type { Post, PostImage, Reaction, SoapboxSocial } from '../soapbox';
import { refusal, type SupabaseContext } from './context';

export function supabaseSoapbox({ client, account, member }: SupabaseContext): SoapboxSocial {
  return {
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
      if (!account()) return {};
      const { data, error } = await client.rpc('my_reactions');
      if (error) throw refusal(error);
      return Object.fromEntries(data.map((r) => [r.post_id, r.emoji as Reaction]));
    },

    async react(postId, reaction) {
      if (reaction === null) {
        member();
        const { error } = await client.from('soapbox_reactions').delete().eq('post_id', postId);
        if (error) throw refusal(error);
        return;
      }
      // `visitor` is the database's to fill in (a trigger), which the
      // generated types can't know: they ask for every column without a default.
      const { error } = await client.from('soapbox_reactions').insert({ post_id: postId, emoji: reaction } as TablesInsert<'soapbox_reactions'>);
      if (!error) return;
      // A member changing their mind: they already have a row for this post.
      if (error.code === '23505' && account()) {
        const { error: update } = await client.from('soapbox_reactions').update({ emoji: reaction }).eq('post_id', postId);
        if (update) throw refusal(update);
        return;
      }
      if (error.code === '23505') throw new SocialError('already', 'Someone on your network already reacted to this one.');
      throw refusal(error);
    }
  };
}
