// Presence between this browser's tabs, over a BroadcastChannel: each tab
// says hello every couple of seconds, and one not heard from for a while
// has left.

import { cleanCursor, cleanInfo, type PresenceSocial, type VisitorInfo } from '../visitors';

const HEARTBEAT = 2000;
const EXPIRE = 5000;

export function localVisitors(): PresenceSocial {
  return {
    joinPresence(info, { onVisitors, onCursor, onLeave, onSignal }) {
      const id = crypto.randomUUID();
      const channel = new BroadcastChannel('os-dev-presence');
      const peers = new Map<string, { seen: number; info: VisitorInfo }>();
      let me = info;
      const report = () =>
        onVisitors([{ id, ...me, self: true }, ...[...peers].map(([peer, { info }]) => ({ id: peer, ...info }))]);

      channel.onmessage = ({ data }) => {
        if (data.type === 'signal') return onSignal({ event: data.event, from: data.id, payload: data.payload ?? {} });
        if (data.type === 'bye') {
          peers.delete(data.id);
          onLeave(data.id);
        } else {
          peers.set(data.id, { seen: Date.now(), info: cleanInfo(data.info ?? peers.get(data.id)?.info ?? { color: data.color }, data.color) });
          const cursor = data.type === 'cursor' && cleanCursor(data, (peer) => peers.has(peer));
          if (cursor) onCursor(cursor);
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
        id,
        moveCursor: (x, y) => channel.postMessage({ type: 'cursor', id, x, y, color: me.color }),
        signal: (event, payload) => channel.postMessage({ type: 'signal', id, event, payload }),
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
