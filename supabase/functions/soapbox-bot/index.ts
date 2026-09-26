// Soapbox bot: a Telegram webhook that turns Jincheng's messages into posts
// on the JM/OS Soapbox. Runs as a Supabase Edge Function (Deno).
//
// Only messages from TELEGRAM_OWNER_ID are accepted, and only requests that
// carry TELEGRAM_WEBHOOK_SECRET in the header Telegram adds. Posts are
// written with the service role key, which never leaves this function.
//
//   any text          post it as a note
//   a photo           post it, with its caption as the text; an album of
//                     photos (or images sent as files) becomes one post
//   /rant <text>      post it as a rant (so does text starting with #rant)
//   /note <text>      post it as a note
//   /at <city>        stamp later posts with this city and its weather
//   /at               show the current city
//   /delete           hide the post you reply to, or the latest one
//   /watch on|off     new Stickies notes and public chat messages sent
//                     here with a Hide button (on by default)
//   /help             this list
//
// Editing a message (or a photo's caption) in Telegram edits its post.
// Photos go to the public "soapbox" storage bucket. Setup is in
// supabase/functions/soapbox-bot/README.md.

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const BOT_TOKEN = env('TELEGRAM_BOT_TOKEN');
const WEBHOOK_SECRET = env('TELEGRAM_WEBHOOK_SECRET');
const OWNER_ID = Number(env('TELEGRAM_OWNER_ID'));
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const SITE = Deno.env.get('SOAPBOX_SITE_URL') ?? 'https://www.majincheng.com/?open=soapbox';

interface Place {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

const HOME: Place = { city: 'San Jose', country: 'US', latitude: 37.3382, longitude: -121.8863, timeZone: 'America/Los_Angeles' };
/** Images Telegram sends as files that can become pictures. */
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
/** The public storage bucket photos are copied into. */
const BUCKET = 'soapbox';
/** The largest picture kept: the bucket's limit, and well inside the 20 MB bots can download. */
const MAX_BYTES = 10 * 1024 * 1024;

const FAHRENHEIT = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'LR', 'MM', 'BS', 'KY', 'PW', 'FM', 'MH']);

const ICONS: [number[], string][] = [
  [[0], '☀️'],
  [[1, 2], '⛅'],
  [[3], '☁️'],
  [[45, 48], '🌫️'],
  [[51, 53, 55, 56, 57], '🌦️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️'],
  [[71, 73, 75, 77, 85, 86], '🌨️'],
  [[95, 96, 99], '⛈️']
];

/** PostgREST with the service role. */
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...init.headers
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  // return=minimal answers with no body at all (204, or 201 for an insert).
  return text ? JSON.parse(text) : null;
}

async function reply(chatId: number, text: string, replyTo?: number) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_parameters: replyTo ? { message_id: replyTo, allow_sending_without_reply: true } : undefined,
      link_preview_options: { is_disabled: true }
    })
  });
}

async function currentPlace(): Promise<Place> {
  const rows = await db('soapbox_settings?name=eq.place&select=value');
  return rows?.[0]?.value ?? HOME;
}

async function findPlace(query: string): Promise<Place | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(query)}`
  );
  const hit = (await res.json()).results?.[0];
  if (!hit) return null;
  return {
    city: hit.name,
    country: (hit.country_code ?? '').toUpperCase(),
    latitude: hit.latitude,
    longitude: hit.longitude,
    timeZone: hit.timezone ?? 'UTC'
  };
}

/** "⛅ 64°F", or null if the forecast service is down. */
async function weatherAt(place: Place): Promise<string | null> {
  const fahrenheit = FAHRENHEIT.has(place.country);
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,weather_code&temperature_unit=${fahrenheit ? 'fahrenheit' : 'celsius'}`
    );
    const { current } = await res.json();
    const icon = ICONS.find(([codes]) => codes.includes(current.weather_code))?.[1] ?? '';
    return `${icon} ${Math.round(current.temperature_2m)}°${fahrenheit ? 'F' : 'C'}`.trim();
  } catch {
    return null;
  }
}

