// A member's own stickies in this browser, each account's apart, with the
// database's rules: its checks, sticky_limit, and a change of the text
// from an older version refused.

import { loadJSON, saveJSON } from '../../core/storage';
import { changedElsewhere, SocialError } from '../errors';
import { NOTE_COLORS } from '../notes';
import { STICKY_MAX, STICKY_MOST, type StickiesSocial, type Sticky, type StickyChange } from '../stickies';
import type { LocalContext } from './context';

/** Every member's own stickies, by account id. */
const STICKIES_KEY = 'os-dev-stickies';

/** The database's checks on a sticky. */
const checkSticky = (s: StickyChange) => {
  const size = (n: number | undefined, least: number, most: number) => n === undefined || (Number.isInteger(n) && n >= least && n <= most);
  const ok =
    (s.body === undefined || s.body.length <= STICKY_MAX) &&
    (s.color === undefined || NOTE_COLORS.includes(s.color)) &&
    size(s.x, 0, 10000) &&
    size(s.y, 0, 10000) &&
    size(s.width, 120, 900) &&
    size(s.height, 60, 900);
  if (!ok) throw new SocialError('invalid', 'A sticky holds 4,000 characters at most, in one of its six colours.');
};

export function localStickies({ account, member }: LocalContext): StickiesSocial {
  /** Changes the member's stored stickies from what's stored now; a refusal thrown by `change` stores nothing. */
  const changeStickies = <T,>(change: (mine: Sticky[]) => T): T => {
    const all = loadJSON<Record<string, Sticky[]>>(STICKIES_KEY, {});
    const mine = all[member().id] ?? [];
    const result = change(mine);
    saveJSON(STICKIES_KEY, { ...all, [member().id]: mine });
    return result;
  };

  return {
    async myStickies() {
      const current = account();
      if (!current) return [];
      return loadJSON<Record<string, Sticky[]>>(STICKIES_KEY, {})[current.id] ?? [];
    },
    async addSticky(sticky) {
      checkSticky(sticky);
      return changeStickies((mine) => {
        if (mine.length >= STICKY_MOST) throw new SocialError('limit', `You have ${STICKY_MOST} stickies already. Close one first.`);
        const made: Sticky = {
          id: crypto.randomUUID(),
          body: '',
          color: 'yellow',
          x: 60,
          y: 60,
          width: 220,
          height: 180,
          collapsed: false,
          ...sticky,
          version: 1,
          updated: new Date().toISOString()
        };
        mine.push(made);
        return made;
      });
    },
    async changeSticky(id, change, version) {
      checkSticky(change);
      return changeStickies((mine) => {
        const at = mine.findIndex((s) => s.id === id && (change.body === undefined || version === undefined || s.version === version));
        if (at < 0) throw changedElsewhere();
        const was = mine[at];
        const text = change.body !== undefined && change.body !== was.body;
        mine[at] = { ...was, ...change, version: text ? was.version + 1 : was.version, updated: new Date().toISOString() };
        return mine[at];
      });
    },
    async removeSticky(id) {
      changeStickies((mine) => {
        const at = mine.findIndex((s) => s.id === id);
        if (at >= 0) mine.splice(at, 1);
      });
    }
  };
}
