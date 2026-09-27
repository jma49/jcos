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
  // The music library: its songs, drafts and limit, and what YouTube, Apple Music and lrclib say.
  Object.assign(world, { songs: [], music: { song_limit: 200 }, fetched: [], youtube: {}, itunes: [], lrclib: [] });
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
    if (call === 'sendMessage' && body.chat_id === OWNER && body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('song:')) world.replies.push(body.text), world.sent.push(body);
    else if (call === 'sendMessage' && body.chat_id === OWNER && body.reply_markup) world.sent.push(body);
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
  // What the music commands look up. Every address they fetch is recorded.
  if (/youtube\.com\/oembed|itunes\.apple\.com|lrclib\.net/.test(url)) world.fetched.push(url);
  if (url.startsWith('https://www.youtube.com/oembed?')) {
    const id = new URL(new URL(url).searchParams.get('url')).searchParams.get('v');
    const video = world.youtube[id];
    return video === 401 ? new Response('Unauthorized', { status: 401 }) : video ? json(video) : new Response('Not Found', { status: 404 });
  }
  if (url.startsWith('https://itunes.apple.com/search?')) return json({ resultCount: world.itunes.length, results: world.itunes });
  if (url.startsWith('https://lrclib.net/api/search?')) return json(world.lrclib);
  if (url.endsWith('/rest/v1/rpc/music_play')) return (world.playing = body.p_song), json({ song_id: body.p_song });
  if (url.endsWith('/rest/v1/rpc/music_stop')) return (world.playing = null), new Response(null, { status: 204 });
  const music = url.match(/db\.example\/rest\/v1\/(songs|music_settings)(\?.*)?$/);
  if (music) {
    const [, table, query = ''] = music;
    const params = new URLSearchParams(query.slice(1));
    const eq = (key) => params.get(key)?.replace(/^eq\./, '');
    if (table === 'music_settings') {
      const name = eq('name');
      if (method === 'POST') return (world.music[body.name] = body.value), new Response(null, { status: 201 });
      if (method === 'DELETE') return delete world.music[name], new Response(null, { status: 204 });
      return json(name in world.music ? [{ value: world.music[name] }] : []);
    }
    if (method === 'POST') {
      if (world.songs.length >= world.music.song_limit) return json({ code: 'P0429', message: `The library is full (${world.music.song_limit} songs). Remove one first.` }, 400);
      if (world.songs.some((s) => s.id === body.id)) return json({ code: '23505', message: 'duplicate key value violates unique constraint "songs_pkey"' }, 409);
      world.songs.push(body);
      return new Response(null, { status: 201 });
    }
    const id = eq('id');
    const title = params.get('title')?.replace(/^ilike\.\*|\*$/g, '');
    const matching = world.songs.filter((s) => (id ? s.id === id : title ? s.title.toLowerCase().includes(title.toLowerCase()) : true));
    if (method === 'DELETE') return (world.songs = world.songs.filter((s) => !matching.includes(s))), new Response(null, { status: 204 });
    if (method === 'PATCH') return matching.forEach((s) => Object.assign(s, body)), new Response(null, { status: 204 });
    return json(matching);
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

// ---------- The music library ----------

const NINGXIA = 'OxtZF0WGXtE';
const press = (data, text = '') => call({ callback_query: { id: 'cb', from: { id: OWNER }, data, message: { chat: { id: OWNER }, message_id: 900, text } } });
const addButtons = () => world.sent.at(-1).reply_markup.inline_keyboard[0].map((b) => b.callback_data);

test('/add looks a video up, shows what it found, and adds it when told to', async () => {
  world.youtube[NINGXIA] = { title: '梁靜茹 Fish Leong【寧夏】Official MV', author_name: 'Rock Records' };
  world.itunes = [
    { trackName: '寧夏', artistName: '梁靜茹', collectionName: '燕尾蝶', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg', trackTimeMillis: 252000 }
  ];
  world.lrclib = [{ syncedLyrics: '[00:12.00] 宁静夏天' }];
  await send({ message_id: 200, text: `/add https://youtu.be/${NINGXIA}?si=share` });
  assert.match(world.replies.at(-1), /寧夏 — 梁靜茹 · 燕尾蝶 · 4:12/);
  assert.match(world.replies.at(-1), /Cover: Apple Music/);
  assert.match(world.replies.at(-1), /Lyrics: synced/);
  assert.deepEqual(addButtons(), [`song:add:${NINGXIA}`, `song:cancel:${NINGXIA}`]);
  assert.equal(world.songs.length, 0, 'nothing is added before Add is pressed');

  await press(`song:add:${NINGXIA}`, world.replies.at(-1));
  assert.deepEqual(world.songs, [
    { id: NINGXIA, title: '寧夏', artist: '梁靜茹', album: '燕尾蝶', cover: 'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg', duration_ms: 252000 }
  ]);
  assert.match(world.edits.at(-1).text, /✅ Added\. 1\/200 songs/);
  assert.equal(world.music[`draft:${NINGXIA}`], undefined, 'the draft is gone');

  await press(`song:add:${NINGXIA}`);
  assert.equal(world.songs.length, 1, 'pressing Add twice adds it once');
});

test('/add only ever fetches addresses it built, from the video id', async () => {
  world.youtube[NINGXIA] = { title: 'x', author_name: 'y - Topic' };
  await send({ message_id: 201, text: `/add https://www.youtube.com/watch?v=${NINGXIA}&redirect=http://169.254.169.254/` });
  for (const url of world.fetched) {
    assert.match(new URL(url).hostname, /^(www\.youtube\.com|itunes\.apple\.com|lrclib\.net)$/);
    assert.doesNotMatch(url, /169\.254/);
  }
  await send({ message_id: 202, text: '/add https://evil.example.com/watch?v=OxtZF0WGXtE' });
  assert.match(world.replies.at(-1), /Send a YouTube link/);
});

test('/add says why a video can’t be added', async () => {
  world.youtube.AAAAAAAAAAA = 401;
  await send({ message_id: 203, text: '/add https://youtu.be/AAAAAAAAAAA' });
  assert.match(world.replies.at(-1), /embedding off/);
  await send({ message_id: 204, text: '/add https://youtu.be/BBBBBBBBBBB' });
  assert.match(world.replies.at(-1), /doesn’t know that video/);
  world.songs.push({ id: NINGXIA, title: '寧夏', artist: '梁靜茹' });
  await send({ message_id: 205, text: `/add ${NINGXIA}` });
  assert.match(world.replies.at(-1), /already in the library/);
});

test('a full library refuses a new song, before and after the preview', async () => {
  world.music.song_limit = 1;
  world.songs.push({ id: 'CCCCCCCCCCC', title: 'One', artist: 'A' });
  await send({ message_id: 206, text: `/add ${NINGXIA}` });
  assert.match(world.replies.at(-1), /library is full \(1 songs\)/);

  // Filled up while the preview was waiting: the database refuses it.
  world.music.song_limit = 2;
  world.youtube[NINGXIA] = { title: '寧夏', author_name: '梁靜茹 - Topic' };
  await send({ message_id: 207, text: `/add ${NINGXIA}` });
  world.songs.push({ id: 'DDDDDDDDDDD', title: 'Two', artist: 'B' });
  await press(`song:add:${NINGXIA}`, 'preview');
  assert.equal(world.songs.length, 2);
  assert.match(world.edits.at(-1).text, /library is full \(2 songs\)/);
});

test('Cancel adds nothing; without Apple Music the video’s own title and thumbnail do', async () => {
  world.youtube[NINGXIA] = { title: '寧夏', author_name: '梁靜茹 - Topic' };
  await send({ message_id: 208, text: `/add ${NINGXIA}` });
  assert.match(world.replies.at(-1), /寧夏 — 梁靜茹/);
  assert.match(world.replies.at(-1), /the video’s thumbnail/);
  assert.equal(world.music[`draft:${NINGXIA}`].cover, `https://i.ytimg.com/vi/${NINGXIA}/hqdefault.jpg`);
  await press(`song:cancel:${NINGXIA}`, 'preview');
  assert.equal(world.songs.length, 0);
  assert.match(world.edits.at(-1).text, /Not added/);
});

test('/songs, /remove and /offset find a song by title or id', async () => {
  world.songs.push({ id: NINGXIA, title: '寧夏', artist: '梁靜茹' }, { id: 'EEEEEEEEEEE', title: '夏天', artist: 'C' });
  await send({ message_id: 209, text: '/songs' });
  assert.match(world.replies.at(-1), /2\/200 songs/);

  await send({ message_id: 210, text: '/offset 夏 850' });
  assert.match(world.replies.at(-1), /Which one\?/, 'two titles match: it asks rather than guess');
  await send({ message_id: 211, text: '/offset 寧夏 -850' });
  assert.equal(world.songs[0].lyrics_offset, -850);
  assert.match(world.replies.at(-1), /850 ms behind/);
  await send({ message_id: 212, text: '/offset 寧夏 99999' });
  assert.match(world.replies.at(-1), /within 30 seconds/);

  await send({ message_id: 213, text: `/remove ${NINGXIA}` });
  assert.deepEqual(world.songs.map((s) => s.id), ['EEEEEEEEEEE']);
  assert.match(world.replies.at(-1), /Removed 寧夏 — 梁靜茹\. 1\/200 songs/);
  await send({ message_id: 214, text: '/remove nothing like it' });
  assert.match(world.replies.at(-1), /No song matches/);
});

test('someone else’s /add is ignored', async () => {
  await call({ message: { from: { id: 7 }, chat: { id: 7 }, message_id: 215, text: `/add ${NINGXIA}` } });
  await call({ callback_query: { id: 'cb', from: { id: 7 }, data: `song:add:${NINGXIA}` } });
  assert.equal(world.fetched.length, 0);
  assert.equal(world.songs.length, 0);
});

test('/play plays a song for everyone, learning its length first; /stop stops it', async () => {
  world.songs.push({ id: NINGXIA, title: '寧夏', artist: '梁靜茹', duration_ms: null });
  world.lrclib = [{ duration: 252.4, syncedLyrics: '[00:12.00] …' }];
  await send({ message_id: 216, text: '/play 寧夏' });
  assert.equal(world.playing, NINGXIA);
  assert.equal(world.songs[0].duration_ms, 252400);
  assert.match(world.replies.at(-1), /Playing 寧夏 — 梁靜茹 for everyone on the desktop \(4:12\)/);
  await send({ message_id: 217, text: '/stop' });
  assert.equal(world.playing, null);
  assert.match(world.replies.at(-1), /Stopped/);
  await send({ message_id: 218, text: '/play nothing like it' });
  assert.match(world.replies.at(-1), /No song matches/);
});
