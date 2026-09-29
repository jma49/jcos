import { Chess, type Color, type Move, type Square } from 'chess.js';

// What the Chess window says about a game, by chess.js's rules: the game
// from its moves, how it stands, the last move as a score sheet writes it
// and where a piece can go.

/** The most moves a game keeps; no real game comes near it. */
export const MOST_MOVES = 1000;

const SIDE: Record<Color, string> = { w: 'White', b: 'Black' };

/**
 * A game from its moves (in SAN), as far as they're legal: a saved game
 * may be stale or edited by hand. With the moves kept and the last one
 * played, for the board to show.
 */
export function replay(moves: readonly string[]): { chess: Chess; moves: string[]; last: Move | null } {
  const chess = new Chess();
  const played: string[] = [];
  let last: Move | null = null;
  for (const san of moves.slice(0, MOST_MOVES)) {
    try {
      last = chess.move(san);
    } catch {
      break;
    }
    played.push(last.san);
  }
  return { chess, moves: played, last };
}

/** How the game stands, for the status bar: whose move it is, or how it ended. */
export function standing(chess: Chess): { text: string; over: boolean } {
  if (chess.isCheckmate()) return { text: `Checkmate · ${SIDE[chess.turn() === 'w' ? 'b' : 'w']} wins`, over: true };
  if (chess.isStalemate()) return { text: 'Stalemate · a draw', over: true };
  if (chess.isThreefoldRepetition()) return { text: 'Draw by repetition', over: true };
  if (chess.isInsufficientMaterial()) return { text: 'Draw · neither side can mate', over: true };
  if (chess.isDrawByFiftyMoves()) return { text: 'Draw by the fifty-move rule', over: true };
  return { text: `${SIDE[chess.turn()]}’s move${chess.isCheck() ? ', in check' : ''}`, over: false };
}

/** The last move as a score sheet writes it: "3. Nf3" for White's, "3. … Nf6" for Black's. */
export function lastMove(moves: readonly string[]): string | null {
  const n = moves.length;
  if (!n) return null;
  const number = Math.ceil(n / 2);
  return n % 2 ? `${number}. ${moves[n - 1]}` : `${number}. … ${moves[n - 1]}`;
}

/** Where the piece on `from` can go, each square once, and whether going there promotes it. */
export function targetsOf(chess: Chess, from: Square): { to: Square; promotes: boolean }[] {
  const seen = new Map<Square, boolean>();
  for (const m of chess.moves({ square: from, verbose: true })) seen.set(m.to, !!m.promotion);
  return [...seen].map(([to, promotes]) => ({ to, promotes }));
}
