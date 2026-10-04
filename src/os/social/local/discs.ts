// DVD Player's shelf in this browser; the member named DEV_OWNER is the
// owner. Changes are told to this browser's other tabs as Realtime tells
// other visitors.

import type { Disc } from '../../../lib/library';
import { loadJSON, saveJSON } from '../../core/storage';
import type { DiscsSocial } from '../discs';
import { SocialError } from '../errors';
import { DEV_OWNER, type LocalContext } from './context';

const DISCS_KEY = 'os-dev-discs';

type DiscChange = { type: 'disc'; disc: Disc; burned: boolean } | { type: 'remove'; id: string };

export function localDiscs({ member }: LocalContext): DiscsSocial {
  /** The stand-in's shelf changes, told to this browser's other tabs as Realtime tells other visitors. */
  const discChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('os-dev-discs');
  return {
    async shelf() {
      return loadJSON<Disc[]>(DISCS_KEY, []);
    },
    async burnDisc(disc) {
      if (member().username !== DEV_OWNER) throw new SocialError('failed', 'Only Jincheng can change the discs everyone sees.');
      const shelf = loadJSON<Disc[]>(DISCS_KEY, []);
      if (shelf.some((d) => d.id === disc.id)) throw new SocialError('already', 'That video is already on the shelf.');
      const burned: Disc = { ...disc, added: new Date().toISOString() };
      saveJSON(DISCS_KEY, [...shelf, burned]);
      discChannel?.postMessage({ type: 'disc', disc: burned, burned: true } satisfies DiscChange);
      return burned;
    },
    async relabelDisc(id, change) {
      if (member().username !== DEV_OWNER) throw new SocialError('failed', 'Only Jincheng can change the discs everyone sees.');
      const shelf = loadJSON<Disc[]>(DISCS_KEY, []).map((d) => (d.id === id ? { ...d, ...change } : d));
      saveJSON(DISCS_KEY, shelf);
      const disc = shelf.find((d) => d.id === id);
      if (disc) discChannel?.postMessage({ type: 'disc', disc, burned: false } satisfies DiscChange);
    },
    async removeDisc(id) {
      if (member().username !== DEV_OWNER) throw new SocialError('failed', 'Only Jincheng can change the discs everyone sees.');
      saveJSON(DISCS_KEY, loadJSON<Disc[]>(DISCS_KEY, []).filter((d) => d.id !== id));
      discChannel?.postMessage({ type: 'remove', id } satisfies DiscChange);
    },
    watchDiscs({ onDisc, onRemove }) {
      if (!discChannel) return () => {};
      const listener = ({ data }: MessageEvent<DiscChange>) => (data.type === 'disc' ? onDisc(data.disc, data.burned) : onRemove(data.id));
      discChannel.addEventListener('message', listener);
      return () => discChannel.removeEventListener('message', listener);
    }
  };
}
