// A stand-in for the Supabase backend during `astro dev`, so Stickies and
// presence can be tried without a project: notes live in localStorage and
// presence goes between tabs of this browser over a BroadcastChannel. The
// whole browser counts as one visitor, so it gets one note.

import { AlreadyPostedError, type Note, type Post, type Reaction, type Social, type VisitorInfo } from './social';

const NOTES_KEY = 'os-dev-notes';
const REACTIONS_KEY = 'os-dev-reactions';

/** Stand-in Soapbox posts; the real ones come from the Telegram bot. */
const SAMPLE_POSTS: Omit<Post, 'reactions'>[] = [
  {
    id: 'sample-3',
    body: 'Sent a V6 today after three weeks on it. The trick was trusting the left heel hook.',
    kind: 'note',
    place: 'San Jose',
    weather: '☀️ 74°F',
    created_at: '2026-09-24T02:10:00Z'
  },
  {
    id: 'sample-2',
    body: 'Flaky test of the week: passes locally, fails in CI, and only on Tuesdays. Time zones. It is always time zones.',
    kind: 'rant',
    place: 'San Jose',
    weather: '⛅ 68°F',
    created_at: '2026-09-22T18:40:00Z'
  },
  {
    id: 'sample-1',
    body: 'Rebuilt my portfolio as a fake Mac OS X desktop. No regrets.\nOkay, a few regrets about CSS gradients.',
    kind: 'note',
    place: 'San Jose',
    weather: '🌫️ 61°F',
    created_at: '2026-09-20T05:15:00Z'
  }
];
const HEARTBEAT = 2000;
const EXPIRE = 5000;

function readNotes(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function localSocial(): Social {
  return {
    async listNotes() {
      return readNotes().sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async postNote(note) {
      const notes = readNotes();
      if (notes.length > 0) throw new AlreadyPostedError();
      notes.push({ ...note, id: crypto.randomUUID(), created_at: new Date().toISOString() });
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    },

    async listPosts() {
      const mine: Record<string, Reaction> = JSON.parse(localStorage.getItem(REACTIONS_KEY) ?? '{}');
      return SAMPLE_POSTS.map((p) => ({ ...p, reactions: mine[p.id] ? { [mine[p.id]]: 1 } : {} }));
    },

    async react(postId, reaction) {
      const mine: Record<string, Reaction> = JSON.parse(localStorage.getItem(REACTIONS_KEY) ?? '{}');
      if (mine[postId]) throw new AlreadyPostedError();
      localStorage.setItem(REACTIONS_KEY, JSON.stringify({ ...mine, [postId]: reaction }));
    },

    joinPresence(info, { onVisitors, onCursor, onLeave }) {
      const id = crypto.randomUUID();
      const channel = new BroadcastChannel('os-dev-presence');
      const peers = new Map<string, { seen: number; info: VisitorInfo }>();
      let me = info;
      const report = () =>
        onVisitors([{ id, ...me, self: true }, ...[...peers].map(([peer, { info }]) => ({ id: peer, ...info }))]);

      channel.onmessage = ({ data }) => {
        if (data.type === 'bye') {
          peers.delete(data.id);
          onLeave(data.id);
        } else {
          peers.set(data.id, { seen: Date.now(), info: data.info ?? peers.get(data.id)?.info ?? { color: data.color } });
          if (data.type === 'cursor') onCursor(data.id, data.x, data.y, data.color);
        }
        report();
      };

      const hello = () => channel.postMessage({ type: 'hello', id, info: me });
      const beat = setInterval(() => {
        hello();
        for (const [peer, { seen }] of peers) {
          if (Date.now() - seen > EXPIRE) {
            peers.delete(peer);
            onLeave(peer);
          }
        }
        report();
      }, HEARTBEAT);
      hello();
      report();

      return {
        moveCursor: (x, y) => channel.postMessage({ type: 'cursor', id, x, y, color: me.color }),
        update: (next) => {
          me = next;
          hello();
          report();
        },
        leave: () => {
          clearInterval(beat);
          channel.postMessage({ type: 'bye', id });
          channel.close();
        }
      };
    }
  };
}
