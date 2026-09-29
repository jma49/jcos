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

const SITE = 'https://www.majincheng.com';

/** A call as the site's Account window makes it, from `origin` (null: no Origin, as curl sends). */
const call = async (body, method = 'POST', origin = SITE) => {
  const headers = origin ? { origin } : {};
  const res = await handler(new Request('https://fn.example', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  await Promise.all(background.splice(0));
  return { status: res.status, body: res.status === 204 ? null : await res.json(), cors: res.headers.get('access-control-allow-origin') };
};
/** The token in the link of the last email sent. */
const tokenInMail = () => world.mail.at(-1).text.match(/reset=([\w-]+)/)[1];
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

test('a link goes to the recovery address, and only its hash is kept', async () => {
  const res = await call({ action: 'request', username: ' Alice ' });
  assert.deepEqual(res.body, { ok: true });
  assert.equal(res.cors, SITE);
  assert.equal(world.mail.length, 1);
  assert.deepEqual(world.mail[0].to, ['alice@example.com']);
  assert.match(world.mail[0].text, /https:\/\/www\.majincheng\.com\/\?open=account&reset=[\w-]{43}\n/);
  assert.match(world.mail[0].html, /Choose a New Password/);
  assert.equal(world.mail[0].subject, 'Keychain Access wants a new password for alice');
  assert.match(world.mail[0].html, /src="https:\/\/www\.majincheng\.com\/os\/icons\/keychain\.png"/);
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
  for (const a of answers) assert.deepEqual(a, { status: 200, body: { ok: true }, cors: SITE });
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

test('the email escapes what it puts in the page', async () => {
  const { resetEmail } = await import('./email.ts');
  const mail = resetEmail({ username: '<b>x</b>', link: 'https://x.test/?a=1&b="2"', site: 'https://x.test' });
  assert.ok(!mail.html.includes('<b>x</b>'));
  assert.match(mail.html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(mail.html, /href="https:\/\/x\.test\/\?a=1&amp;b=&quot;2&quot;"/);
  assert.match(mail.text, /\nhttps:\/\/x\.test\/\?a=1&b="2"\n/);
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
  assert.equal(pre.cors, SITE);
  const get = await handler(new Request('https://fn.example', { method: 'GET', headers: { origin: SITE } }));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');
  assert.deepEqual(await get.json(), { error: 'Only POST requests are accepted.' });
  const unknown = await call({ action: 'delete everything' });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, 'The action must be request, check or reset.');
  const res = await handler(new Request('https://fn.example', { method: 'POST', headers: { origin: SITE }, body: 'not json' }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'The request isn’t valid JSON.' });
});

test('only the site’s pages get CORS headers', async () => {
  // Both of the site's origins, each answered with its own name and a Vary.
  for (const origin of [SITE, 'https://majincheng.com']) {
    const pre = await handler(new Request('https://fn.example', { method: 'OPTIONS', headers: { origin } }));
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    assert.equal(pre.headers.get('vary'), 'Origin');
  }
  // Another site's page: no CORS headers, so its browser won't send the request.
  const other = await call(null, 'OPTIONS', 'https://evil.example');
  assert.equal(other.status, 204);
  assert.equal(other.cors, null);
  assert.equal((await call({ action: 'request', username: 'alice' }, 'POST', 'https://evil.example')).cors, null);
  // No Origin at all (not a browser): answered, without CORS headers.
  const curl = await call({ action: 'check', token: 'nope' }, 'POST', null);
  assert.deepEqual(curl, { status: 200, body: { username: null }, cors: null });
});

test('two requests at once each get their own CORS headers', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const realFetch = globalThis.fetch;
  // The first request waits in the database while the second arrives from elsewhere.
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/rpc/recovery_check')) await gate;
    return realFetch(input, init);
  };
  const first = call({ action: 'check', token: 'A'.repeat(43) }, 'POST', SITE);
  const second = call({ action: 'check', token: 'B'.repeat(43) }, 'POST', 'https://evil.example');
  release();
  const [a, b] = await Promise.all([first, second]);
  globalThis.fetch = realFetch;
  assert.equal(a.cors, SITE);
  assert.equal(b.cors, null);
});
