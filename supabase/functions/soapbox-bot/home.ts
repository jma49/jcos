// Jincheng's home folder, from Telegram: the bot's /diary and /doc. What's
// sent lands where the site's TextEdit keeps it (public.diary and
// public.documents, supabase/migrations/20260929160000_home.sql), which
// only the owner reads: in Finder, Users › jincheng › Documents.
//
//   /diary <text>   an entry in the diary, on the day it was sent where
//                   Jincheng is (the place /at set; San Jose to start)
//   /diary          today's entries: how many, and the latest
//   /doc <text>     a document in Documents, named after its first line
//                   ("Packing list.txt", or "Packing list 2.txt" if that's
//                   taken); the whole text is its body
//
// Each keeps the message it came from (telegram_message_id): editing the
// message edits the entry or the document, and a message Telegram
// delivers twice is saved once. None of it is public, and a photo sent
// with /diary or /doc goes nowhere (index.ts).

import type { Deps } from './music.ts';

/** The longest name a document takes from its first line, before ".txt". */
const NAME_MOST = 60;

/** The day `at` falls on in `timeZone`, as the diary keeps days (YYYY-MM-DD). */
export function dayIn(timeZone: string, at: Date): string {
  const parts = (zone: string) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at).map((p) => [p.type, p.value])
    );
  let p: Record<string, string>;
  try {
    p = parts(timeZone);
  } catch {
    p = parts('UTC');
  }
  return `${p.year}-${p.month}-${p.day}`;
}

/** "Tuesday, September 29", for a diary day. */
export const dayName = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

/**
 * A document's name from its text: the first line, made into a name the
 * database takes (one line, no slash or colon, not hidden), at most 60
 * characters, cut at a word, with ".txt". "Untitled.txt" if there's
 * nothing to go on.
 */
export function nameFrom(text: string): string {
  const line = text
    .split('\n')[0]
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[/:]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.txt$/i, '')
    .trim()
    .replace(/^[.\s]+/, '');
  // By characters, not UTF-16 units, so an emoji is never cut in half.
  const chars = Array.from(line);
  let name = chars.slice(0, NAME_MOST).join('');
  if (chars.length > NAME_MOST) name = name.replace(/\s+\S*$/, '') || name;
  return `${name.trim() || 'Untitled'}.txt`;
}

/** `name`, or the first of "Name 2.txt", "Name 3.txt"… not in `taken`, whatever the case (as the site's newName does). */
export function freeName(name: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const base = name.replace(/\.txt$/i, '');
  let next = name;
  for (let n = 2; used.has(next.toLowerCase()); n++) next = `${base} ${n}.txt`;
  return next;
}

interface Sent {
  message_id: number;
  chat: { id: number };
  /** When it was sent (Unix seconds). */
  date?: number;
}

export function homeCommands({ db, telegram, timeZone }: Deps & { timeZone: () => Promise<string> }) {
  const say = (chat: number, text: string, replyTo?: number) =>
    telegram('sendMessage', {
      chat_id: chat,
      text,
      reply_parameters: replyTo ? { message_id: replyTo, allow_sending_without_reply: true } : undefined,
      link_preview_options: { is_disabled: true }
    });
  const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
  /** What the database said ("The diary is full…"), else the whole error. */
  const said = (error: unknown) => {
    const text = reason(error);
    const message = text.match(/"message":"((?:[^"\\]|\\.)*)"/)?.[1];
    return message ? JSON.parse(`"${message}"`) : text;
  };
  /** Saved already: Telegram delivered the message again, and it was answered then. */
  const again = (error: unknown) => /duplicate key/i.test(reason(error)) && /_telegram_message/.test(reason(error));
  const dayOf = async (message: Sent) => dayIn(await timeZone(), new Date((message.date ?? Date.now() / 1000) * 1000));

  async function write(message: Sent, body: string) {
    const day = await dayOf(message);
    try {
      await db('diary', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ day, body, telegram_message_id: message.message_id })
      });
    } catch (error) {
      if (again(error)) return;
      throw error;
    }
    await say(message.chat.id, `📔 In your diary for ${dayName(day)}.`, message.message_id);
  }

  async function today(message: Sent) {
    const day = await dayOf(message);
    const entries: { body: string }[] = await db(`diary?day=eq.${day}&select=body&order=created_at.desc`);
    if (!entries.length) return say(message.chat.id, `Nothing in your diary for ${dayName(day)} yet. /diary <text> to write.`);
    const latest = entries[0].body.length > 120 ? `${entries[0].body.slice(0, 120)}…` : entries[0].body;
    const count = entries.length === 1 ? 'One entry' : `${entries.length} entries`;
    return say(message.chat.id, `📔 ${dayName(day)}: ${count}. The latest:\n\n${latest}`);
  }

  async function document(message: Sent, body: string) {
    const name = nameFrom(body);
    // Named the same meanwhile (two sent at once): the next free name, a few times over.
    for (let tries = 0; tries < 3; tries++) {
      const taken: { name: string }[] = await db('documents?folder=eq.documents&select=name');
      const free = freeName(
        name,
        taken.map((d) => d.name)
      );
      try {
        await db('documents', {
          method: 'POST',
          headers: { prefer: 'return=minimal' },
          body: JSON.stringify({ folder: 'documents', name: free, body, telegram_message_id: message.message_id })
        });
      } catch (error) {
        if (again(error)) return;
        if (/duplicate key/i.test(reason(error)) && /documents_name/.test(reason(error))) continue;
        throw error;
      }
      return say(message.chat.id, `📄 In Documents as “${free}”.`, message.message_id);
    }
    throw new Error('Documents kept taking the name it was given. Try again.');
  }

  const commandOf = (text: string) => {
    const command = text.match(/^\/(diary|doc)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
    return command ? { which: command[1].toLowerCase() as 'diary' | 'doc', body: (command[2] ?? '').trim() } : null;
  };

  return {
    /** A /diary or /doc; false for anything else. */
    async handle(message: Sent, text: string): Promise<boolean> {
      const command = commandOf(text);
      if (!command) return false;
      const chat = message.chat.id;
      try {
        if (command.which === 'diary') await (command.body ? write(message, command.body) : today(message));
        else if (command.body) await document(message, command.body);
        else await say(chat, 'Send the text after /doc. Its first line names it: /doc Packing list, then the list on the lines below.');
      } catch (error) {
        // Only the owner gets here, so say what went wrong.
        await say(chat, `Couldn’t save it; nothing changed.\n\n${said(error).slice(0, 300)}`, message.message_id).catch(() => {});
      }
      return true;
    },

    /** An edited /diary or /doc message edits what it made; false for anything else. Emptied, it's left as it was. */
    async edit(message: Sent, text: string): Promise<boolean> {
      const command = commandOf(text);
      if (!command) return false;
      if (!command.body) return true;
      const table = command.which === 'diary' ? 'diary' : 'documents';
      await db(`${table}?telegram_message_id=eq.${message.message_id}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ body: command.body })
      });
      return true;
    }
  };
}
