import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { bestMove, evaluate } from './engine';

// The computer's play: always a legal move, a mate when there's one, and
// no queen left where it can be taken for nothing.

/** A random number generator with a seed, so a test sees the same games every run. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Whether the side to move can take a queen. */
const canTakeQueen = (chess: Chess) => chess.moves({ verbose: true }).some((m) => m.captured === 'q');

describe('bestMove', () => {
  test('answers with a legal move, from the start and from games played at random', () => {
    const random = seeded(7);
    for (let game = 0; game < 6; game++) {
      const chess = new Chess();
      for (let ply = 0; ply < 10 + game * 6 && !chess.isGameOver(); ply++) {
        const moves = chess.moves();
        chess.move(moves[Math.floor(random() * moves.length)]);
      }
      if (chess.isGameOver()) continue;
      const fen = chess.fen();
      const move = bestMove(chess, { depth: 2, random });
      expect(chess.moves()).toContain(move);
      // Thinking leaves the game as it was.
      expect(chess.fen()).toBe(fen);
    }
  });

  test.each([
    ['the fool’s mate', 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', 'Qh4#'],
    ['a back-rank mate', 'r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', 'Ra1#'],
    ['the scholar’s mate, for White', 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'Qxf7#']
  ])('takes a mate in one: %s', (_, fen, mate) => {
    expect(bestMove(new Chess(fen), { random: seeded(1) })).toBe(mate);
  });

  test.each([
    ['a queen a pawn attacks moves or takes it', '4k3/8/8/4q3/3P4/8/8/6K1 b - - 0 1'],
    ['a defended pawn isn’t worth the queen', '3qk3/8/8/8/3P4/2P5/8/4K3 b - - 0 1'],
    ['nor is a knight guarded by a pawn', '4k3/8/8/2q5/8/3N4/2P5/4K3 b - - 0 1']
  ])('doesn’t hang its queen: %s', (_, fen) => {
    for (const seed of [1, 2, 3]) {
      const chess = new Chess(fen);
      chess.move(bestMove(chess, { random: seeded(seed) })!);
      expect(canTakeQueen(chess)).toBe(false);
    }
  });

  test('has nothing to play when the game is over', () => {
    expect(bestMove(new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'))).toBeNull(); // mated
    expect(bestMove(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBeNull(); // stalemate
  });

  test('out of time, still a legal move', () => {
    const chess = new Chess();
    chess.move('e4');
    expect(chess.moves()).toContain(bestMove(chess, { ms: 0 }));
  });
});

describe('evaluate', () => {
  test('the start is even, whichever side is to move', () => {
    const chess = new Chess();
    expect(Math.abs(evaluate(chess))).toBe(0);
    chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
    expect(Math.abs(evaluate(chess))).toBe(0);
  });

  test('a piece up is better for its side, and worse for the other', () => {
    const chess = new Chess('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); // Black without a queen
    expect(evaluate(chess)).toBeGreaterThan(800);
    chess.load('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
    expect(evaluate(chess)).toBeLessThan(-800);
  });
});
