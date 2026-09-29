import { loadJSON, onStored, saveJSON } from '../../core/storage';
import { MOST_MOVES } from './rules';

// The game in progress, kept in this browser (os-chess) so a reload goes
// on from where it was. Every tab of a visitor's shows the same game: a
// move or a new game in one appears in the others (Chess.tsx follows the
// key). What's stored is checked, since it may be stale or edited by hand.

const KEY = 'os-chess';

/** The stored game's moves, or null when there's none, or it can't be read. */
export function storedMoves(): string[] | null {
  const saved = loadJSON<{ moves?: unknown } | null>(KEY, null);
  const moves = saved && typeof saved === 'object' ? saved.moves : null;
  return Array.isArray(moves) ? moves.filter((m): m is string => typeof m === 'string').slice(0, MOST_MOVES) : null;
}

export const storeMoves = (moves: string[]) => saveJSON(KEY, { moves });

/** Calls back when another tab changes the game; returns a function that stops. */
export const onMovesStored = (callback: () => void) => onStored(KEY, callback);
