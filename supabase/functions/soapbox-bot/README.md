# Soapbox bot

A Telegram bot that posts to the JM/OS Soapbox. Only the owner's Telegram
account can post; everyone else is ignored.

## Setup

The quick way: create the bot (step 2), run the migration (step 1), log
in with `supabase login`, then run `bash scripts/setup-soapbox.sh`. It
asks for the token (without echoing it) and your user ID, and does steps
4–6 plus the bot's command menu. The manual steps follow.

1. **Database.** Run `supabase/migrations/20260926_soapbox.sql`, then
   `20260929_soapbox_images.sql` (photos, and the `soapbox` storage
   bucket they go in) and `20260930_moderation.sql` (notes and chat
   messages sent to you), in the Supabase SQL editor.
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
     -d 'allowed_updates=["message","edited_message","callback_query"]'
   ```

7. Send the bot `/help`, then anything you like.

## Commands

| Message | Does |
| --- | --- |
| any text | posts a note |
| a photo | posts it; its caption is the text (`#rant` works there too) |
| an album | posts all its photos as one post |
| an image sent as a file | posts it (JPEG, PNG, WebP or GIF, up to 10 MB) |
| `/rant <text>` or `#rant <text>` | posts a rant |
| `/note <text>` | posts a note |
| `/at <city>` | stamps later posts with that city and its weather (default San Jose) |
| `/at` | shows the current city |
| `/delete` | hides the post you reply to, or the latest one |
| editing a message or a caption | edits its post |
| `/watch on` / `/watch off` | new Stickies notes and public chat messages sent to you, each with a 🙈 Hide button (on by default) |

Stickers, voice messages and videos are answered with a note that they
can't go on the Soapbox. Photos are copied into the public `soapbox`
bucket (Storage), so they stay up even if the Telegram message goes;
the bot makes the bucket on the first photo if it isn't there. When a
post fails, the bot's reply says which step failed and why.

After deploying a new version of the function, nothing else changes:
the webhook and secrets stay as they are. Deploy from an up-to-date
`main`: the CLI uploads the `index.ts` in your working copy, so an old
branch puts an old bot live.

## Moderation

With `20260930_moderation.sql` run, every new Stickies note and every
message in a public chat room (never a private conversation) is sent
to you by the bot, with a **🙈 Hide** button that takes it down
(`approved = false` for a note, `hidden = true` for a message) and
**↩︎ Show again** to undo. The database sends them with `pg_net`,
signed with a secret it makes itself; the bot tells the database its
address the first time you message it after deploying, and asks
Telegram for button presses at the same time, so there's nothing to
set up. `/watch off` stops them.

## Tests

`npm test` runs `bot.test.mjs`: the bot under Node with Telegram and
Supabase faked, through text, photos, albums, files, failures, edits,
/delete, /at, /watch, notices and their buttons.

Hidden posts stay in the table with `hidden = true`; flip it back in the
Table editor to restore one.
