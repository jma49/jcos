// The music library, managed from Telegram: the bot's /add, /songs,
// /remove and /offset. Songs live in public.songs
// (supabase/migrations/20260927030802_music_library.sql), which checks
// every field and holds the library to its limit; this finds what to put
// there.
//
//   /add <YouTube link> [title - artist]
//        looks the video up (YouTube's oEmbed: it exists and may be
//        embedded), finds the song on Apple Music for its proper title,
//        album, cover and length (the title and artist given, if any, are
//        what it searches for), checks lrclib for synced lyrics, and shows
//        what it found with Add and Cancel buttons
//   /songs [words]      how many songs, and the latest (or those matching)
//   /remove <song>      takes a song out of the library
//   /offset <song> <ms> how far its lyrics run ahead of the video
//   /play <song>        plays it for whoever is on the desktop, who can
//                       listen along from where it is (src/os/media/together.ts)
//   /stop               stops it
//
// A song is named by its video id or by words from its title. Only the
// video id is taken from a link: every address this fetches is built
// here, never one that was sent.

import { clip, guessFromVideo, VIDEO_ID, videoIdOf } from '../_shared/youtube.ts';

export { guessFromVideo, videoIdOf };

export interface Deps {
  /** PostgREST with the service role (index.ts's db). */
  db: (path: string, init?: RequestInit) => Promise<any>;
  /** Telegram's Bot API. */
  telegram: (method: string, params: Record<string, unknown>) => Promise<any>;
}

/** A draft waiting in music_settings for Add or Cancel. */
interface Pending {
  song: Draft;
  created: string;
}

export interface Draft {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  cover: string;
  duration_ms: number | null;
}

/** What the database accepts as a cover (the music_cover domain). */
const COVER = /^https:\/\/(is[1-5]-ssl\.mzstatic\.com|i\.ytimg\.com)\/[A-Za-z0-9._~/%+=,:@-]+$/;
const TIMEOUT = 5000;

interface ITunesTrack {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
}

const plain = (s: string) => s.toLowerCase().replace(/[(（\[【].*?[)）\]】]/g, '').replace(/[\s\p{P}\p{S}]/gu, '');
const related = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a));

/** The search result that is this song (title, then artist), or null. */
export function pickTrack(results: ITunesTrack[], title: string, artist: string): ITunesTrack | null {
  const same = results.filter((r) => r.trackName && r.artistName && related(plain(r.trackName), plain(title)));
  return same.find((r) => related(plain(r.artistName!), plain(artist))) ?? null;
}

/** Apple's artwork at 600 × 600, if it's an address the library accepts. */
export function coverOf(track: ITunesTrack): string | null {
  const url = track.artworkUrl100?.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600bb.jpg');
  return url && COVER.test(url) ? url : null;
}

const hasChinese = (s: string) => /\p{Script=Han}/u.test(s);

/**
 * What YouTube says about a video (its oEmbed): its title and channel, or
 * why it can't be used here. oEmbed answers 401 or 403 for a video whose
 * owner doesn't let other sites play it.
 */
export async function videoInfo(id: string): Promise<{ title: string; channel: string } | { error: string }> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, {
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (oembed.status === 401 || oembed.status === 403) return { error: 'That video can’t be played on other sites (its owner turned embedding off).' };
  if (!oembed.ok) return { error: 'YouTube doesn’t know that video (private, removed, or a typo?).' };
  const video = (await oembed.json()) as { title?: string; author_name?: string };
  return { title: video.title ?? '', channel: video.author_name ?? '' };
}

