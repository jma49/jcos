# Soapbox bot

A Telegram bot that posts to the JM/OS Soapbox. Only the owner's Telegram
account can post; everyone else is ignored.

## Setup

The quick way: create the bot (step 2), run the migration (step 1), log
in with `supabase login`, then run `bash scripts/setup-soapbox.sh`. It
asks for the token (without echoing it) and your user ID, and does steps
4–6 plus the bot's command menu. The manual steps follow.

1. **Database.** Run `supabase/migrations/20260926_soapbox.sql` in the
   Supabase SQL editor.
2. **Bot.** In Telegram, message [@BotFather](https://t.me/BotFather),
   send `/newbot`, and keep the token it gives you.
3. **Your Telegram user ID.** Message [@userinfobot](https://t.me/userinfobot);
   it replies with your numeric ID.
4. **Secrets.** Pick a random webhook secret (e.g. `openssl rand -hex 24`),
   then in Supabase → Edge Functions → Secrets (or with the CLI) set:

   ```sh
   supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_OWNER_ID=... TELEGRAM_WEBHOOK_SECRET=...
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge
   Functions automatically. `SOAPBOX_SITE_URL` is optional.
5. **Deploy.** Telegram can't send a Supabase JWT, so turn JWT
   verification off; the webhook secret does that job instead:

   ```sh
   supabase functions deploy soapbox-bot --no-verify-jwt --project-ref hszogpoyyqgwjuznbegd
   ```

6. **Point Telegram at it.**

   ```sh
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d url=https://hszogpoyyqgwjuznbegd.supabase.co/functions/v1/soapbox-bot \
     -d secret_token=<WEBHOOK_SECRET> \
     -d 'allowed_updates=["message","edited_message"]'
   ```

7. Send the bot `/help`, then anything you like.

## Commands

| Message | Does |
| --- | --- |
| any text | posts a note |
| `/rant <text>` or `#rant <text>` | posts a rant |
| `/note <text>` | posts a note |
| `/at <city>` | stamps later posts with that city and its weather (default San Jose) |
| `/at` | shows the current city |
| `/delete` | hides the post you reply to, or the latest one |
| editing a message | edits its post |

Hidden posts stay in the table with `hidden = true`; flip it back in the
Table editor to restore one.
