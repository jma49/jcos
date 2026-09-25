// A stand-in for the Supabase backend during `astro dev`, so Stickies and
// presence can be tried without a project: notes live in localStorage and
// presence goes between tabs of this browser over a BroadcastChannel.
// Posted notes appear after a short "review", to mimic moderation.

import type { Note, Social } from './social';

const NOTES_KEY = 'os-dev-notes';
const HEARTBEAT = 2000;
const EXPIRE = 5000;

function readNotes(): (Note & { visibleAt: number })[] {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function localSocial(): Social {
  return {
    async listNotes() {
      const now = Date.now();
      return readNotes()
        .filter((n) => n.visibleAt <= now)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async postNote(note) {
      const notes = readNotes();
      notes.push({
        ...note,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        visibleAt: Date.now() + 10_000
      });
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    },

    joinPresence(color, { onCount, onCursor, onLeave }) {
      const id = crypto.randomUUID();
      const channel = new BroadcastChannel('os-dev-presence');
      const peers = new Map<string, number>();
      const count = () => onCount(peers.size + 1);

      channel.onmessage = ({ data }) => {
        if (data.type === 'bye') {
          peers.delete(data.id);
          onLeave(data.id);
        } else {
          peers.set(data.id, Date.now());
          if (data.type === 'cursor') onCursor(data.id, data.x, data.y, data.color);
        }
        count();
      };

      const beat = setInterval(() => {
        channel.postMessage({ type: 'hello', id });
        for (const [peer, seen] of peers) {
          if (Date.now() - seen > EXPIRE) {
            peers.delete(peer);
            onLeave(peer);
          }
        }
        count();
      }, HEARTBEAT);
      channel.postMessage({ type: 'hello', id });
      count();

      return {
        moveCursor: (x, y) => channel.postMessage({ type: 'cursor', id, x, y, color }),
        leave: () => {
          clearInterval(beat);
          channel.postMessage({ type: 'bye', id });
          channel.close();
        }
      };
    }
  };
}
