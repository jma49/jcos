-- Jincheng's home folder from Telegram: the bot's /diary and /doc
-- (supabase/functions/soapbox-bot/home.ts) write a diary entry or a
-- document in Documents, with the service role. Each keeps the Telegram
-- message it came from, so editing the message edits it, and a message
-- Telegram delivers twice is saved once. The site never reads which
-- message it was: the column isn't granted to anon or authenticated.
--
-- Applied with `supabase db push` after
-- 20260929191409_chat_can_write_members.sql (schema.sql already includes
-- it). It can be run again safely.

alter table public.diary add column if not exists telegram_message_id bigint;
create unique index if not exists diary_telegram_message on public.diary (telegram_message_id);

alter table public.documents add column if not exists telegram_message_id bigint;
create unique index if not exists documents_telegram_message on public.documents (telegram_message_id);

notify pgrst, 'reload schema';
