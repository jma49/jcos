#!/usr/bin/env bash
# Connects the Soapbox Telegram bot to the site, in one go:
# stores the bot's secrets in Supabase, deploys the soapbox-bot Edge
# Function and points Telegram's webhook at it.
#
# Needs: the Supabase CLI, logged in (`supabase login`), and the
# migration supabase/migrations/20260925123319_soapbox.sql applied.
# The project is SUPABASE_PROJECT_REF, from the environment or .env, or
# else the one `supabase link` linked.
# Usage: bash scripts/setup-soapbox.sh
# The bot token is read without echoing and never written to the repo.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" && -f .env ]]; then
  PROJECT_REF=$(sed -n 's/^[[:space:]]*SUPABASE_PROJECT_REF=//p' .env | tail -n 1 | tr -d "\"' \r")
fi
if [[ -z "$PROJECT_REF" && -f supabase/.temp/project-ref ]]; then
  PROJECT_REF=$(tr -d '[:space:]' < supabase/.temp/project-ref)
fi
if [[ -z "$PROJECT_REF" && -f supabase/.temp/linked-project.json ]]; then
  PROJECT_REF=$(sed -n 's/.*"ref"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' supabase/.temp/linked-project.json)
fi
if [[ -z "$PROJECT_REF" ]]; then
  echo "No Supabase project to set up. Set SUPABASE_PROJECT_REF (in the environment or .env), or run \`supabase link --project-ref <ref>\` once." >&2
  exit 1
fi
[[ "$PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || { echo "\"$PROJECT_REF\" isn't a Supabase project ref." >&2; exit 1; }
echo "Setting up the Soapbox bot on Supabase project ${PROJECT_REF}."
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/soapbox-bot"

read -rsp "Telegram bot token (from @BotFather): " TOKEN; echo
read -rp "Your Telegram user ID (from @userinfobot): " OWNER_ID
[[ "$OWNER_ID" =~ ^[0-9]+$ ]] || { echo "The user ID should be a number." >&2; exit 1; }

BOT=$(curl -fsS "https://api.telegram.org/bot${TOKEN}/getMe" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p') \
  || { echo "Telegram didn't accept that token." >&2; exit 1; }
echo "✓ Token works for @${BOT}"

SECRET=$(openssl rand -hex 24)
ENV_FILE=$(mktemp)
trap 'rm -f "$ENV_FILE"' EXIT
chmod 600 "$ENV_FILE"
printf 'TELEGRAM_BOT_TOKEN=%s\nTELEGRAM_OWNER_ID=%s\nTELEGRAM_WEBHOOK_SECRET=%s\n' "$TOKEN" "$OWNER_ID" "$SECRET" > "$ENV_FILE"
supabase secrets set --project-ref "$PROJECT_REF" --env-file "$ENV_FILE" >/dev/null
echo "✓ Secrets stored in Supabase"

supabase functions deploy soapbox-bot --project-ref "$PROJECT_REF" --no-verify-jwt --use-api >/dev/null
echo "✓ Function deployed"

curl -fsS "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  --data-urlencode "url=${FUNCTION_URL}" \
  --data-urlencode "secret_token=${SECRET}" \
  --data-urlencode 'allowed_updates=["message","edited_message","callback_query"]' \
  --data-urlencode 'drop_pending_updates=true' >/dev/null
echo "✓ Webhook set"

curl -fsS "https://api.telegram.org/bot${TOKEN}/setMyCommands" -H 'content-type: application/json' -d '{"commands":[
  {"command":"rant","description":"Post a rant"},
  {"command":"note","description":"Post a note"},
  {"command":"at","description":"Stamp posts with a city, e.g. /at Tokyo"},
  {"command":"delete","description":"Hide the post you reply to, or the latest"},
  {"command":"watch","description":"New notes and chat messages here: on or off"},
  {"command":"add","description":"Add a song: /add <YouTube link>"},
  {"command":"songs","description":"The music library"},
  {"command":"remove","description":"Take a song out"},
  {"command":"offset","description":"Lyrics timing: /offset <song> <ms>"},
  {"command":"play","description":"Play a song for everyone on the desktop"},
  {"command":"stop","description":"Stop it"},
  {"command":"help","description":"What I can do"}]}' >/dev/null
echo "✓ Commands menu set"

echo
echo "Done. Open https://t.me/${BOT}, send /help, then say something."
