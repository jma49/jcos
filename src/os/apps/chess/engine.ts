import type { Chess, PieceSymbol } from 'chess.js';

// The computer's side of Chess: a small alpha-beta search over chess.js's
// moves, looking two or three moves ahead and then following the captures
// until the position is quiet, scored by material and where each piece
// stands. It runs in a worker (engine.worker.ts), so the window never
// waits on it; its moves come from chess.js, so they're always legal.
//
// It deepens one move at a time up to three, for 1.5 s at most (a slow
// device may stop at two), in the worker or, if the worker can't start, on
// the page. Below its own move it plays through
// chess.js's internal move list (`_moves`, `_makeMove`, `_undoMove`, as
// chess.js's `perft` does), since the public `move()` writes out notation
// and positions and makes a search about ten times slower.

const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Where each piece is worth more or less, from White's side, a8 first:
// Tomasz Michniewski's Simplified Evaluation Function.
// prettier-ignore
const PLACE: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0,
    0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20,
    15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0,
    -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0,
    -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5,
    5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20
  ]
};

/** The king in the endgame, when it should come out and fight. */
// prettier-ignore
const KING_LATE = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10,
  30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50
];

/** A checkmate's score, less the moves it takes, so a sooner mate scores higher. */
export const MATE = 100_000;
/** How many captures in a row the search follows past its depth. */
const CAPTURES_DEEP = 4;

/**
 * The position's score for the side to move, in centipawns: material and
 * placement. The endgame (no queens, or a queen with at most one minor
 * piece beside it) brings the kings out.
 */
export function evaluate(chess: Chess): number {
  const board = chess.board();
  let score = 0;
  const queens = { w: 0, b: 0 };
  const others = { w: 0, b: 0 };
  const kings: { color: 'w' | 'b'; at: number }[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      // The tables are drawn for White; Black's are the same, upside down.
      const at = (piece.color === 'w' ? row : 7 - row) * 8 + col;
      if (piece.type === 'k') kings.push({ color: piece.color, at });
      else score += (piece.color === 'w' ? 1 : -1) * (VALUE[piece.type] + PLACE[piece.type][at]);
      if (piece.type === 'q') queens[piece.color]++;
      else if (piece.type === 'r') others[piece.color] += 2;
      else if (piece.type === 'n' || piece.type === 'b') others[piece.color]++;
    }
  }
  const late = (['w', 'b'] as const).every((c) => queens[c] === 0 || others[c] <= 1);
  for (const { color, at } of kings) score += (color === 'w' ? 1 : -1) * (late ? KING_LATE : PLACE.k)[at];
  return chess.turn() === 'w' ? score : -score;
}

/** What a move does: which piece, what it takes, what it becomes. */
interface Worth {
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
}

/** A move as chess.js keeps it inside, its squares numbered. */
interface Raw extends Worth {
  from: number;
  to: number;
}

/**
 * chess.js's own move list, and its way of playing a move and taking it
 * back: what its perft() uses. The public move() and undo() also write
 * out every move's notation and position, which made a search several
 * times slower (a middlegame three moves deep: about two seconds on a
 * fast Mac, against a quarter of a second this way), so below the
 * computer's own move the search uses these. The tests run through
 * them: a chess.js release that changed them fails there.
 */
interface Inside {
  _moves(options: { legal: boolean }): Raw[];
  _makeMove(move: Raw): void;
  _undoMove(): unknown;
}

/**
 * How promising a move looks, so the best are tried first and the search
 * can cut the rest short: promotions, then captures, the most valuable
 * piece taken by the least valuable.
 */
const promise = (m: Worth) => (m.promotion ? 1000 + VALUE[m.promotion] : 0) + (m.captured ? 100 + 10 * VALUE[m.captured] - VALUE[m.piece] : 0);
const byPromise = <T extends Worth>(moves: T[]) => moves.sort((a, b) => promise(b) - promise(a));

/** Thrown to stop a search that has run out of time. */
const TIMEOUT = Symbol('timeout');

interface Search {
  chess: Chess;
  inside: Inside;
  nodes: number;
  deadline: number;
  /**
   * For each ply, the last two quiet moves that were too good for the
   * other side to allow there ("killers"): likely good again beside them,
   * so they're tried right after the captures.
   */
  killers: number[][];
}

const squares = (m: Raw) => m.from * 128 + m.to;

function remember(s: Search, ply: number, move: Raw) {
  const killers = (s.killers[ply] ??= []);
  if (killers[0] === squares(move)) return;
  killers.unshift(squares(move));
  killers.length = Math.min(killers.length, 2);
}

