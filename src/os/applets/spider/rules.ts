// The rules of Spider Solitaire, apart from the window that shows them,
// so they can be tested on their own (rules.test.ts): dealing, what may
// move where, finished runs, the best place for a click and hints.

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Suits = 1 | 2 | 4;

export interface Card {
  id: number;
  rank: number; // 1 (Ace) to 13 (King)
  suit: Suit;
  up: boolean;
}

export interface Game {
  columns: Card[][];
  stock: Card[];
  /** Runs completed, by suit. */
  done: Suit[];
  score: number;
  moves: number;
}

export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RED = new Set<Suit>(['♥', '♦']);
export const SUIT_SETS: Record<Suits, Suit[]> = { 1: ['♠'], 2: ['♠', '♥'], 4: ['♠', '♥', '♦', '♣'] };

export function shuffle<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 104 cards: eight suits' worth, drawn from however many suits are in play. */
export function newGame(suits: Suits): Game {
  const set = SUIT_SETS[suits];
  const cards: Card[] = [];
  for (let deck = 0; deck < 8; deck++) {
    for (let rank = 1; rank <= 13; rank++) cards.push({ id: cards.length, rank, suit: set[deck % set.length], up: false });
  }
  const deck = shuffle(cards);
  // Four columns of six and six of five; the top card of each face up.
  const columns: Card[][] = Array.from({ length: 10 }, (_, i) => deck.splice(0, i < 4 ? 6 : 5));
  columns.forEach((col) => (col[col.length - 1].up = true));
  return { columns, stock: deck, done: [], score: 500, moves: 0 };
}

/** Where a movable run starts in a column: the deepest card from which it's one suit, descending, to the end. */
export function runStart(col: Card[]) {
  let i = col.length - 1;
  while (i > 0 && col[i - 1].up && col[i - 1].suit === col[i].suit && col[i - 1].rank === col[i].rank + 1) i--;
  return i;
}

/** Whether the cards from `index` down can be picked up together. */
export const movable = (col: Card[], index: number) => col[index]?.up && index >= runStart(col);

export const fits = (card: Card, onto: Card[]) => onto.length === 0 || onto[onto.length - 1].rank === card.rank + 1;

/** Turns up newly exposed cards and takes away finished runs. */
export function settle(game: Game): Game {
  const columns = game.columns.map((c) => [...c]);
  const done = [...game.done];
  let score = game.score;
  for (const col of columns) {
    if (col.length >= 13) {
      const tail = col.slice(-13);
      const complete = tail.every((c, i) => c.up && c.suit === tail[0].suit && c.rank === 13 - i);
      if (complete) {
        col.splice(-13);
        done.push(tail[0].suit);
        score += 100;
      }
    }
    if (col.length && !col[col.length - 1].up) col[col.length - 1] = { ...col[col.length - 1], up: true };
  }
  return { ...game, columns, done, score };
}

export function move(game: Game, from: number, index: number, to: number): Game | null {
  const src = game.columns[from];
  if (from === to || !movable(src, index) || !fits(src[index], game.columns[to])) return null;
  const columns = game.columns.map((c, i) => (i === from ? c.slice(0, index) : i === to ? [...c, ...src.slice(index)] : c));
  return settle({ ...game, columns, score: game.score - 1, moves: game.moves + 1 });
}

/** The best place for a run: onto a same-suit card, then any card, then an empty column. */
export function bestTarget(game: Game, from: number, index: number) {
  const card = game.columns[from][index];
  const order = game.columns
    .map((col, i) => ({ i, col }))
    .filter(({ i, col }) => i !== from && fits(card, col))
    .sort((a, b) => score(b.col) - score(a.col));
  function score(col: Card[]) {
    if (!col.length) return index === 0 ? -2 : 0;
    return col[col.length - 1].suit === card.suit ? 2 : 1;
  }
  return order[0]?.i ?? null;
}

/** A move worth making, for the hint: prefers ones that keep a suit together or turn a card up. */
export function hint(game: Game): { from: number; index: number; to: number } | null {
  let best: { from: number; index: number; to: number; value: number } | null = null;
  game.columns.forEach((col, from) => {
    if (!col.length) return;
    const index = runStart(col);
    game.columns.forEach((target, to) => {
      if (to === from || !fits(col[index], target)) return;
      if (!target.length && index === 0) return; // pointless shuffle between columns
      const sameSuit = target.length && target[target.length - 1].suit === col[index].suit;
      const reveals = index > 0 && !col[index - 1].up;
      const value = (sameSuit ? 3 : 1) + (reveals ? 2 : 0) + (target.length ? 1 : 0);
      if (!best || value > best.value) best = { from, index, to, value };
    });
  });
  return best;
}
