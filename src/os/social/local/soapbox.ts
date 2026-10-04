// Soapbox in this browser: sample posts (the real ones come from the
// Telegram bot) and reactions, one per post for someone signed out.

import { loadJSON, saveJSON } from '../../core/storage';
import { SocialError } from '../errors';
import type { Post, Reaction, SoapboxSocial } from '../soapbox';
import type { LocalContext } from './context';

const REACTIONS_KEY = 'os-dev-reactions';

/** Reactions by post, then by who: an account id, or 'browser' for someone signed out. */
type StoredReactions = Record<string, Record<string, Reaction>>;

/** Stand-in Soapbox posts; the real ones come from the Telegram bot. */
const SAMPLE_POSTS: Omit<Post, 'reactions'>[] = [
  {
    id: 'sample-4',
    body: 'Tahoe this weekend. The lake does the blue thing on purpose.',
    kind: 'note',
    place: 'South Lake Tahoe',
    weather: '☀️ 64°F',
    created_at: '2026-09-25T20:30:00Z',
    // Stand-ins from the desktop pictures; real ones come from the bot.
    images: [
      { url: '/os/wallpapers/photos/landscapes/mono_lake.webp', width: 2560, height: 1600 },
      { url: '/os/wallpapers/photos/landscapes/french_alps.webp', width: 2560, height: 1600 }
    ]
  },
  {
    id: 'sample-3',
    body: 'Sent a V6 today after three weeks on it. The trick was trusting the left heel hook.',
    kind: 'note',
    place: 'San Jose',
    weather: '☀️ 74°F',
    created_at: '2026-09-24T02:10:00Z',
    images: []
  },
  {
    id: 'sample-2',
    body: 'Flaky test of the week: passes locally, fails in CI, and only on Tuesdays. Time zones. It is always time zones.',
    kind: 'rant',
    place: 'San Jose',
    weather: '⛅ 68°F',
    created_at: '2026-09-22T18:40:00Z',
    images: []
  },
  {
    id: 'sample-1',
    body: 'Rebuilt my portfolio as a fake Mac OS X desktop. No regrets.\nOkay, a few regrets about CSS gradients.',
    kind: 'note',
    place: 'San Jose',
    weather: '🌫️ 61°F',
    created_at: '2026-09-20T05:15:00Z',
    images: []
  }
];

export function localSoapbox({ account, member }: LocalContext): SoapboxSocial {
  return {
    async listPosts() {
      const all = loadJSON<StoredReactions>(REACTIONS_KEY, {});
      return SAMPLE_POSTS.map((p) => {
        const reactions: Post['reactions'] = {};
        for (const r of Object.values(all[p.id] ?? {})) reactions[r] = (reactions[r] ?? 0) + 1;
        return { ...p, reactions };
      });
    },

    async myReactions() {
      const current = account();
      if (!current) return {};
      const all = loadJSON<StoredReactions>(REACTIONS_KEY, {});
      return Object.fromEntries(Object.entries(all).flatMap(([post, by]) => (by[current.id] ? [[post, by[current.id]]] : [])));
    },

    async react(postId, reaction) {
      const current = account();
      const all = loadJSON<StoredReactions>(REACTIONS_KEY, {});
      const who = current?.id ?? 'browser';
      const by = { ...(all[postId] ?? {}) };
      // Taking one back is a member's (as the database has it), asked first.
      if (reaction === null) delete by[member().id];
      else if (!current && by[who]) throw new SocialError('already', 'Someone on your network already reacted to this one.');
      else by[who] = reaction;
      saveJSON(REACTIONS_KEY, { ...all, [postId]: by });
    }
  };
}
