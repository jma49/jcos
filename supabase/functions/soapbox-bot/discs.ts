// DVD Player's shelf, from Telegram: the bot's /dvd. Discs live in
// public.discs (supabase/migrations/20260929120000_discs.sql), which
// checks every field and keeps the shelf to its limit; this finds what to
// put there. They show up in the Movies folder on everyone's desktop.
//
//   /dvd                          how many discs, and the latest
//   /dvd <YouTube link> [Title - Artist]
//                                 burns the video onto a disc: YouTube's
//                                 oEmbed says it exists and may be played
//                                 here, and names it (guessed as /add
//                                 guesses a song) unless a name is given;
//                                 sent again with a name, it relabels it
//   /dvd remove <title or link>   takes a disc off the shelf
//
// Only the video id is taken from a link: every address this fetches is
// built here, never one that was sent.

import { guessFromVideo, videoIdOf } from '../_shared/youtube.ts';
import { parseAdd, searchable, videoInfo, type Deps } from './music.ts';

const TIMEOUT = 5000;

/** A disc as the bot names it. */
interface Shelved {
  id: string;
  title: string;
  artist: string | null;
}

/** "Whiplash — aespa", or the title alone. */
export const label = (d: Pick<Shelved, 'title' | 'artist'>) => (d.artist ? `${d.title} — ${d.artist}` : d.title);

/**
 * The case's picture: the video's full-size thumbnail where YouTube has
 * made one, or else the one every video has (with black bars, which the
 * site crops away).
 */
export async function bestCover(id: string): Promise<'maxresdefault' | 'hqdefault'> {
  try {
    const res = await fetch(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, { method: 'HEAD', signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok ? 'maxresdefault' : 'hqdefault';
  } catch {
    return 'hqdefault';
  }
}

export function discCommands({ db, telegram }: Deps) {
  const say = (chat: number, text: string) => telegram('sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true } });
  const limit = async () => Number((await db('music_settings?name=eq.disc_limit&select=value'))?.[0]?.value) || 200;

  async function list(chat: number) {
    const [discs, most]: [Shelved[], number] = await Promise.all([db('discs?select=id,title,artist&order=added_at.desc'), limit()]);
    if (!discs.length) return say(chat, `No discs yet (room for ${most}). Burn one: /dvd <YouTube link>`);
    const latest = discs.slice(0, 15).map((d) => `• ${label(d)}`);
    return say(
      chat,
      [`💿 ${discs.length}/${most} discs. The latest:`, ...latest, '', '/dvd <link> to burn one, /dvd remove <title> to take one off.'].join('\n')
    );
  }

  async function burn(chat: number, rest: string) {
    const { id, hint } = parseAdd(rest);
    if (!id) return say(chat, 'Send a YouTube link: /dvd <link>, or /dvd <link> Title - Artist to name it.');
    const [shelved]: Shelved[] = await db(`discs?id=eq.${id}&select=id,title,artist`);
    if (shelved) {
      if (!hint) return say(chat, `That one’s already on the shelf: ${label(shelved)}. To relabel it: /dvd <link> Title - Artist`);
      const relabel = { title: hint.title, artist: hint.artist || null };
      await db(`discs?id=eq.${id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(relabel) });
      return say(chat, `🏷 Relabelled: ${label(relabel)}.`);
    }
    const video = await videoInfo(id);
    if ('error' in video) return say(chat, video.error);
    const named = hint ?? guessFromVideo(video.title, video.channel);
    if (!named.title) return say(chat, 'Couldn’t tell what to call it. Name it after the link: /dvd <link> Title - Artist');
    const disc = { id, title: named.title, artist: named.artist || null, cover: await bestCover(id) };
    try {
      await db('discs', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(disc) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/shelf is full/i.test(message)) return say(chat, `The shelf is full (${await limit()} discs). /dvd remove one first.`);
      // Burned meanwhile (the same link sent twice at once).
      if (/duplicate key|already exists/i.test(message)) return say(chat, 'It’s already on the shelf.');
      throw error;
    }
    return say(chat, `💿 Burned: ${label(disc)}. It’s in the Movies folder on everyone’s desktop.`);
  }

  async function remove(chat: number, words: string) {
    const id = videoIdOf(words);
    const q = searchable(words);
    const found: Shelved[] = id
      ? await db(`discs?id=eq.${id}&select=id,title,artist`)
      : q
        ? await db(`discs?title=ilike.${encodeURIComponent(`*${q}*`)}&select=id,title,artist&order=added_at.desc&limit=10`)
        : [];
    if (!found.length) return say(chat, words ? `No disc matches “${words}”.` : 'Which disc? /dvd remove <title or link>');
    if (found.length > 1)
      return say(
        chat,
        [`${found.length} discs match. Send the link of the one to take off:`, ...found.map((d) => `• ${label(d)}: https://youtu.be/${d.id}`)].join('\n')
      );
    const [disc] = found;
    await db(`discs?id=eq.${disc.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    return say(chat, `🗑 Off the shelf: ${label(disc)}.`);
  }

  return {
    /** A /dvd; false for anything else. */
    async handle(chat: number, text: string): Promise<boolean> {
      const command = text.match(/^\/dvd(?:@\w+)?(?:\s+([\s\S]*))?$/i);
      if (!command) return false;
      const rest = (command[1] ?? '').trim();
      try {
        if (!rest) await list(chat);
        else if (/^remove\b/i.test(rest)) await remove(chat, rest.replace(/^remove\s*/i, ''));
        else await burn(chat, rest);
      } catch (error) {
        // Only the owner gets here, so say what went wrong.
        const reason = error instanceof Error ? error.message.slice(0, 300) : String(error);
        await say(chat, `Something went wrong; the shelf is as it was.\n\n${reason}`).catch(() => {});
      }
      return true;
    }
  };
}
