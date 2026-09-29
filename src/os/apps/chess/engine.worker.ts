import { bestMove } from './engine';
import { replay } from './rules';

// The computer thinks here, off the page's thread, so the window never
// freezes while it does (Chess.tsx asks). It's sent the game's moves, so
// repetitions count, and answers with its move in SAN.

/** How long it may think: a slow phone looks two moves ahead rather than three. */
const THINK_MS = 1500;

export interface Ask {
  id: number;
  moves: string[];
}

export interface Answer {
  id: number;
  move: string | null;
}

self.onmessage = (e: MessageEvent<Ask>) => {
  const answer: Answer = { id: e.data.id, move: bestMove(replay(e.data.moves).chess, { ms: THINK_MS }) };
  self.postMessage(answer);
};
