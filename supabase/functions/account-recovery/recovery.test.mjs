// Tests for the account-recovery function (`npm test`, with Vitest):
// index.ts is loaded with a stand-in for Deno, and the database, Supabase
// Auth and Resend are replaced by an in-memory fake that follows the
// rules of supabase/migrations/20260926094533_password_reset.sql.

import { test, beforeEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const env = {
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'KEY',
  RESEND_API_KEY: 're_test'
};

const ALICE = '11111111-1111-1111-1111-111111111111';

/** Everything the fake services saw and hold. */
let world;
beforeEach(() => {
  world = {
    accounts: { alice: { id: ALICE, email: 'alice@example.com' }, bob: { id: 'b', email: null } },
    links: [],
    mail: [],
    passwords: {},
    mailFails: false
  };
});

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const live = (hash) => world.links.find((l) => l.hash === hash && !l.used && l.expires > Date.now());

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const body = init.body ? JSON.parse(init.body) : null;
  if (url === 'https://api.resend.com/emails') {
    assert.equal(init.headers.authorization, 'Bearer re_test');
    if (world.mailGate) await world.mailGate;
    if (world.mailFails) return json({ message: 'domain not verified' }, 403);
    world.mail.push(body);
    return json({ id: 'm1' });
  }
  assert.equal(init.headers.authorization, 'Bearer KEY');
  const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)$/)?.[1];
  if (rpc === 'recovery_request') {
    const account = world.accounts[body.p_username];
    if (!account?.email) return json(null);
    world.links.push({ hash: body.p_token_hash, user: account.id, username: body.p_username, expires: Date.now() + 1800_000 });
    return json(account.email);
  }
  if (rpc === 'recovery_check') return json(live(body.p_token_hash)?.username ?? null);
  if (rpc === 'recovery_consume') {
    const link = live(body.p_token_hash);
    if (!link) return json([]);
    world.links.filter((l) => l.user === link.user).forEach((l) => (l.used = true));
    return json([{ user_id: link.user, username: link.username }]);
  }
  const admin = url.match(/\/auth\/v1\/admin\/users\/([\w-]+)$/)?.[1];
  if (admin && init.method === 'PUT') {
    world.passwords[admin] = body.password;
    return json({ id: admin });
  }
  throw new Error(`unexpected request: ${init.method} ${url}`);
};

let handler;
/** Work the function left running after its answer (the email), as Supabase's EdgeRuntime keeps it. */
const background = [];
globalThis.EdgeRuntime = { waitUntil: (work) => background.push(work) };
globalThis.Deno = { env: { get: (name) => env[name] }, serve: (h) => (handler = h) };
await import('./index.ts');

const call = async (body, method = 'POST') => {
  const res = await handler(new Request('https://fn.example', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  await Promise.all(background.splice(0));
  return { status: res.status, body: res.status === 204 ? null : await res.json(), cors: res.headers.get('access-control-allow-origin') };
};
/** The token in the link of the last email sent. */
const tokenInMail = () => world.mail.at(-1).text.match(/reset=([\w-]+)/)[1];
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

test('a link goes to the recovery address, and only its hash is kept', async () => {
  const res = await call({ action: 'request', username: ' Alice ' });
  assert.deepEqual(res.body, { ok: true });
  assert.equal(res.cors, '*');
  assert.equal(world.mail.length, 1);
  assert.deepEqual(world.mail[0].to, ['alice@example.com']);
  assert.match(world.mail[0].text, /https:\/\/www\.majincheng\.com\/\?open=account&reset=[\w-]{43}\n/);
  assert.match(world.mail[0].html, /Choose a New Password/);
  const token = tokenInMail();
  assert.equal(world.links[0].hash, sha256(token));
  assert.ok(!JSON.stringify(world.links).includes(token));
});

test('the answer doesn’t wait for the email', async () => {
  let release;
  world.mailGate = new Promise((resolve) => (release = resolve));
  const res = await handler(new Request('https://fn.example', { method: 'POST', body: JSON.stringify({ action: 'request', username: 'alice' }) }));
  assert.equal(res.status, 200);
  assert.equal(world.mail.length, 0, 'answered before the email went');
  release();
  await Promise.all(background.splice(0));
  assert.equal(world.mail.length, 1);
});

test('every request gets the same answer, link or not', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const answers = [];
  answers.push(await call({ action: 'request', username: 'bob' }));
  answers.push(await call({ action: 'request', username: 'nobody' }));
  world.mailFails = true;
  answers.push(await call({ action: 'request', username: 'alice' }));
  for (const a of answers) assert.deepEqual(a, { status: 200, body: { ok: true }, cors: '*' });
  assert.equal(world.mail.length, 0);
  assert.match(String(errors.mock.calls[0][0]), /resend: 403/);
  errors.mockRestore();
  assert.equal((await call({ action: 'request', username: 'no way!' })).status, 400);
});

test('a link names its account, sets the password once, and then stops working', async () => {
  await call({ action: 'request', username: 'alice' });
  const token = tokenInMail();
  assert.deepEqual((await call({ action: 'check', token })).body, { username: 'alice' });

  assert.equal((await call({ action: 'reset', token, password: '123' })).status, 400);
  assert.equal((await call({ action: 'reset', token, password: 'x'.repeat(73) })).status, 400);
  assert.equal(world.passwords[ALICE], undefined, 'a refused password leaves the link working');

  const done = await call({ action: 'reset', token, password: 'new secret' });
  assert.deepEqual(done.body, { ok: true, username: 'alice' });
  assert.equal(world.passwords[ALICE], 'new secret');

  const again = await call({ action: 'reset', token, password: 'another one' });
  assert.equal(again.status, 410);
  assert.match(again.body.error, /expired or has already been used/);
  assert.equal(world.passwords[ALICE], 'new secret');
  assert.deepEqual((await call({ action: 'check', token })).body, { username: null });
});

test('made-up and malformed tokens get nowhere', async () => {
  assert.deepEqual((await call({ action: 'check', token: 'A'.repeat(43) })).body, { username: null });
  assert.deepEqual((await call({ action: 'check', token: '../../etc' })).body, { username: null });
  assert.equal((await call({ action: 'reset', token: 'A'.repeat(43), password: 'long enough' })).status, 410);
  assert.equal((await call({ action: 'reset', token: 42, password: 'long enough' })).status, 410);
  assert.deepEqual(world.passwords, {});
});

test('the browser can ask first; anything else is turned away', async () => {
  const pre = await call(null, 'OPTIONS');
  assert.equal(pre.status, 204);
  assert.equal(pre.cors, '*');
  assert.equal((await call(null, 'GET')).status, 404);
  assert.equal((await call({ action: 'delete everything' })).status, 400);
  const res = await handler(new Request('https://fn.example', { method: 'POST', body: 'not json' }));
  assert.equal(res.status, 400);
});
