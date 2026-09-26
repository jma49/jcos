// Tests for the Soapbox bot (`npm test`, with Vitest): index.ts is
// loaded with a stand-in for Deno, and Telegram, Supabase and the weather
// service are replaced by an in-memory fake, so every path can be walked
// without a network or a real bot.

import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

const OWNER = 42;
const SECRET = 'webhook-secret';
const env = {
  TELEGRAM_BOT_TOKEN: 'TOKEN',
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  TELEGRAM_OWNER_ID: String(OWNER),
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'KEY'
};

// A 2 × 3 PNG, and a JPEG with only its header.
const PNG = Buffer.from('89504E470D0A1A0A0000000D4948445200000002000000030806000000', 'hex');
const JPEG = Buffer.from('FFD8FFE000104A46494600010100000100010000FFC0001108000500070301110002110103110100', 'hex');

/** Everything the fake services saw and hold. */
let world;
beforeEach(() => {
  world = { replies: [], sent: [], uploads: [], posts: [], groups: new Map(), patches: [], bucket: true, settings: {}, moderation: null, webhook: null, answered: [], edits: [], failRpc: false };
});

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  const tg = url.match(/api\.telegram\.org\/botTOKEN\/(\w+)/);
  if (tg) {
    const [, call] = tg;
    if (call === 'getFile') return json({ ok: true, result: { file_path: `files/${body.file_id}` } });
    if (call === 'sendMessage' && body.chat_id === OWNER && body.reply_markup) world.sent.push(body);
    else if (call === 'sendMessage') world.replies.push(body.text);
    if (call === 'setWebhook') world.webhook = body;
    if (call === 'answerCallbackQuery') world.answered.push(body);
    if (call === 'editMessageText') world.edits.push(body);
    return json({ ok: true, result: {} });
  }
  if (url.includes('api.telegram.org/file/botTOKEN/')) return new Response(url.includes('png') ? PNG : JPEG);
  if (url.includes('geocoding-api.open-meteo')) {
    return json({ results: [{ name: 'Tokyo', country_code: 'JP', latitude: 35.7, longitude: 139.7, timezone: 'Asia/Tokyo' }] });
  }
  if (url.includes('open-meteo')) return json({ current: { temperature_2m: 71.2, weather_code: 0 } });
  if (url.endsWith('/storage/v1/bucket')) {
    world.bucket = true;
    return json({ name: body.id });
  }
  if (url.includes('/storage/v1/object/soapbox/')) {
    if (!world.bucket) return json({ statusCode: '404', error: 'Bucket not found', code: 'NoSuchBucket' }, 400);
    world.uploads.push({ path: url.split('soapbox/')[1], type: init.headers['content-type'] });
    return json({ Key: 'x' });
  }
  const rest = url.match(/db\.example\/rest\/v1\/(.*)$/)?.[1];
  if (rest?.startsWith('rpc/soapbox_add_images')) {
    if (world.failRpc) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    const existing = body.p_group && world.groups.get(body.p_group);
    if (existing) {
      existing.images.push(...body.p_images);
      if (body.p_body) Object.assign(existing, { body: body.p_body, kind: body.p_kind });
      return json([{ id: existing.id, created: false }]);
    }
    const post = { id: `p${world.posts.length}`, body: body.p_body, kind: body.p_kind, images: [...body.p_images], message: body.p_message };
    world.posts.push(post);
    if (body.p_group) world.groups.set(body.p_group, post);
    return json([{ id: post.id, created: true }]);
  }
  if (rest?.startsWith('rpc/moderation_register')) {
    world.moderation = body.p_url;
    return new Response(null, { status: 204 });
  }
  if (rest?.startsWith('rpc/moderation_check')) return json(body.p_secret === 'db-secret');
  if (rest?.startsWith('soapbox_settings')) {
    if (method === 'POST') {
      world.settings[body.name] = body.value;
      return new Response(null, { status: 201 });
    }
    const name = rest.match(/name=eq\.(\w+)/)?.[1];
    return json(name in world.settings ? [{ value: world.settings[name] }] : []);
  }
  if (rest?.startsWith('soapbox_posts') && method === 'POST') {
    world.posts.push({ id: `p${world.posts.length}`, ...body, images: [] });
    return json([body]);
  }
  if (rest?.startsWith('soapbox_posts?') && method === 'GET') return json([{ id: 'p9', body: '', images: [{}, {}] }]);
  if (method === 'PATCH') {
    world.patches.push({ path: rest, body });
    return new Response(null, { status: 204 });
  }
  throw new Error(`unexpected request: ${method} ${url}`);
};

