// Soapbox bot: a Telegram webhook that turns Jincheng's messages into posts
// on the JM/OS Soapbox. Runs as a Supabase Edge Function (Deno).
//
// Only messages from TELEGRAM_OWNER_ID are accepted, and only requests that
// carry TELEGRAM_WEBHOOK_SECRET in the header Telegram adds. Posts are
// written with the service role key, which never leaves this function.
//
//   any text          post it as a note
//   /rant <text>      post it as a rant (so does text starting with #rant)
//   /note <text>      post it as a note
//   /at <city>        stamp later posts with this city and its weather
//   /at               show the current city
//   /delete           hide the post you reply to, or the latest one
//   /help             this list
//
// Editing a message in Telegram edits its post. Setup is in
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
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
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
  '',
  '/rant <text>: post it as a rant (or start with #rant)',
  '/note <text>: post it as a note',
  '/at <city>: stamp posts with that city and its weather',
  '/delete: hide the post you reply to, or the latest one',
  '',
  'Edit a message to edit its post.'
].join('\n');

interface Message {
  message_id: number;
  from?: { id: number };
  chat: { id: number };
  text?: string;
  reply_to_message?: { message_id: number };
}

async function handle(message: Message, edited: boolean) {
  const chat = message.chat.id;
  const text = message.text?.trim();
  if (!text) return reply(chat, 'Only text for now.', message.message_id);

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
    const [post] = (await db(`soapbox_posts?${filter}&select=id,body`)) ?? [];
    if (!post) return reply(chat, 'Nothing to delete.', message.message_id);
    await db(`soapbox_posts?id=eq.${post.id}`, { method: 'PATCH', body: JSON.stringify({ hidden: true }) });
    return reply(chat, `🗑 Hidden: “${post.body.slice(0, 60)}${post.body.length > 60 ? '…' : ''}”`);
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

Deno.serve(async (request) => {
  if (request.method !== 'POST' || request.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('Not found', { status: 404 });
  }
  const update = await request.json();
  const message: Message | undefined = update.message ?? update.edited_message;
  // Everyone but the owner is ignored, silently.
  if (message && message.from?.id === OWNER_ID) {
    try {
      await handle(message, Boolean(update.edited_message));
    } catch (error) {
      console.error(error);
      await reply(message.chat.id, 'Something went wrong; the post wasn’t saved.').catch(() => {});
    }
  }
  // Always 200, so Telegram doesn't retry.
  return new Response('ok');
});
