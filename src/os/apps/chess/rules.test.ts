import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { lastMove, replay, standing, targetsOf } from './rules';
import { storedMoves, storeMoves } from './saved';

// What the Chess window says about a game, and the game kept for a reload.

describe('replay', () => {
  test('plays the moves, and keeps them as chess.js writes them', () => {
    const { chess, moves, last } = replay(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(chess.turn()).toBe('b');
    expect(last).toMatchObject({ from: 'f1', to: 'b5', san: 'Bb5' });
  });

  test('stops at the first move that isn’t legal', () => {
    expect(replay(['e4', 'e5', 'Ke3', 'Nf6']).moves).toEqual(['e4', 'e5']);
    expect(replay(['nonsense']).moves).toEqual([]);
    expect(replay([]).last).toBeNull();
  });
});

describe('standing', () => {
  test('whose move it is, and a check', () => {
    expect(standing(new Chess()).text).toBe('White’s move');
    expect(standing(replay(['e4', 'f5', 'Qh5+']).chess)).toEqual({ text: 'Black’s move, in check', over: false });
  });

  test('how it ended', () => {
    expect(standing(replay(['f3', 'e5', 'g4', 'Qh4#']).chess)).toEqual({ text: 'Checkmate · Black wins', over: true });
    expect(standing(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).text).toBe('Stalemate · a draw');
    expect(standing(new Chess('7k/8/6K1/8/8/8/8/8 w - - 0 1')).text).toBe('Draw · neither side can mate');
    expect(standing(replay(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']).chess).text).toBe('Draw by repetition');
  });
});

describe('lastMove', () => {
  test('as a score sheet writes it', () => {
    expect(lastMove([])).toBeNull();
    expect(lastMove(['e4'])).toBe('1. e4');
    expect(lastMove(['e4', 'e5', 'Nf3', 'Nc6'])).toBe('2. … Nc6');
  });
});

describe('targetsOf', () => {
  test('where a piece can go', () => {
    expect(
      targetsOf(new Chess(), 'g1')
        .map((t) => t.to)
        .sort()
    ).toEqual(['f3', 'h3']);
    expect(targetsOf(new Chess(), 'e1')).toEqual([]);
  });

  test('a square a pawn promotes on, once', () => {
    expect(targetsOf(new Chess('7k/4P3/8/8/8/8/8/K7 w - - 0 1'), 'e7')).toEqual([{ to: 'e8', promotes: true }]);
  });
});

describe('the saved game', () => {
  let map: Map<string, string>;
  beforeEach(() => {
    map = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => void map.set(key, value),
        removeItem: (key: string) => void map.delete(key)
      }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test('comes back as it was saved, under os-chess', () => {
    expect(storedMoves()).toBeNull();
    storeMoves(['e4', 'e5']);
    expect(map.get('os-chess')).toBe('{"moves":["e4","e5"]}');
    expect(storedMoves()).toEqual(['e4', 'e5']);
  });

  test('whatever else is stored there reads as no game, or only its moves', () => {
    map.set('os-chess', 'not json');
    expect(storedMoves()).toBeNull();
    map.set('os-chess', '{"moves":"e4"}');
    expect(storedMoves()).toBeNull();
    map.set('os-chess', '{"moves":["e4",5,null,"e5"]}');
    expect(storedMoves()).toEqual(['e4', 'e5']);
  });
});
