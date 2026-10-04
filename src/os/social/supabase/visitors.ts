// Presence over a Realtime channel: who's on the desktop (presence, keyed
// by a random id per page), their pointers and signals (broadcast). Anyone
// with the public key can send anything, so what arrives is cleaned.

import { CURSOR_COLORS, cleanCursor, cleanInfo, type PresenceSocial, type VisitorInfo } from '../visitors';
import type { SupabaseContext } from './context';

export function supabaseVisitors({ client }: SupabaseContext): PresenceSocial {
  return {
    joinPresence(info, { onVisitors, onCursor, onLeave, onSignal }) {
      const id = crypto.randomUUID();
      let me: VisitorInfo = info;
      let subscribed = false;
      const channel = client.channel('desktop', {
        config: { presence: { key: id }, broadcast: { self: false } }
      });
      const visitors = () =>
        Object.entries(channel.presenceState<VisitorInfo>()).map(([key, [meta]]) => ({
          ...cleanInfo(meta, CURSOR_COLORS[0]),
          id: key,
          self: key === id
        }));
      channel
        .on('presence', { event: 'sync' }, () => onVisitors(visitors()))
        .on('presence', { event: 'leave' }, ({ key }) => onLeave(key))
        .on('broadcast', { event: 'cursor' }, ({ payload }) => {
          const cursor = cleanCursor(payload, (key) => key !== id && Object.hasOwn(channel.presenceState(), key));
          if (cursor) onCursor(cursor);
        })
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          if (typeof payload?.event !== 'string' || typeof payload?.from !== 'string') return;
          onSignal({ event: payload.event, from: payload.from, payload: payload.payload ?? {} });
        })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          subscribed = true;
          channel.track(me);
        });
      return {
        id,
        moveCursor: (x, y) => {
          channel.send({ type: 'broadcast', event: 'cursor', payload: { id, x, y, color: me.color } });
        },
        signal: (event, payload) => {
          channel.send({ type: 'broadcast', event: 'signal', payload: { event, from: id, payload } });
        },
        update: (next) => {
          me = next;
          if (subscribed) channel.track(me);
        },
        leave: () => {
          client.removeChannel(channel);
        }
      };
    }
  };
}
