// A stand-in for the Supabase backend during `astro dev`, so Stickies and
// presence can be tried without a project: notes live in localStorage and
// presence goes between tabs of this browser over a BroadcastChannel. The
// whole browser counts as one visitor, so it gets one note.

import { AlreadyPostedError, type Note, type Social, type VisitorInfo } from './social';

const NOTES_KEY = 'os-dev-notes';
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