/** Splits "/rant text", "#rant text" or plain text into a kind and a body. */
function parse(text: string): { kind: 'note' | 'rant'; body: string } {
  const rant = text.match(/^(?:\/rant(?:@\w+)?|#rant)\b\s*/i);
  if (rant) return { kind: 'rant', body: text.slice(rant[0].length).trim() };
  const note = text.match(/^\/note(?:@\w+)?\b\s*/i);
  if (note) return { kind: 'note', body: text.slice(note[0].length).trim() };
  return { kind: 'note', body: text.trim() };
}

const HELP = [
  'Anything you send becomes a Soapbox post.',
  'Photos too: the caption is the text, and an album is one post.',
  '',
  '/rant <text>: post it as a rant (or start with #rant)',
  '/note <text>: post it as a note',
  '/at <city>: stamp posts with that city and its weather',
  '/delete: hide the post you reply to, or the latest one',
  '/watch on|off: send me new Stickies notes and chat messages to hide',
  '',
  'Edit a message to edit its post.'
].join('\n');

// ---------- Moderation ----------
//
// The database sends each new Stickies note and public chat message here
// (supabase/migrations/20260930_moderation.sql), signed with a secret it
// made; the bot forwards it to the owner with a Hide button. The bot
// tells the database where it lives the first time the owner writes to
// it, and asks Telegram for button presses at the same time.

const SELF_URL = `${SUPABASE_URL}/functions/v1/soapbox-bot`;
let registered = false;

async function watching(): Promise<boolean> {
  const rows = await db('soapbox_settings?name=eq.watch&select=value');
  return rows?.[0]?.value !== false;
}

async function setWatching(on: boolean) {
  await db('soapbox_settings', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ name: 'watch', value: on })
  });
  await db('rpc/moderation_register', { method: 'POST', body: JSON.stringify({ p_url: on ? SELF_URL : null }) });
}

/** Once per instance: make sure notices come here, and that Telegram sends the buttons' presses. */
async function register() {
  if (registered) return;
  registered = true;
  try {
    if (await watching()) await db('rpc/moderation_register', { method: 'POST', body: JSON.stringify({ p_url: SELF_URL }) });
    await telegram('setWebhook', {
      url: SELF_URL,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message', 'edited_message', 'callback_query']
    });
  } catch (error) {
    // Without the moderation migration there's nothing to register; posting still works.
    console.error(error);
    registered = false;
  }
}

interface Notice {
  kind: 'note' | 'chat';
  id: string;
  author: string | null;
  text: string;
  room?: string;
}

const VALID_ID: Record<Notice['kind'], RegExp> = { note: /^[0-9a-f-]{36}$/, chat: /^\d{1,19}$/ };

const describe = (n: Pick<Notice, 'kind' | 'author' | 'room'>) =>
  n.kind === 'note' ? `📝 New Stickies note from ${n.author || 'someone'}` : `💬 ${n.author || 'Someone'} in #${n.room}`;

const buttons = (kind: Notice['kind'], id: string, hidden: boolean) => ({
  inline_keyboard: [[hidden ? { text: '↩︎ Show again', callback_data: `show:${kind}:${id}` } : { text: '🙈 Hide', callback_data: `hide:${kind}:${id}` }]]
});

/** A new note or chat message from the database: to the owner, with a Hide button. */
async function notice(n: Notice) {
  if (!VALID_ID[n.kind]?.test(n.id)) return;
  await telegram('sendMessage', {
    chat_id: OWNER_ID,
    text: `${describe(n)}\n\n${String(n.text).slice(0, 1000)}`,
    reply_markup: buttons(n.kind, n.id, false),
    link_preview_options: { is_disabled: true }
  });
}

interface Callback {
  id: string;
  from: { id: number };
  data?: string;
  message?: { chat: { id: number }; message_id: number; text?: string };
}

/** Hide or Show again, pressed on a notice. */
async function press(cb: Callback) {
  const [action, kind, id] = (cb.data ?? '').split(':') as ['hide' | 'show', Notice['kind'], string];
  if (!['hide', 'show'].includes(action) || !VALID_ID[kind]?.test(id)) return telegram('answerCallbackQuery', { callback_query_id: cb.id });
  const hide = action === 'hide';
  if (kind === 'note') {
    await db(`notes?id=eq.${id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ approved: !hide }) });
  } else {
    await db(`chat_messages?id=eq.${id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ hidden: hide }) });
  }
  await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: hide ? 'Hidden' : 'Shown again' });
  if (cb.message) {
    const original = (cb.message.text ?? '').replace(/\n\n(🙈 Hidden|↩︎ Shown again)$/, '');
    await telegram('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `${original}\n\n${hide ? '🙈 Hidden' : '↩︎ Shown again'}`,
      reply_markup: buttons(kind, id, hide)
    });
  }
}

interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface Message {
  message_id: number;
  from?: { id: number };
  chat: { id: number };
  text?: string;
  caption?: string;
  /** The same photo at several sizes, smallest first. */
  photo?: PhotoSize[];
  /** A file; an image sent "as a file" arrives this way. */
  document?: { file_id: string; file_unique_id: string; mime_type?: string; file_size?: number };
  /** Shared by the messages of an album. */
  media_group_id?: string;
  reply_to_message?: { message_id: number };
}

interface Picture {
  url: string;
  width: number;
  height: number;
  /** The Telegram message it came from, to keep an album in order. */
  message: number;
}

