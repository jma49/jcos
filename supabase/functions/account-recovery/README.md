# Account recovery

Lets a member who forgot their password get a link, sent to the recovery
email they gave, and choose a new password with it. The Account window
calls this function; it emails through [Resend](https://resend.com).

- A request is answered the same way whether or not a link went out, so
  nobody can learn which accounts have a recovery address.
- A link carries 32 random bytes. The database keeps only its SHA-256
  hash. A link works once, for 30 minutes, and using it retires the
  account's other links. At most three links an hour go out per account.
- Members add, change or remove their recovery address in the Account
  window once signed in.

## Setup

1. **Database.** Run `supabase/migrations/20260926094533_password_reset.sql` in
   the Supabase SQL editor (`schema.sql` already includes it).
2. **Resend.** Add and verify `majincheng.com` under Domains (it gives you
   DNS records to add), then create an API key with sending access.
3. **Secrets.**

   ```sh
   supabase secrets set RESEND_API_KEY=re_...
   ```

   Optional: `RECOVERY_FROM` (default `JM/OS <noreply@majincheng.com>`,
   which must be on the verified domain) and `RECOVERY_SITE_URL` (default
   `https://www.majincheng.com`, where the link points). `SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.
4. **Deploy.** The function checks everything itself and is called before
   anyone is signed in, so JWT verification is off:

   ```sh
   supabase functions deploy account-recovery --no-verify-jwt
   ```

## Trying it

Sign in, add a recovery address in the Account window, sign out, then
choose Sign In › "Forgot your password?". The email's link opens
`/?open=account&reset=<token>`. If no email arrives, the function's logs
(Supabase › Edge Functions › account-recovery › Logs) show Resend's
answer; the visitor is never told, so the page can't be used to probe
accounts.

In `astro dev` without Supabase, the local stand-in prints the link to
the browser console instead of sending it.

## Tests

`npm test` runs `recovery.test.mjs` against a fake database, Supabase
Auth and Resend; `npm run test:db` checks the database's side.