/** Everything /add needs to know about a video, or why it can't be added. */
export async function lookUp(id: string, hint?: { title: string; artist: string }): Promise<Draft | { error: string }> {
  const video = await videoInfo(id);
  if ('error' in video) return video;
  const guess = hint ?? guessFromVideo(video.title, video.channel);
  if (!guess.title) return { error: 'Couldn’t tell the song’s title. Add it after the link: /add <link> Title - Artist' };

  const term = `${guess.artist} ${guess.title}`.trim();
  const country = hasChinese(term) ? 'TW' : 'US';
  let track: ITunesTrack | null = null;
  try {
    const search = await fetch(
      `https://itunes.apple.com/search?${new URLSearchParams({ term, media: 'music', entity: 'song', limit: '10', country })}`,
      { signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (search.ok) track = pickTrack(((await search.json()) as { results?: ITunesTrack[] }).results ?? [], guess.title, guess.artist);
  } catch {
    // Without Apple Music the video's own title and thumbnail do.
  }
  return {
    id,
    title: clip(track?.trackName ?? guess.title),
    artist: clip(track?.artistName ?? guess.artist),
    album: track?.collectionName ? clip(track.collectionName) : null,
    cover: (track && coverOf(track)) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration_ms: track?.trackTimeMillis && track.trackTimeMillis >= 1000 && track.trackTimeMillis <= 3_600_000 ? track.trackTimeMillis : null
  };
}

/** Whether lrclib has time-synced lyrics for it (what Karaoke shows); null if it didn't answer. */
export async function hasSyncedLyrics(draft: Pick<Draft, 'title' | 'artist'>): Promise<boolean | null> {
  try {
    const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: draft.title, artist_name: draft.artist })}`, {
      headers: { 'user-agent': 'JM/OS soapbox-bot (https://www.majincheng.com)' },
      signal: AbortSignal.timeout(TIMEOUT)
    });
    if (!res.ok) return null;
    const hits = (await res.json()) as { syncedLyrics?: string | null }[];
    return hits.some((h) => !!h.syncedLyrics);
  } catch {
    return null;
  }
}

/** A song's length from lrclib, for songs added before lengths were kept; null if it doesn't know. */
export async function lengthFromLyrics(song: { title: string; artist: string }): Promise<number | null> {
  try {
    const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: song.title, artist_name: song.artist })}`, {
      headers: { 'user-agent': 'JM/OS soapbox-bot (https://www.majincheng.com)' },
      signal: AbortSignal.timeout(TIMEOUT)
    });
    if (!res.ok) return null;
    // Only a hit that is this song (title and artist), not the search's first.
    const hits = (await res.json()) as { trackName?: string; artistName?: string; duration?: number }[];
    const seconds = hits.find(
      (h) =>
        typeof h.duration === 'number' &&
        related(plain(h.trackName ?? ''), plain(song.title)) &&
        related(plain(h.artistName ?? ''), plain(song.artist))
    )?.duration;
    return seconds && seconds >= 1 && seconds <= 3600 ? Math.round(seconds * 1000) : null;
  } catch {
    return null;
  }
}

/** "4:12". Rounded to the second first, so 3:59.6 is 4:00, not 3:60. */
export const minutes = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function describe(d: Draft) {
  return `${d.title} — ${d.artist}${d.album ? ` · ${d.album}` : ''}${d.duration_ms ? ` · ${minutes(d.duration_ms)}` : ''}`;
}

/** "Title - Artist" after a link, to search for instead of the video's own title. */
export function parseAdd(rest: string): { id: string | null; hint?: { title: string; artist: string } } {
  const [link, ...words] = rest.trim().split(/\s+/);
  const id = videoIdOf(link ?? '');
  const extra = words.join(' ');
  const parts = extra.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (parts) return { id, hint: { title: clip(parts[1]), artist: clip(parts[2]) } };
  return extra ? { id, hint: { title: clip(extra), artist: '' } } : { id };
}