/** Telegram's Bot API. */
async function telegram(method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

/** Makes the public bucket photos go in, as the migration describes it. */
async function makeBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_BYTES, allowed_mime_types: Object.keys(IMAGE_TYPES) })
  });
  // Someone (another photo of the album) may have just made it.
  if (!res.ok && !/already exists|Duplicate/i.test(await res.text())) throw new Error(`bucket: ${res.status}`);
}

/** The width and height of a PNG, GIF, WebP or JPEG, read from its header; zeros if unknown. */
function dimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  try {
    if (ascii(1, 3) === 'PNG') return { width: view.getUint32(16), height: view.getUint32(20) };
    if (ascii(0, 3) === 'GIF') return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      const chunk = ascii(12, 4);
      if (chunk === 'VP8X') return { width: 1 + (view.getUint32(24, true) & 0xffffff), height: 1 + (view.getUint32(27, true) & 0xffffff) };
      if (chunk === 'VP8L') {
        const b = view.getUint32(21, true);
        return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
      }
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    // JPEG: walk the segments to a start-of-frame.
    let at = 2;
    while (at < bytes.length) {
      const marker = bytes[at + 1];
      const length = view.getUint16(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
      }
      at += 2 + length;
    }
  } catch {}
  return { width: 0, height: 0 };
}

/** The picture in a message (its largest photo size, or an image file), copied into storage; null if there's none. */
async function pictureOf(message: Message): Promise<Picture | null | 'unsupported'> {
  let file: { file_id: string; file_unique_id: string } | null = null;
  let ext = 'jpg';
  let type = 'image/jpeg';
  let size = { width: 0, height: 0 };
  if (message.photo?.length) {
    const fits = message.photo.filter((p) => (p.file_size ?? 0) <= MAX_BYTES);
    const best = (fits.length ? fits : message.photo).reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    file = best;
    size = { width: best.width, height: best.height };
  } else if (message.document) {
    const mime = message.document.mime_type ?? '';
    if (!IMAGE_TYPES[mime]) return 'unsupported';
    if ((message.document.file_size ?? 0) > MAX_BYTES) return 'unsupported';
    file = message.document;
    ext = IMAGE_TYPES[mime];
    type = mime;
  }
  if (!file) return null;

  const { file_path } = await telegram('getFile', { file_id: file.file_id });
  const download = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}`);
  if (!download.ok) throw new Error(`download: ${download.status}`);
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (bytes.length > MAX_BYTES) return 'unsupported';
  if (!size.width) size = dimensions(bytes);

  const path = `${new Date().toISOString().slice(0, 7)}/${message.message_id}-${file.file_unique_id}.${ext}`;
  const put = () =>
    fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': type, 'x-upsert': 'true' },
      body: bytes
    });
  let upload = await put();
  // No bucket yet (the migration's insert into storage.buckets doesn't take on every project): make it, then try again.
  if (!upload.ok) {
    const text = await upload.text();
    if (!/NoSuchBucket|Bucket not found/i.test(text)) throw new Error(`upload: ${upload.status} ${text}`);
    await makeBucket();
    upload = await put();
    if (!upload.ok) throw new Error(`upload: ${upload.status} ${await upload.text()}`);
  }
  return { url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`, ...size, message: message.message_id };
}