function tick(s: Search) {
  if ((++s.nodes & 255) === 0 && performance.now() > s.deadline) throw TIMEOUT;
}

/** `look`'s score with `move` played, taken back afterwards even if the search stops. */
function after(s: Search, move: Raw, look: () => number) {
  s.inside._makeMove(move);
  try {
    return look();
  } finally {
    s.inside._undoMove();
  }
}

/**
 * The captures (and promotions) that follow, until the position is quiet:
 * so the search doesn't stop in the middle of an exchange and think a
 * piece is safe when it's about to be taken. In check, every way out.
 */
function quiesce(s: Search, alpha: number, beta: number, ply: number, left: number): number {
  tick(s);
  const { chess } = s;
  const moves = s.inside._moves({ legal: true });
  const check = chess.isCheck();
  if (!moves.length) return check ? -(MATE - ply) : 0;
  let stand = -Infinity;
  if (!check) {
    stand = evaluate(chess);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  }
  if (left === 0) return check ? Math.min(beta, Math.max(alpha, evaluate(chess))) : alpha;
  // A capture that couldn't make up the difference even with a little to
  // spare isn't worth following.
  const gain = (m: Raw) => (m.captured ? VALUE[m.captured] : 0) + (m.promotion ? VALUE[m.promotion] - VALUE.p : 0);
  const worth = check ? moves : moves.filter((m) => (m.captured || m.promotion) && stand + gain(m) + 200 > alpha);
  for (const move of byPromise(worth)) {
    const score = -after(s, move, () => quiesce(s, -beta, -alpha, ply + 1, left - 1));
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(s: Search, depth: number, alpha: number, beta: number, ply: number): number {
  tick(s);
  const { chess } = s;
  // Stalemate is found below, with the moves; repetition after the
  // computer's own move, in bestMove().
  if (chess.isDrawByFiftyMoves() || chess.isInsufficientMaterial()) return 0;
  if (depth === 0) return quiesce(s, alpha, beta, ply, CAPTURES_DEEP);
  const moves = s.inside._moves({ legal: true });
  if (!moves.length) return chess.isCheck() ? -(MATE - ply) : 0;
  const killers = s.killers[ply] ?? [];
  const rank = (m: Raw) => promise(m) || (killers.includes(squares(m)) ? 50 : 0);
  for (const move of moves.sort((a, b) => rank(b) - rank(a))) {
    const score = -after(s, move, () => search(s, depth - 1, -beta, -alpha, ply + 1));
    if (score >= beta) {
      if (!move.captured) remember(s, ply, move);
      return beta;
    }
    if (score > alpha) alpha = score;
  }
  return alpha;
}

export interface Think {
  /** How many moves ahead (plies), at most. */
  depth?: number;
  /** How long it may take, in milliseconds: a deeper look that runs over is dropped for the last one finished. */
  ms?: number;
  /** For choosing between moves that score the same, so games differ. */
  random?: () => number;
}

/**
 * The move the computer plays in `chess`'s position, in SAN, or null when
 * the game is over. It looks one move ahead, then two, then three, and
 * keeps the best move of the deepest look that finished in time. `chess`
 * is played through while it thinks and left as it was.
 */
export function bestMove(chess: Chess, { depth = 3, ms = Infinity, random = Math.random }: Think = {}): string | null {
  if (chess.isGameOver()) return null;
  const s: Search = { chess, inside: chess as unknown as Inside, nodes: 0, deadline: performance.now() + ms, killers: [] };
  // Shuffled first, so moves that score the same take turns being chosen.
  let order = byPromise(shuffle(chess.moves({ verbose: true }), random));
  let best = order[0];
  for (let d = 1; d <= depth; d++) {
    let alpha = -Infinity;
    let pick = best;
    try {
      for (const move of order) {
        // Its own move is played in full, so chess.js counts the position
        // and a third repetition shows as the draw it is.
        chess.move(move);
        let score: number;
        try {
          score = chess.isThreefoldRepetition() ? 0 : -search(s, d - 1, -Infinity, -alpha, 1);
        } finally {
          chess.undo();
        }
        if (score > alpha) {
          alpha = score;
          pick = move;
        }
      }
    } catch (e) {
      if (e === TIMEOUT) break;
      throw e;
    }
    best = pick;
    // The best move so far is looked at first next time.
    order = [best, ...order.filter((m) => m !== best)];
    if (alpha >= MATE - depth) break;
  }
  return best.san;
}

function shuffle<T>(items: T[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