let handler;
globalThis.Deno = { env: { get: (name) => env[name] }, serve: (h) => (handler = h) };
await import('./index.ts');

const call = (payload, headers = { 'x-telegram-bot-api-secret-token': SECRET }) =>
  handler(new Request('https://fn.example', { method: 'POST', headers, body: JSON.stringify(payload) }));
const me = { from: { id: OWNER }, chat: { id: OWNER } };
const send = (message) => call({ message: { ...me, ...message } });
const photo = (id) => [
  { file_id: `${id}-small`, file_unique_id: `${id}s`, width: 90, height: 60, file_size: 1000 },
  { file_id: `${id}-large`, file_unique_id: `${id}l`, width: 1280, height: 853, file_size: 200000 }
];

test('text becomes a note, #rant a rant', async () => {
  await send({ message_id: 1, text: 'hello' });
  await send({ message_id: 2, text: '#rant the bus was late' });
  assert.deepEqual(world.posts.map((p) => [p.body, p.kind]), [['hello', 'note'], ['the bus was late', 'rant']]);
  assert.match(world.replies[0], /Note posted/);
});

test('/at stamps later posts with a city (an insert answered with no body)', async () => {
  await send({ message_id: 70, text: '/at Tokyo' });
  assert.equal(world.settings.place.city, 'Tokyo');
  assert.match(world.replies.at(-1), /stamped with Tokyo/);
  await send({ message_id: 71, text: 'hello from Japan' });
  assert.equal(world.posts[0].place, 'Tokyo');
  assert.match(world.replies.at(-1), /Tokyo ☀️ 71°C/);
});

test('a photo is uploaded at its largest size and posted with its caption', async () => {
  await send({ message_id: 3, photo: photo('a'), caption: '#rant rain again' });
  assert.equal(world.uploads.length, 1);
  assert.match(world.uploads[0].path, /3-al\.jpg$/);
  assert.equal(world.posts[0].kind, 'rant');
  assert.equal(world.posts[0].body, 'rain again');
  assert.deepEqual([world.posts[0].images[0].width, world.posts[0].images[0].height], [1280, 853]);
  assert.match(world.replies.at(-1), /Rant with a photo posted/);
});

test('an album arriving out of order is one post, answered once', async () => {
  await Promise.all([
    send({ message_id: 11, media_group_id: 'G', photo: photo('b') }),
    send({ message_id: 10, media_group_id: 'G', photo: photo('a'), caption: 'Tahoe' }),
    send({ message_id: 12, media_group_id: 'G', photo: photo('c') })
  ]);
  assert.equal(world.posts.length, 1);
  assert.equal(world.posts[0].body, 'Tahoe');
  assert.equal(world.posts[0].images.length, 3);
  assert.equal(world.replies.filter((r) => /posted/.test(r)).length, 1);
});

test('an image sent as a file is sized from its header; other files are refused', async () => {
  await send({ message_id: 20, document: { file_id: 'doc-png', file_unique_id: 'd1', mime_type: 'image/png', file_size: 30 } });
  assert.deepEqual([world.posts[0].images[0].width, world.posts[0].images[0].height], [2, 3]);
  await send({ message_id: 21, document: { file_id: 'doc-pdf', file_unique_id: 'd2', mime_type: 'application/pdf', file_size: 30 } });
  assert.match(world.replies.at(-1), /isn’t a picture/);
  await send({ message_id: 22, sticker: { file_id: 's' } });
  assert.match(world.replies.at(-1), /Stickers, voice and video/);
});

