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
// 20261001_password_reset.sql). Mail goes through Resend. Setup is in
// supabase/functions/account-recovery/README.md.

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

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info'
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

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
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** What the database keeps instead of the token. */
async function hashOf(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function sendLink(to: string, username: string, token: string) {
  const link = `${SITE}/?open=account&reset=${token}`;
  const text = [
    `Someone (hopefully you) asked to reset the password of ${username} on JM/OS.`,
    '',
    `Choose a new one here: ${link}`,
    '',
    'The link works once, for 30 minutes. If you didn’t ask, ignore this email and nothing changes.'
  ].join('\n');
  const html = `<div style="font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#222;max-width:480px">
<p>Someone (hopefully you) asked to reset the password of <strong>${escape(username)}</strong> on JM/OS.</p>
<p><a href="${escape(link)}" style="display:inline-block;padding:8px 18px;border-radius:14px;background:#2a6fdb;color:#fff;text-decoration:none">Choose a New Password</a></p>
<p style="color:#666;font-size:12px">The link works once, for 30 minutes. If you didn’t ask, ignore this email and nothing changes.</p>
</div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: 'Reset your JM/OS password', text, html })
  });
  if (!res.ok) throw new Error(`resend: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function request(username: unknown) {
  const name = String(username ?? '').trim().toLowerCase();
  if (!USERNAME.test(name)) return reply({ error: 'A username is 3 to 20 letters, digits or underscores.' }, 400);
  const token = newToken();
  const address: string | null = await rpc('recovery_request', { p_username: name, p_token_hash: await hashOf(token) });
  // A failed send is logged, not reported: an error would give away that the account has an address.
  if (address) await sendLink(address, name, token).catch((error) => console.error(error));
  return reply({ ok: true });
}

async function check(token: unknown) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return reply({ username: null });
  const username: string | null = await rpc('recovery_check', { p_token_hash: await hashOf(token) });
  return reply({ username });
}

async function reset(token: unknown, password: unknown) {
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Not found' }, 404);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Bad request' }, 400);
  }
  try {
    if (body.action === 'request') return await request(body.username);
    if (body.action === 'check') return await check(body.token);
    if (body.action === 'reset') return await reset(body.token, body.password);
    return reply({ error: 'Bad request' }, 400);
  } catch (error) {
    console.error(error);
    return reply({ error: 'Something went wrong. Try again in a moment.' }, 500);
  }
});
