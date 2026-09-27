import { describe, expect, test } from 'vitest';
import { bestTarget, hint, move, movable, newGame, runStart, settle, type Card, type Game, type Suit } from './rules';

const card = (rank: number, suit: Suit = '♠', up = true): Card => ({ id: Math.random(), rank, suit, up });
const game = (columns: Card[][], stock: Card[] = []): Game => ({ columns, stock, done: [], score: 500, moves: 0 });
const empty = () => Array.from({ length: 10 }, () => [] as Card[]);

describe('dealing', () => {
  test.each([1, 2, 4] as const)('%i suits: 104 cards, 54 on the table, 50 in the stock', (suits) => {
    const g = newGame(suits);
    expect(g.columns.map((c) => c.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    expect(g.stock).toHaveLength(50);
    expect(new Set([...g.columns.flat(), ...g.stock].map((c) => c.suit)).size).toBe(suits);
    // Eight of each rank: two decks' worth.
    const all = [...g.columns.flat(), ...g.stock];
    for (let rank = 1; rank <= 13; rank++) expect(all.filter((c) => c.rank === rank)).toHaveLength(8);
    // Only the top card of each column is face up.
    for (const col of g.columns) expect(col.map((c) => c.up)).toEqual([...Array(col.length - 1).fill(false), true]);
  });
});

describe('moving', () => {
  test('a run of one suit moves together; a mixed one only from where the suit starts', () => {
    const col = [card(9, '♥'), card(8, '♠'), card(7, '♠'), card(6, '♠')];
    expect(runStart(col)).toBe(1);
    expect(movable(col, 1)).toBe(true);
    expect(movable(col, 0)).toBe(false);
    expect(movable([card(5, '♠', false), card(4)], 0)).toBe(false);
  });

  test('onto a card one higher of any suit, or an empty column', () => {
    const cols = empty();
    cols[0] = [card(7, '♠'), card(6, '♠')];
    cols[1] = [card(8, '♥')];
    cols[2] = [card(9, '♠')];
    const g = game(cols);
    expect(move(g, 0, 0, 1)).not.toBeNull();
    expect(move(g, 0, 0, 2)).toBeNull();
    const moved = move(g, 0, 1, 3)!;
    expect(moved.columns[3].map((c) => c.rank)).toEqual([6]);
    expect(moved.score).toBe(499);
    expect(moved.moves).toBe(1);
  });

  test('uncovering a face-down card turns it up', () => {
    const cols = empty();
    cols[0] = [card(3, '♠', false), card(5)];
    cols[1] = [card(6)];
    const moved = move(game(cols), 0, 1, 1)!;
    expect(moved.columns[0][0].up).toBe(true);
  });

  test('a click goes onto the same suit first', () => {
    const cols = empty();
    cols[0] = [card(5, '♥')];
    cols[1] = [card(6, '♠')];
    cols[2] = [card(6, '♥')];
    expect(bestTarget(game(cols), 0, 0)).toBe(2);
  });
});

test('a King-to-Ace run of one suit leaves the table for 100 points', () => {
  const cols = empty();
  cols[0] = [card(2, '♣', false), ...Array.from({ length: 13 }, (_, i) => card(13 - i, '♥'))];
  const g = settle(game(cols));
  expect(g.done).toEqual(['♥']);
  expect(g.columns[0]).toHaveLength(1);
  expect(g.columns[0][0].up).toBe(true);
  expect(g.score).toBe(600);
});

test('a hint prefers a move that keeps a suit together', () => {
  const cols = empty();
  cols[0] = [card(4, '♠')];
  cols[1] = [card(5, '♥')];
  cols[2] = [card(5, '♠')];
  expect(hint(game(cols))).toMatchObject({ from: 0, to: 2 });
});