/** Words for PostgREST's ilike, with anything that has meaning there taken out. */
export const searchable = (words: string) => words.replace(/[*%_,()"\\:.]/g, ' ').trim().slice(0, 100);

export function musicCommands({ db, telegram }: Deps) {
  const say = (chat: number, text: string, extra: Record<string, unknown> = {}) =>
    telegram('sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true }, ...extra });

  const limit = async () => {
    const rows = await db('music_settings?name=eq.song_limit&select=value');
    return Number(rows?.[0]?.value) || 200;
  };
  const count = async () => ((await db('songs?select=id')) as unknown[]).length;
  const tally = async () => `${await count()}/${await limit()} songs`;

  type Found = { id: string; title: string; artist: string; duration_ms: number | null };

  /** Songs named by a video id or words from their titles. */
  const find = async (words: string): Promise<Found[]> => {
    const columns = 'id,title,artist,duration_ms';
    // An 11-letter word ("Butterflies") looks like an id: try it, then the titles.
    const id = videoIdOf(words);
    if (id) {
      const byId: Found[] = await db(`songs?id=eq.${id}&select=${columns}`);
      if (byId.length) return byId;
    }
    const q = searchable(words);
    if (!q) return [];
    return db(`songs?title=ilike.${encodeURIComponent(`*${q}*`)}&select=${columns}&order=added_at.desc&limit=10`);
  };

  /**
   * One song, or a reply saying why not. When several match, each gets a
   * button naming it; pressing one does `then` to it (with `arg`, such as
   * an offset; see press), so no id is ever shown or typed.
   */
  const one = async (chat: number, words: string, then: 'remove' | 'play' | 'offset', arg?: number) => {
    const songs = await find(words);
    if (songs.length === 1) return songs[0];
    if (!songs.length) await say(chat, `No song matches “${words}”.`);
    else
      await say(chat, 'Which one?', {
        reply_markup: { inline_keyboard: songs.map((s) => [{ text: `${s.title} — ${s.artist}`.slice(0, 64), callback_data: `song:${then}:${s.id}${arg === undefined ? '' : `:${arg}`}` }]) }
      });
    return null;
  };

  async function add(chat: number, rest: string) {
    const { id, hint } = parseAdd(rest);
    if (!id) return say(chat, 'Send a YouTube link: /add <link>, or /add <link> Title - Artist to say what to look for.');
    if ((await db(`songs?id=eq.${id}&select=title`)).length) return say(chat, 'That song is already in the library.');
    const [total, most] = [await count(), await limit()];
    if (total >= most) return say(chat, `The library is full (${most} songs). /remove one first.`);
    const found = await lookUp(id, hint);
    if ('error' in found) return say(chat, found.error);
    const lyrics = await hasSyncedLyrics(found);
    // Kept until Add or Cancel is pressed (a button carries only 64 bytes);
    // drafts nobody answered within a day are cleared here.
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    await db(`music_settings?name=like.draft:*&value->>created=lt.${encodeURIComponent(dayAgo)}`, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' }
    });
    await db('music_settings', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ name: `draft:${id}`, value: { song: found, created: new Date().toISOString() } satisfies Pending })
    });
    const lines = [
      `🎵 ${describe(found)}`,
      found.cover.includes('mzstatic') ? 'Cover: Apple Music' : 'Cover: the video’s thumbnail (not on Apple Music)',
      lyrics === null ? 'Lyrics: lrclib didn’t answer' : lyrics ? 'Lyrics: synced, on lrclib' : 'Lyrics: none synced on lrclib (Karaoke will try NetEase)',
      `Library: ${total}/${most} songs`
    ];
    return say(chat, lines.join('\n'), {
      reply_markup: { inline_keyboard: [[{ text: '✅ Add', callback_data: `song:add:${id}` }, { text: '✖︎ Cancel', callback_data: `song:cancel:${id}` }]] }
    });
  }

  async function songs(chat: number, words: string) {
    const [total, most] = [await count(), await limit()];
    const q = searchable(words);
    const rows: { id: string; title: string; artist: string }[] = q
      ? await db(`songs?title=ilike.${encodeURIComponent(`*${q}*`)}&select=id,title,artist&order=added_at.desc&limit=20`)
      : await db('songs?select=id,title,artist&order=added_at.desc&limit=15');
    const head = q ? `${rows.length ? '' : 'None match. '}${total}/${most} songs.` : `${total}/${most} songs. The latest:`;
    return say(chat, [head, ...rows.map((s) => `• ${s.title} — ${s.artist}`)].join('\n'));
  }

  async function remove(chat: number, words: string) {
    if (!words) return say(chat, 'Which song? /remove <title>');
    const song = await one(chat, words, 'remove');
    if (song) await removeSong(chat, song);
  }

  async function removeSong(chat: number, song: Found) {
    // An empty library would send the site back to its snapshot, bringing
    // removed songs back; the last one stays.
    if ((await count()) <= 1) return say(chat, 'That’s the last song; the library can’t be empty. /add another first.');
    await db(`songs?id=eq.${song.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    return say(chat, `🗑 Removed ${song.title} — ${song.artist}. ${await tally()}.`);
  }

  async function offset(chat: number, rest: string) {
    const parts = rest.match(/^(.+?)\s+([+-]?\d{1,5})\s*(ms)?$/i);
    if (!parts) return say(chat, 'How far the lyrics run ahead, in ms: /offset <title> 850 (negative for later).');
    const ms = Number(parts[2]);
    if (Math.abs(ms) > 30000) return say(chat, 'Keep it within 30 seconds (30000 ms).');
    const song = await one(chat, parts[1], 'offset', ms);
    if (song) await setOffset(chat, song, ms);
  }

  async function setOffset(chat: number, song: Found, ms: number) {
    await db(`songs?id=eq.${song.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ lyrics_offset: ms }) });
    return say(chat, `⏱ ${song.title}: lyrics ${ms === 0 ? 'on the beat' : `${Math.abs(ms)} ms ${ms > 0 ? 'ahead' : 'behind'}`}.`);
  }

  async function play(chat: number, words: string) {
    if (!words) return say(chat, 'Which song? /play <title>');
    const song = await one(chat, words, 'play');
    if (song) await playSong(chat, song);
  }

  async function playSong(chat: number, song: Found) {
    // A known length lets the play end with the song (ten minutes otherwise).
    let length = song.duration_ms;
    if (!length && (length = await lengthFromLyrics(song))) {
      await db(`songs?id=eq.${song.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ duration_ms: length }) });
    }
    await db('rpc/music_play', { method: 'POST', body: JSON.stringify({ p_song: song.id }) });
    return say(
      chat,
      `▶︎ Playing ${song.title} — ${song.artist} for everyone on the desktop${length ? ` (${minutes(length)})` : ' (for ten minutes: its length isn’t known)'}. They can listen along. /stop to stop.`
    );
  }

  async function stop(chat: number) {
    await db('rpc/music_stop', { method: 'POST', headers: { prefer: 'return=minimal' }, body: '{}' });
    return say(chat, '⏹ Stopped.');
  }

  return {
    /** A /add, /songs, /remove, /offset, /play or /stop; false for anything else. */
    async handle(chat: number, text: string): Promise<boolean> {
      const command = text.match(/^\/(add|songs|remove|offset|play|stop)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
      if (!command) return false;
      const [, name, rest = ''] = command;
      const run = { add, songs, remove, offset, play, stop }[name.toLowerCase() as 'add' | 'songs' | 'remove' | 'offset' | 'play' | 'stop'];
      try {
        await run(chat, rest.trim());
      } catch (error) {
        // Only the owner gets here, so say what went wrong.
        const reason = error instanceof Error ? error.message.slice(0, 300) : String(error);
        await say(chat, `Something went wrong; the library is as it was.\n\n${reason}`).catch(() => {});
      }
      return true;
    },

    /** Add or Cancel under an /add, or a song chosen under "Which one?"; false for other buttons. */
    async press(cb: { id: string; data?: string; message?: { chat: { id: number }; message_id: number; text?: string } }): Promise<boolean> {
      const [kind, action, id, arg] = (cb.data ?? '').split(':');
      if (kind !== 'song') return false;
      if (['remove', 'play', 'offset'].includes(action) && VIDEO_ID.test(id ?? '') && cb.message) {
        const chat = cb.message.chat.id;
        await telegram('answerCallbackQuery', { callback_query_id: cb.id });
        // The choice is made: the buttons go, so it isn't made twice.
        await telegram('editMessageReplyMarkup', { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
        try {
          const [song]: Found[] = await db(`songs?id=eq.${id}&select=id,title,artist,duration_ms`);
          if (!song) return (await say(chat, 'That song isn’t in the library any more.'), true);
          if (action === 'remove') await removeSong(chat, song);
          else if (action === 'play') await playSong(chat, song);
          else if (Number.isInteger(Number(arg)) && Math.abs(Number(arg)) <= 30000) await setOffset(chat, song, Number(arg));
        } catch (error) {
          const reason = error instanceof Error ? error.message.slice(0, 300) : String(error);
          await say(chat, `Something went wrong; the library is as it was.\n\n${reason}`).catch(() => {});
        }
        return true;
      }
      const done = (text: string, note: string) =>
        Promise.all([
          telegram('answerCallbackQuery', { callback_query_id: cb.id, text: note }),
          cb.message &&
            telegram('editMessageText', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: `${cb.message.text ?? ''}\n\n${text}` })
        ]);
      if (!['add', 'cancel'].includes(action) || !VIDEO_ID.test(id ?? '')) {
        await telegram('answerCallbackQuery', { callback_query_id: cb.id });
        return true;
      }
      // Taking the draft is the claim: of two presses at once (or Telegram
      // sending one twice), only the one whose delete finds it goes on.
      const [row] = (await db(`music_settings?name=eq.draft:${id}`, { method: 'DELETE', headers: { prefer: 'return=representation' } })) ?? [];
      if (!row) {
        await done('(This one was already answered.)', 'Already done');
        return true;
      }
      if (action === 'cancel') {
        await done('✖︎ Not added.', 'Cancelled');
        return true;
      }
      const draft = (row.value as Pending).song;
      // Added meanwhile (another /add of it): say so, even if the library is full now.
      if ((await db(`songs?id=eq.${draft.id}&select=id`)).length) {
        await done('It’s already in the library.', 'Already there');
        return true;
      }
      try {
        await db('songs', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(draft) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const why = /library is full/i.test(message)
          ? `The library is full (${await limit()} songs). /remove one, then /add it again.`
          : /duplicate key|already exists/i.test(message)
            ? 'It’s already in the library.'
            : `The database refused it: ${message.slice(0, 200)}`;
        await done(`⚠️ ${why}`, 'Not added');
        return true;
      }
      // /api/songs is fresh at the edge for 30 s and served stale for 30 more.
      await done(`✅ Added. ${await tally()}. It shows up on the site within a minute.`, 'Added');
      return true;
    }
  };
}
