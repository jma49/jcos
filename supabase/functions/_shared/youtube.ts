// Reading YouTube links and guessing a song from a video's title: shared
// by the Telegram bot (soapbox-bot's /add and /dvd) and the site (DVD
// Player's Burn, src/os/media/discs.ts), so both read a link and name a
// video the same way. Plain TypeScript with no imports, as Deno and the
// site's bundler both take it. Since the site bundles this folder, a
// change here deploys the site (scripts/vercel-ignore.sh), as well as
// going out with the bot's next deploy.

/** A YouTube video id: 11 letters, digits, dashes or underscores. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** The longest title or artist the database takes. */
export const MAX_TEXT = 200;

/** The video id in a YouTube link (watch, youtu.be, Shorts, embed, YouTube Music) or on its own; null if there's none. */
export function videoIdOf(text: string): string | null {
  const word = text.trim().split(/\s+/)[0] ?? '';
  if (VIDEO_ID.test(word)) return word;
  let url: URL;
  try {
    url = new URL(word);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export const clip = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT);

/** Words in brackets that only describe the upload: "(Official Video)", "【MV】", "[HD]". */
const NOISE = /\s*[(（\[【][^)）\]】]*(official|video|mv|m\/v|lyrics?|audio|hd|4k|remaster|官方|完整版|高清|歌詞|字幕)[^)）\]】]*[)）\]】]/gi;

/**
 * Words at the end of a title that only say it's a video: "高清MV",
 * "官方MV", "Official Music Video". Only when they end in a video word, so
 * a song's own words stay.
 */
const TAIL = /\s*(?:[-–—|｜]\s*)?(?:(?:高清|官方|完整版|正式版|official)\s*)?(?:mv|m\/v|music\s+video|lyric\s+video|video)\s*$/i;
const tidy = (s: string) => s.replace(NOISE, '').replace(TAIL, '').trim();

/** A first guess at a video's song and artist from its title and channel. */
export function guessFromVideo(title: string, channel: string): { title: string; artist: string } {
  const topic = channel.match(/^(.*) - Topic$/);
  if (topic) return { title: clip(tidy(title)), artist: clip(topic[1]) };
  // "Artist《Song》…" or "Artist【Song】…", common for Chinese music videos,
  // or the song first: "《Song》Artist".
  const marked = title.match(/^([^《【]*)[《【]([^》】]+)[》】](.*)$/);
  if (marked && !/official|mv/i.test(marked[2])) {
    const artist = tidy(marked[1]) || tidy(marked[3]).replace(/^[-–—|｜\s]+/, '') || channel;
    return { title: clip(marked[2]), artist: clip(artist) };
  }
  const clean = tidy(title);
  const dash = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) return { title: clip(unquote(dash[2])), artist: clip(dash[1]) };
  // "Artist 'Song'", as Korean and Japanese music videos name themselves
  // ("… 'Song' MV" once the video words are gone): only a name in quotes
  // at the very end, so an apostrophe in a title doesn't split it.
  const quoted = clean.match(/^(.+?)\s+['‘"“]([^'’"”]+)['’"”]$/);
  if (quoted) return { title: clip(quoted[2]), artist: clip(quoted[1]) };
  return { title: clip(clean), artist: clip(channel) };
}

/** A song's name without the quotes around it: "'Song'" is Song. */
const unquote = (s: string) => s.replace(/^['‘"“](.+)['’"”]$/, '$1');