test('a missing bucket is made, then the upload goes through', async () => {
  world.bucket = false;
  await send({ message_id: 30, photo: photo('z') });
  assert.equal(world.bucket, true);
  assert.equal(world.uploads.length, 1);
  assert.equal(world.posts.length, 1);
});

test('a failure tells the owner why', async () => {
  world.failRpc = true;
  await send({ message_id: 31, photo: photo('y') });
  assert.match(world.replies.at(-1), /Something went wrong[\s\S]*rpc\/soapbox_add_images: 404/);
});

test('editing a caption edits the post, and /delete says what it hid', async () => {
  await call({ edited_message: { ...me, message_id: 3, photo: photo('a'), caption: 'sun, actually' } });
  assert.deepEqual(world.patches[0], { path: 'soapbox_posts?telegram_message_id=eq.3', body: { body: 'sun, actually' } });
  await send({ message_id: 40, text: '/delete', reply_to_message: { message_id: 10 } });
  assert.match(world.replies.at(-1), /Hidden: a post with 2 photos/);
});

test('strangers and unsigned requests are ignored', async () => {
  await call({ message: { from: { id: 7 }, chat: { id: 7 }, message_id: 50, text: 'hi' } });
  const res = await call({ message: { ...me, message_id: 51, text: 'hi' } }, {});
  assert.equal(res.status, 404);
  assert.equal(world.posts.length, 0);
  assert.equal(world.replies.length, 0);
});

test('the first message registers for notices and button presses', async () => {
  await send({ message_id: 60, text: '/help' });
  // An instance registers once; this test runs in the same instance as the ones above, so check what it asked for.
  await send({ message_id: 61, text: '/watch on' });
  assert.equal(world.moderation, 'https://db.example/functions/v1/soapbox-bot');
  assert.match(world.replies.at(-1), /come here/);
  await send({ message_id: 62, text: '/watch off' });
  assert.equal(world.moderation, null);
  assert.equal(world.settings.watch, false);
});

test('a signed notice reaches the owner with a Hide button; a forged one does not', async () => {
  await call({ kind: 'chat', id: '8', author: 'alice', text: 'hi lobby', room: 'lobby' }, { 'x-moderation-secret': 'db-secret' });
  assert.equal(world.sent.length, 1);
  assert.match(world.sent[0].text, /alice in #lobby/);
  assert.equal(world.sent[0].reply_markup.inline_keyboard[0][0].callback_data, 'hide:chat:8');
  const forged = await call({ kind: 'chat', id: '9', author: 'x', text: 'spam', room: 'lobby' }, { 'x-moderation-secret': 'guess' });
  assert.equal(forged.status, 404);
  assert.equal(world.sent.length, 1);
});

test('Hide and Show again change the row and the notice', async () => {
  const cb = (data) => ({ callback_query: { id: 'q', from: { id: OWNER }, data, message: { chat: { id: OWNER }, message_id: 5, text: '📝 New Stickies note from bob\n\nhello' } } });
  const id = '0f8a7c2e-1111-4222-8333-444455556666';
  await call(cb(`hide:note:${id}`));
  assert.deepEqual(world.patches.at(-1), { path: `notes?id=eq.${id}`, body: { approved: false } });
  assert.match(world.edits.at(-1).text, /🙈 Hidden$/);
  assert.equal(world.edits.at(-1).reply_markup.inline_keyboard[0][0].callback_data, `show:note:${id}`);
  await call(cb('show:chat:8'));
  assert.deepEqual(world.patches.at(-1), { path: 'chat_messages?id=eq.8', body: { hidden: false } });
  // A stranger's press, or a malformed one, changes nothing.
  const before = world.patches.length;
  await call({ callback_query: { id: 'q', from: { id: 7 }, data: `hide:note:${id}` } });
  await call(cb('hide:note:../../etc'));
  assert.equal(world.patches.length, before);
});
