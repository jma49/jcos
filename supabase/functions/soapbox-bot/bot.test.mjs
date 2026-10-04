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
  // DVD Player's shelf, its limit, and the videos YouTube has a full-size thumbnail for.
  Object.assign(world, { discs: [], maxres: new Set() });
  world.music.disc_limit = 200;
  // Jincheng's diary and documents, and a name another save takes first (a race).
  Object.assign(world, { diary: [], documents: [], takenMeanwhile: null });
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
    if (call === 'editMessageReplyMarkup') (world.cleared ??= []).push(body.message_id);
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
  if (/youtube\.com\/oembed|itunes\.apple\.com|lrclib\.net|i\.ytimg\.com/.test(url)) world.fetched.push(url);
  const thumb = url.match(/^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\/maxresdefault\.jpg$/);
  if (thumb) return new Response(null, { status: world.maxres.has(thumb[1]) ? 200 : 404 });
  if (url.startsWith('https://www.youtube.com/oembed?')) {
    const id = new URL(new URL(url).searchParams.get('url')).searchParams.get('v');
    const video = world.youtube[id];
    return video === 401 ? new Response('Unauthorized', { status: 401 }) : video ? json(video) : new Response('Not Found', { status: 404 });
  }
  if (url.startsWith('https://itunes.apple.com/search?')) return json({ resultCount: world.itunes.length, results: world.itunes });
  if (url.startsWith('https://lrclib.net/api/search?')) return json(world.lrclib);
  if (url.endsWith('/rest/v1/rpc/music_play')) return (world.playing = body.p_song), json({ song_id: body.p_song });
  if (url.endsWith('/rest/v1/rpc/music_stop')) return (world.playing = null), new Response(null, { status: 204 });
  const shelf = url.match(/db\.example\/rest\/v1\/discs(\?.*)?$/);
  if (shelf) {
    const params = new URLSearchParams((shelf[1] ?? '').slice(1));
    if (method === 'POST') {
      if (world.discs.length >= world.music.disc_limit) return json({ code: 'P0429', message: `The shelf is full (${world.music.disc_limit} discs). Remove one first.` }, 400);
      if (world.discs.some((d) => d.id === body.id)) return json({ code: '23505', message: 'duplicate key value violates unique constraint "discs_pkey"' }, 409);
      world.discs.push(body);
      return new Response(null, { status: 201 });
    }
    const id = params.get('id')?.replace(/^eq\./, '');
    const title = params.get('title')?.replace(/^ilike\.\*|\*$/g, '');
    const matching = world.discs.filter((d) => (id ? d.id === id : title ? d.title.toLowerCase().includes(title.toLowerCase()) : true));
    if (method === 'DELETE') return (world.discs = world.discs.filter((d) => !matching.includes(d))), new Response(null, { status: 204 });
    if (method === 'PATCH') return matching.forEach((d) => Object.assign(d, body)), new Response(null, { status: 204 });
    return json(params.get('order') === 'added_at.desc' ? [...matching].reverse() : matching);
  }
  const home = url.match(/db\.example\/rest\/v1\/(diary|documents)(\?.*)?$/);
  if (home) {
    const [, table, query = ''] = home;
    const params = new URLSearchParams(query.slice(1));
    const eq = (key) => params.get(key)?.replace(/^eq\./, '');
    const rows = world[table];
    if (method === 'POST') {
      // As the unique indexes do: a message once, a name once in a folder whatever its case.
      if (rows.some((r) => r.telegram_message_id === body.telegram_message_id)) {
        return json({ code: '23505', message: `duplicate key value violates unique constraint "${table}_telegram_message"` }, 409);
      }
      if (table === 'documents' && world.takenMeanwhile === body.name) {
        world.takenMeanwhile = null;
        rows.push({ folder: body.folder, name: body.name, body: 'saved by someone else first' });
      }
      if (table === 'documents' && rows.some((r) => r.folder === body.folder && r.name.toLowerCase() === body.name.toLowerCase())) {
        return json({ code: '23505', message: 'duplicate key value violates unique constraint "documents_name"' }, 409);
      }
      rows.push({ ...body, created_at: new Date(Date.UTC(2026, 8, 29, 20, rows.length)).toISOString() });
      return new Response(null, { status: 201 });
    }
    const matching = rows.filter(
      (r) =>
        (!eq('telegram_message_id') || String(r.telegram_message_id) === eq('telegram_message_id')) &&
        (!eq('day') || r.day === eq('day')) &&
        (!eq('folder') || r.folder === eq('folder'))
    );
    if (method === 'PATCH') return matching.forEach((r) => Object.assign(r, body)), new Response(null, { status: 204 });
    return json(params.get('order') === 'created_at.desc' ? [...matching].reverse() : matching);
  }
  const music = url.match(/db\.example\/rest\/v1\/(songs|music_settings)(\?.*)?$/);
  if (music) {
    const [, table, query = ''] = music;
    const params = new URLSearchParams(query.slice(1));
    const eq = (key) => params.get(key)?.replace(/^eq\./, '');
    if (table === 'music_settings') {
      const name = eq('name');
      if (method === 'POST') return (world.music[body.name] = body.value), new Response(null, { status: 201 });
      if (method === 'DELETE' && params.get('name') === 'like.draft:*') {
        const before = params.get('value->>created')?.replace(/^lt\./, '');
        for (const [key, value] of Object.entries(world.music)) if (key.startsWith('draft:') && value.created < before) delete world.music[key];
        return new Response(null, { status: 204 });
      }
      if (method === 'DELETE') {
        // As Postgres does: only one delete finds the row.
        if (!(name in world.music)) return json([]);
        const value = world.music[name];
        delete world.music[name];
        return json([{ name, value }]);
      }
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
  // /api/songs is fresh at the edge for 30 s and stale for 30 more.
  assert.match(world.edits.at(-1).text, /within a minute\.$/);
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
  assert.equal(world.music[`draft:${NINGXIA}`].song.cover, `https://i.ytimg.com/vi/${NINGXIA}/hqdefault.jpg`);
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
  // lrclib's first hit is another song: its length isn't taken.
  world.lrclib = [
    { trackName: '寧夏 (Live)', artistName: '某翻唱', duration: 301 },
    { trackName: '寧夏', artistName: '梁靜茹', duration: 252.4, syncedLyrics: '[00:12.00] …' }
  ];
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

test('two presses of Add at once add the song once, and each says what happened', async () => {
  world.youtube[NINGXIA] = { title: '寧夏', author_name: '梁靜茹 - Topic' };
  await send({ message_id: 219, text: `/add ${NINGXIA}` });
  await Promise.all([press(`song:add:${NINGXIA}`, 'preview'), press(`song:add:${NINGXIA}`, 'preview')]);
  assert.equal(world.songs.length, 1);
  const outcomes = world.edits.slice(-2).map((e) => e.text.split('\n').at(-1)).sort();
  assert.equal(outcomes.filter((t) => t.startsWith('✅ Added')).length, 1);
  assert.equal(outcomes.filter((t) => /already answered/.test(t)).length, 1);
  assert.ok(!outcomes.some((t) => t.startsWith('⚠️')), 'no press reports a failure that didn’t happen');
});

test('a title starting with an 11-letter word is found by title', async () => {
  world.songs.push({ id: NINGXIA, title: 'Butterflies', artist: 'Someone' }, { id: 'EEEEEEEEEEE', title: 'Other', artist: 'C' });
  await send({ message_id: 220, text: '/remove Butterflies' });
  assert.deepEqual(world.songs.map((s) => s.id), ['EEEEEEEEEEE']);
});

test('the last song stays', async () => {
  world.songs.push({ id: NINGXIA, title: '寧夏', artist: '梁靜茹' });
  await send({ message_id: 221, text: '/remove 寧夏' });
  assert.equal(world.songs.length, 1);
  assert.match(world.replies.at(-1), /last song/);
});

test('Add on a song added meanwhile says it’s there, even with the library full', async () => {
  world.youtube[NINGXIA] = { title: '寧夏', author_name: '梁靜茹 - Topic' };
  await send({ message_id: 222, text: `/add ${NINGXIA}` });
  world.songs.push({ id: NINGXIA, title: '寧夏', artist: '梁靜茹' });
  world.music.song_limit = 1;
  await press(`song:add:${NINGXIA}`, 'preview');
  assert.match(world.edits.at(-1).text, /already in the library/);
});

test('drafts nobody answered within a day are cleared by the next /add', async () => {
  world.music['draft:OLDOLDOLD00'] = { song: {}, created: '2020-01-01T00:00:00.000Z' };
  world.music['draft:NEWNEWNEW00'] = { song: {}, created: new Date().toISOString() };
  world.youtube[NINGXIA] = { title: '寧夏', author_name: '梁靜茹 - Topic' };
  await send({ message_id: 223, text: `/add ${NINGXIA}` });
  assert.ok(!('draft:OLDOLDOLD00' in world.music));
  assert.ok('draft:NEWNEWNEW00' in world.music);
  assert.ok(`draft:${NINGXIA}` in world.music);
});

test('/songs lists titles and artists, no ids', async () => {
  world.songs.push({ id: NINGXIA, title: '寧夏', artist: '梁靜茹' }, { id: 'EEEEEEEEEEE', title: '夏天', artist: 'C' });
  await send({ message_id: 224, text: '/songs' });
  assert.match(world.replies.at(-1), /• 寧夏 — 梁靜茹/);
  assert.doesNotMatch(world.replies.at(-1), new RegExp(`${NINGXIA}|EEEEEEEEEEE`));
});

test('when several songs match, each is a button, and pressing one does the command', async () => {
  world.songs.push({ id: NINGXIA, title: '寧夏', artist: '梁靜茹' }, { id: 'EEEEEEEEEEE', title: '夏天', artist: 'C' });
  await send({ message_id: 225, text: '/offset 夏 -850' });
  const ask = world.sent.at(-1);
  assert.equal(ask.text, 'Which one?', 'no ids in the question');
  assert.deepEqual(
    ask.reply_markup.inline_keyboard.map(([b]) => [b.text, b.callback_data]),
    [
      ['寧夏 — 梁靜茹', `song:offset:${NINGXIA}:-850`],
      ['夏天 — C', 'song:offset:EEEEEEEEEEE:-850']
    ]
  );
  await call({ callback_query: { id: 'cb', from: { id: OWNER }, data: `song:offset:${NINGXIA}:-850`, message: { chat: { id: OWNER }, message_id: 901, text: 'Which one?' } } });
  assert.equal(world.songs[0].lyrics_offset, -850);
  assert.equal(world.songs[1].lyrics_offset, undefined);
  assert.deepEqual(world.cleared, [901], 'the buttons go once one is pressed');
  assert.match(world.replies.at(-1), /寧夏: lyrics 850 ms behind/);

  await send({ message_id: 226, text: '/remove 夏' });
  await call({ callback_query: { id: 'cb', from: { id: OWNER }, data: 'song:remove:EEEEEEEEEEE', message: { chat: { id: OWNER }, message_id: 902, text: 'Which one?' } } });
  assert.deepEqual(world.songs.map((s) => s.id), [NINGXIA]);
  // Pressed again from another copy of the question: it's gone already.
  await call({ callback_query: { id: 'cb', from: { id: OWNER }, data: 'song:remove:EEEEEEEEEEE', message: { chat: { id: OWNER }, message_id: 903, text: 'Which one?' } } });
  assert.match(world.replies.at(-1), /isn’t in the library any more/);
});

// ---------- DVD Player's shelf ----------

const FERRARI = 'Dlz_XHeUUis';
const WHIPLASH = 'jWQx2f-CErU';

test('/dvd burns a video onto a disc, named as /add guesses a song, with its best picture', async () => {
  world.youtube[FERRARI] = { title: 'Frank Ocean - White Ferrari (Official Video)', author_name: 'Frank Ocean' };
  world.maxres.add(FERRARI);
  await send({ message_id: 500, text: `/dvd https://youtu.be/${FERRARI}?si=share` });
  assert.deepEqual(world.discs, [{ id: FERRARI, title: 'White Ferrari', artist: 'Frank Ocean', cover: 'maxresdefault' }]);
  assert.match(world.replies.at(-1), /💿 Burned: White Ferrari — Frank Ocean\. It’s in the Movies folder/);

  // Without a full-size thumbnail, the one every video has.
  world.youtube[WHIPLASH] = { title: 'Whiplash', author_name: 'aespa' };
  await send({ message_id: 501, text: `/dvd ${WHIPLASH}` });
  assert.equal(world.discs.at(-1).cover, 'hqdefault');
});

test('/dvd with a name uses it; sent again with a name, it relabels the disc', async () => {
  world.youtube[WHIPLASH] = { title: 'aespa Whiplash MV', author_name: 'SMTOWN' };
  await send({ message_id: 510, text: `/dvd https://www.youtube.com/watch?v=${WHIPLASH} Whiplash - aespa` });
  assert.deepEqual(world.discs, [{ id: WHIPLASH, title: 'Whiplash', artist: 'aespa', cover: 'hqdefault' }]);
  await send({ message_id: 511, text: `/dvd ${WHIPLASH}` });
  assert.match(world.replies.at(-1), /already on the shelf: Whiplash — aespa/);
  await send({ message_id: 512, text: `/dvd ${WHIPLASH} Whiplash (Performance)` });
  assert.deepEqual(world.discs, [{ id: WHIPLASH, title: 'Whiplash (Performance)', artist: null, cover: 'hqdefault' }]);
  assert.match(world.replies.at(-1), /🏷 Relabelled: Whiplash \(Performance\)\./);
});

test('/dvd says why a video can’t be burned, and only fetches addresses it built', async () => {
  world.youtube.AAAAAAAAAAA = 401;
  await send({ message_id: 520, text: '/dvd https://youtu.be/AAAAAAAAAAA' });
  assert.match(world.replies.at(-1), /embedding off/);
  await send({ message_id: 521, text: '/dvd https://youtu.be/BBBBBBBBBBB' });
  assert.match(world.replies.at(-1), /doesn’t know that video/);
  await send({ message_id: 522, text: '/dvd https://evil.example.com/watch?v=OxtZF0WGXtE' });
  assert.match(world.replies.at(-1), /Send a YouTube link/);
  for (const url of world.fetched) assert.match(new URL(url).hostname, /^(www\.youtube\.com|i\.ytimg\.com)$/);
  assert.equal(world.discs.length, 0);
});

test('a full shelf refuses another disc', async () => {
  world.music.disc_limit = 1;
  world.discs.push({ id: 'CCCCCCCCCCC', title: 'One', artist: null, cover: 'hqdefault' });
  world.youtube[FERRARI] = { title: 'White Ferrari', author_name: 'Frank Ocean' };
  await send({ message_id: 530, text: `/dvd ${FERRARI}` });
  assert.match(world.replies.at(-1), /The shelf is full \(1 discs\)\. \/dvd remove one first\./);
  assert.equal(world.discs.length, 1);
});

test('/dvd lists the shelf, newest first; /dvd remove takes a disc off by title or link', async () => {
  await send({ message_id: 540, text: '/dvd' });
  assert.match(world.replies.at(-1), /No discs yet \(room for 200\)/);
  world.discs.push(
    { id: FERRARI, title: 'White Ferrari', artist: 'Frank Ocean', cover: 'maxresdefault' },
    { id: WHIPLASH, title: 'Whiplash', artist: 'aespa', cover: 'hqdefault' },
    { id: 'CCCCCCCCCCC', title: 'White Noise', artist: null, cover: 'hqdefault' }
  );
  await send({ message_id: 541, text: '/dvd' });
  assert.match(world.replies.at(-1), /💿 3\/200 discs\. The latest:\n• White Noise\n• Whiplash — aespa\n• White Ferrari — Frank Ocean/);

  // Two match: it asks for the link rather than guessing.
  await send({ message_id: 542, text: '/dvd remove white' });
  assert.match(world.replies.at(-1), /2 discs match\. Send the link/);
  assert.equal(world.discs.length, 3);
  await send({ message_id: 543, text: `/dvd remove https://youtu.be/${FERRARI}` });
  assert.match(world.replies.at(-1), /🗑 Off the shelf: White Ferrari — Frank Ocean\./);
  await send({ message_id: 544, text: '/dvd remove whiplash' });
  assert.deepEqual(world.discs.map((d) => d.id), ['CCCCCCCCCCC']);
  await send({ message_id: 545, text: '/dvd remove nothing like it' });
  assert.match(world.replies.at(-1), /No disc matches “nothing like it”/);
});

// ---------- Jincheng's home folder: /diary and /doc ----------

/** A message sent at `iso` (Telegram gives Unix seconds). */
const at = (iso) => Math.floor(Date.parse(iso) / 1000);

test('/diary writes an entry for the day it was sent where Jincheng is, for Jincheng alone', async () => {
  // 23:30 in San Jose (the place to start with) is already the next day in UTC.
  await send({ message_id: 300, date: at('2026-09-30T06:30:00Z'), text: '/diary Climbed after work.\nThe blue V7.' });
  assert.deepEqual(world.diary.map(({ day, body, telegram_message_id }) => ({ day, body, telegram_message_id })), [
    { day: '2026-09-29', body: 'Climbed after work.\nThe blue V7.', telegram_message_id: 300 }
  ]);
  assert.match(world.replies.at(-1), /In your diary for Tuesday, September 29/);
  // Somewhere else, that place's day.
  await send({ message_id: 301, text: '/at Tokyo' });
  await send({ message_id: 302, date: at('2026-09-30T06:30:00Z'), text: '/diary Ramen at midnight.' });
  assert.equal(world.diary.at(-1).day, '2026-09-30');
  assert.equal(world.posts.length, 0, 'nothing went on the Soapbox');
});

test('/diary alone says how today looks', async () => {
  await send({ message_id: 310, date: at('2026-09-29T18:00:00Z'), text: '/diary' });
  assert.match(world.replies.at(-1), /Nothing in your diary for Tuesday, September 29 yet/);
  await send({ message_id: 311, date: at('2026-09-29T18:00:00Z'), text: '/diary First.' });
  await send({ message_id: 312, date: at('2026-09-29T19:00:00Z'), text: '/diary Second.' });
  await send({ message_id: 313, date: at('2026-09-29T19:30:00Z'), text: '/diary' });
  assert.match(world.replies.at(-1), /Tuesday, September 29: 2 entries\. The latest:\n\nSecond\./);
});

test('/doc makes a document in Documents named after its first line, free whatever the case', async () => {
  world.documents.push({ folder: 'documents', name: 'packing list.txt', body: '' }, { folder: 'public', name: 'Packing list 2.txt', body: '' });
  await send({ message_id: 320, text: '/doc Packing list\n- tent\n- stove' });
  assert.deepEqual(world.documents.at(-1), {
    folder: 'documents',
    name: 'Packing list 2.txt',
    body: 'Packing list\n- tent\n- stove',
    telegram_message_id: 320,
    created_at: world.documents.at(-1).created_at
  });
  assert.match(world.replies.at(-1), /In Documents as “Packing list 2\.txt”/);
  await send({ message_id: 321, text: '/doc' });
  assert.match(world.replies.at(-1), /Its first line names it/);
  assert.equal(world.posts.length, 0);
});

test('a document named the same meanwhile gets the next name', async () => {
  world.takenMeanwhile = 'Notes.txt';
  await send({ message_id: 330, text: '/doc Notes\nfrom the train' });
  assert.deepEqual(world.documents.map((d) => d.name), ['Notes.txt', 'Notes 2.txt']);
  assert.equal(world.documents.at(-1).telegram_message_id, 330);
  assert.match(world.replies.at(-1), /“Notes 2\.txt”/);
});

test('a message Telegram delivers twice is saved once, and answered once', async () => {
  const twice = { message_id: 340, date: at('2026-09-29T18:00:00Z'), text: '/diary Only once.' };
  await send(twice);
  await send(twice);
  assert.equal(world.diary.length, 1);
  assert.equal(world.replies.filter((r) => /In your diary/.test(r)).length, 1);
  await send({ message_id: 341, text: '/doc Once' });
  await send({ message_id: 341, text: '/doc Once' });
  assert.equal(world.documents.length, 1);
});

test('editing the message edits the entry or the document, and not the Soapbox', async () => {
  await send({ message_id: 350, date: at('2026-09-29T18:00:00Z'), text: '/diary Tierd.' });
  await send({ message_id: 351, text: '/doc Groceries\nmilk' });
  await call({ edited_message: { ...me, message_id: 350, text: '/diary Tired.' } });
  await call({ edited_message: { ...me, message_id: 351, text: '/doc Groceries\nmilk, eggs' } });
  assert.equal(world.diary[0].body, 'Tired.');
  assert.deepEqual([world.documents[0].name, world.documents[0].body], ['Groceries.txt', 'Groceries\nmilk, eggs']);
  assert.deepEqual(world.patches, [], 'no Soapbox post was touched');
});

test('a full diary says so, and a photo meant for the diary goes nowhere', async () => {
  const failing = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) =>
    String(input).endsWith('/rest/v1/diary') && init.method === 'POST'
      ? json({ code: 'P0429', message: 'The diary is full (10000 entries).' }, 400)
      : failing(input, init);
  try {
    await send({ message_id: 360, date: at('2026-09-29T18:00:00Z'), text: '/diary One more.' });
  } finally {
    globalThis.fetch = failing;
  }
  assert.match(world.replies.at(-1), /Couldn’t save it; nothing changed\.\n\nThe diary is full \(10000 entries\)\./);
  await send({ message_id: 361, photo: photo('d'), caption: '/diary the view from the top' });
  assert.equal(world.posts.length, 0);
  assert.equal(world.uploads.length, 0);
  assert.match(world.replies.at(-1), /the photo went nowhere/);
});

test('the Soapbox’s own /note still posts a note, and /help lists the home folder', async () => {
  await send({ message_id: 370, text: '/note hello there' });
  assert.deepEqual(world.posts.map((p) => [p.body, p.kind]), [['hello there', 'note']]);
  await send({ message_id: 371, text: '/help' });
  assert.match(world.replies.at(-1), /\/diary <text>[\s\S]*\/doc <text>/);
});
