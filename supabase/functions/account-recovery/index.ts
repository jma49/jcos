// Account recovery: emails a member a link to choose a new password, and
// sets it when the link comes back. Runs as a Supabase Edge Function
// (Deno), called from the Account window with a JSON body:
//
//   { action: 'request', username }          email a link, if the account
//                                            has a recovery address
//   { action: 'check', token }               whose link it is, while it works
//   { action: 'reset', token, password }     set the new password
//
// A request is answered the same way whether or not a link went out, so
// nobody can learn which accounts have a recovery address. Links are
// random, kept only as a hash, work once and for 30 minutes, and at most
// three go out per account an hour (supabase/migrations/
// 20260926094533_password_reset.sql). Mail goes through Resend. Setup is in
// supabase/functions/account-recovery/README.md; the email itself is in
// email.ts.

import { resetEmail } from './email.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_KEY = env('RESEND_API_KEY');
const SITE = (Deno.env.get('RECOVERY_SITE_URL') ?? 'https://www.majincheng.com').replace(/\/$/, '');
const FROM = Deno.env.get('RECOVERY_FROM') ?? 'JM/OS <noreply@majincheng.com>';

const USERNAME = /^[a-z0-9_]{3,20}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PASSWORD_MIN = 6;
/** Supabase Auth (bcrypt) ignores anything past 72 bytes. */
const PASSWORD_MAX = 72;

/**
 * The pages that may call this from a browser: the site (majincheng.com
 * redirects to www), the site the links point to, and any origins listed
 * in RECOVERY_ORIGINS (comma-separated), for trying a local build with the
 * real keys (http://localhost:4321). Other pages get no CORS headers, so a
 * browser won't let them send it; a request without an Origin (curl) isn't
 * a browser's and is answered as usual, since CORS only binds browsers.
 */
const ORIGINS = new Set([
  'https://www.majincheng.com',
  'https://majincheng.com',
  new URL(SITE).origin,
  ...(Deno.env.get('RECOVERY_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
]);

const METHODS = 'POST, OPTIONS';

/** CORS headers for a request from `origin`: its own name back if it's allowed, none if not. */
function cors(origin: string | null): Record<string, string> {
  const vary = { vary: 'Origin' };
  if (!origin || !ORIGINS.has(origin)) return vary;
  return {
    ...vary,
    'access-control-allow-origin': origin,
    'access-control-allow-methods': METHODS,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info'
  };
}

/**
 * A JSON answer carrying one request's CORS headers. Made per request and
 * passed along: requests overlap (each waits on the database), so the
 * headers can't live in a variable they share.
 */
const replier =
  (headers: Record<string, string>) =>
  (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra, 'content-type': 'application/json' } });
type Reply = ReturnType<typeof replier>;

/** A service-role call to the database's API. */
async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc/${name}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** 32 random bytes, as the link carries them. */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** What the database keeps instead of the token. */
async function hashOf(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Keeps the function alive for work that finishes after the response (Supabase's EdgeRuntime). */
function inBackground(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(work);
}

async function sendLink(to: string, username: string, token: string) {
  const { subject, text, html } = resetEmail({ username, link: `${SITE}/?open=account&reset=${token}`, site: SITE });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html })
  });
  if (!res.ok) throw new Error(`resend: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function request(reply: Reply, username: unknown) {
  const name = String(username ?? '')
    .trim()
    .toLowerCase();
  if (!USERNAME.test(name)) return reply({ error: 'A username is 3 to 20 letters, digits or underscores.' }, 400);
  const token = newToken();
  const address: string | null = await rpc('recovery_request', { p_username: name, p_token_hash: await hashOf(token) });
  // The mail goes out after the answer, so neither an error nor the time
  // it takes gives away that the account has an address; a failed send is
  // only logged.
  if (address) inBackground(sendLink(address, name, token).catch((error) => console.error(error)));
  return reply({ ok: true });
}

async function check(reply: Reply, token: unknown) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return reply({ username: null });
  const username: string | null = await rpc('recovery_check', { p_token_hash: await hashOf(token) });
  return reply({ username });
}

async function reset(reply: Reply, token: unknown, password: unknown) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return reply({ error: `A password needs at least ${PASSWORD_MIN} characters.` }, 400);
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return reply({ error: `A password can be at most ${PASSWORD_MAX} characters.` }, 400);
  }
  const expired = { error: 'This link has expired or has already been used. Ask for a new one.' };
  if (typeof token !== 'string' || !TOKEN.test(token)) return reply(expired, 410);
  const [who] = ((await rpc('recovery_consume', { p_token_hash: await hashOf(token) })) ?? []) as {
    user_id: string;
    username: string;
  }[];
  if (!who) return reply(expired, 410);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${who.user_id}`, {
    method: 'PUT',
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!res.ok) throw new Error(`auth: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return reply({ ok: true, username: who.username });
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  const reply = replier(headers);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'Only POST requests are accepted.' }, 405, { allow: METHODS });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'The request isn’t valid JSON.' }, 400);
  }
  try {
    if (body?.action === 'request') return await request(reply, body.username);
    if (body?.action === 'check') return await check(reply, body.token);
    if (body?.action === 'reset') return await reset(reply, body.token, body.password);
    return reply({ error: 'The action must be request, check or reset.' }, 400);
  } catch (error) {
    console.error('account-recovery:', error instanceof Error ? error.message : error);
    return reply({ error: 'Something went wrong. Try again in a moment.' }, 500);
  }
});
