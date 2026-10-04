// DVD Player's shelf: the discs Jincheng burned for everyone. The
// Supabase side is supabase/discs.ts, the stand-in's local/discs.ts; the
// Disc itself is the library's (src/lib/library.ts).

import type { Disc } from '../../lib/library';

export interface DiscsSocial {
  /** DVD Player's shelf as the database has it now (the library's copy can be a minute old). */
  shelf: () => Promise<Disc[]>;
  /** Burns a disc for everyone, as the shelf keeps it. Only the owner may. */
  burnDisc: (disc: Omit<Disc, 'added'>) => Promise<Disc>;
  /** Changes one of the discs: its name, its case, or its length once known. Only the owner may. */
  relabelDisc: (id: string, change: Partial<Pick<Disc, 'title' | 'artist' | 'cover' | 'coverX' | 'duration'>>) => Promise<void>;
  /** Takes a disc off the shelf. Only the owner may. */
  removeDisc: (id: string) => Promise<void>;
  /**
   * Calls back as discs are burned (`burned`), relabelled or taken off the
   * shelf, from any page or the bot; returns a function that stops watching.
   */
  watchDiscs: (handlers: { onDisc: (disc: Disc, burned: boolean) => void; onRemove: (id: string) => void }) => () => void;
}