async function handle(message: Message, edited: boolean) {
  const chat = message.chat.id;
  const text = (message.text ?? message.caption ?? '').trim();
  const hasPicture = Boolean(message.photo?.length || message.document);

  if (hasPicture && !edited) return postPicture(message, text);
  if (!text) {
    if (edited) return;
    return reply(chat, 'Send text or a photo. (Stickers, voice and video can’t go on the Soapbox yet.)', message.message_id);
  }

  if (edited) {
    const { body } = parse(text);
    if (!body) return;
    await db(`soapbox_posts?telegram_message_id=eq.${message.message_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body })
    });
    return;
  }

  if (/^\/(start|help)\b/i.test(text)) return reply(chat, HELP);

  const watch = text.match(/^\/watch(?:@\w+)?\b\s*(on|off)?\s*$/i);
  if (watch) {
    if (watch[1]) await setWatching(watch[1].toLowerCase() === 'on');
    const on = watch[1] ? watch[1].toLowerCase() === 'on' : await watching();
    return reply(chat, on ? '👀 New Stickies notes and public chat messages come here, with a Hide button. /watch off to stop.' : 'Not sending notes and chat messages here. /watch on to start.');
  }

  const at = text.match(/^\/at(?:@\w+)?\b\s*(.*)$/i);
  if (at) {
    if (!at[1]) {
      const place = await currentPlace();
      return reply(chat, `Posts are stamped with ${place.city}. Change it with /at <city>.`);
    }
    const place = await findPlace(at[1]);
    if (!place) return reply(chat, `Couldn’t find “${at[1]}”.`, message.message_id);
    await db('soapbox_settings', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ name: 'place', value: place })
    });
    return reply(chat, `📍 Posts are now stamped with ${place.city}.`);
  }

  if (/^\/delete\b/i.test(text)) {
    // The post replied to: either the original message or the bot's confirmation of it.
    const target = message.reply_to_message?.message_id;
    const filter = target
      ? `telegram_message_id=in.(${target},${target - 1})&order=created_at.desc&limit=1`
      : 'hidden=eq.false&order=created_at.desc&limit=1';
    const [post] = (await db(`soapbox_posts?${filter}&select=id,body,images`)) ?? [];
    if (!post) return reply(chat, 'Nothing to delete.', message.message_id);
    await db(`soapbox_posts?id=eq.${post.id}`, { method: 'PATCH', body: JSON.stringify({ hidden: true }) });
    const what = post.body.trim()
      ? `“${post.body.slice(0, 60)}${post.body.length > 60 ? '…' : ''}”`
      : `a post with ${post.images?.length === 1 ? 'a photo' : `${post.images?.length ?? 0} photos`}`;
    return reply(chat, `🗑 Hidden: ${what}`);
  }

  if (text.startsWith('/') && !/^\/(rant|note)\b/i.test(text)) return reply(chat, HELP);

  const { kind, body } = parse(text);
  if (!body) return reply(chat, 'Say something after the command.', message.message_id);
  if (body.length > 2000) return reply(chat, 'That’s over 2000 characters. Split it up?', message.message_id);

  const place = await currentPlace();
  const weather = await weatherAt(place);
  await db('soapbox_posts', {
    method: 'POST',
    body: JSON.stringify({ body, kind, place: place.city, weather, telegram_message_id: message.message_id })
  });
  await reply(
    chat,
    `${kind === 'rant' ? '🔥 Rant' : '📝 Note'} posted · ${place.city}${weather ? ` ${weather}` : ''}\n${SITE}`,
    message.message_id
  );
}

/** A photo (or one of an album's), with its caption as the text. */
async function postPicture(message: Message, caption: string) {
  const chat = message.chat.id;
  const picture = await pictureOf(message);
  if (picture === 'unsupported') {
    return reply(chat, 'That file isn’t a picture the Soapbox can show (JPEG, PNG, WebP or GIF, up to 10 MB).', message.message_id);
  }
  if (!picture) return;
  const { kind, body } = parse(caption);
  if (body.length > 2000) return reply(chat, 'That caption is over 2000 characters.', message.message_id);

  const place = await currentPlace();
  const weather = await weatherAt(place);
  const rows = await db('rpc/soapbox_add_images', {
    method: 'POST',
    body: JSON.stringify({
      p_group: message.media_group_id ?? null,
      p_message: message.message_id,
      p_body: body,
      p_kind: kind,
      p_place: place.city,
      p_weather: weather,
      p_images: [picture]
    })
  });
  // An album is many messages; answer once, for the one that made the post.
  if (!rows?.[0]?.created) return;
  await reply(
    chat,
    `${kind === 'rant' ? '🔥 Rant' : '📝 Note'} with ${message.media_group_id ? 'photos' : 'a photo'} posted · ${place.city}${weather ? ` ${weather}` : ''}\n${SITE}`,
    message.message_id
  );
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });

  // A notice from the database, signed with the secret it made.
  const signature = request.headers.get('x-moderation-secret');
  if (signature) {
    try {
      const ok = await db('rpc/moderation_check', { method: 'POST', body: JSON.stringify({ p_secret: signature }) });
      if (ok !== true) return new Response('Not found', { status: 404 });
      await notice(await request.json());
    } catch (error) {
      console.error(error);
    }
    return new Response('ok');
  }

  if (request.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('Not found', { status: 404 });
  }
  const update = await request.json();

  if (update.callback_query) {
    const cb: Callback = update.callback_query;
    if (cb.from?.id === OWNER_ID) await press(cb).catch((error) => console.error(error));
    return new Response('ok');
  }

  const message: Message | undefined = update.message ?? update.edited_message;
  // Everyone but the owner is ignored, silently.
  if (message && message.from?.id === OWNER_ID) {
    await register();
    try {
      await handle(message, Boolean(update.edited_message));
    } catch (error) {
      console.error(error);
      // Only the owner gets here, so say what went wrong: which step, and what the server answered.
      const reason = error instanceof Error ? error.message.slice(0, 300) : String(error);
      await reply(message.chat.id, `Something went wrong; the post wasn’t saved.\n\n${reason}`).catch(() => {});
    }
  }
  // Always 200, so Telegram doesn't retry.
  return new Response('ok');
});
