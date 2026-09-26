import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { play } from '../core/sound';
import { useFocusedId } from '../core/store';
import { loadSettings, saveJSON } from '../core/storage';

// Spider Solitaire: two decks in ten columns. Build down in any suit, but
// only a run of one suit moves together; a full King-to-Ace run of one
// suit leaves the table. Deal ten more from the stock when stuck (never
// onto an empty column). One, two or four suits; undo, hints, and a best
// score for each, kept in this browser.

type Suit = '♠' | '♥' | '♦' | '♣';
type Suits = 1 | 2 | 4;

interface Card {
  id: number;
  rank: number; // 1 (Ace) to 13 (King)
  suit: Suit;
  up: boolean;
}

interface Game {
  columns: Card[][];
  stock: Card[];
  /** Runs completed, by suit. */
  done: Suit[];
  score: number;
  moves: number;
}

const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED = new Set<Suit>(['♥', '♦']);
const SUIT_SETS: Record<Suits, Suit[]> = { 1: ['♠'], 2: ['♠', '♥'], 4: ['♠', '♥', '♦', '♣'] };
const SETTINGS_KEY = 'os-spider';

function shuffle<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 104 cards: eight suits' worth, drawn from however many suits are in play. */
function newGame(suits: Suits): Game {
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
function runStart(col: Card[]) {
  let i = col.length - 1;
  while (i > 0 && col[i - 1].up && col[i - 1].suit === col[i].suit && col[i - 1].rank === col[i].rank + 1) i--;
  return i;
}

/** Whether the cards from `index` down can be picked up together. */
const movable = (col: Card[], index: number) => col[index]?.up && index >= runStart(col);

const fits = (card: Card, onto: Card[]) => onto.length === 0 || onto[onto.length - 1].rank === card.rank + 1;

/** Turns up newly exposed cards and takes away finished runs. */
function settle(game: Game): Game {
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
        play('chime');
      }
    }
    if (col.length && !col[col.length - 1].up) col[col.length - 1] = { ...col[col.length - 1], up: true };
  }
  return { ...game, columns, done, score };
}

function move(game: Game, from: number, index: number, to: number): Game | null {
  const src = game.columns[from];
  if (from === to || !movable(src, index) || !fits(src[index], game.columns[to])) return null;
  const columns = game.columns.map((c, i) => (i === from ? c.slice(0, index) : i === to ? [...c, ...src.slice(index)] : c));
  return settle({ ...game, columns, score: game.score - 1, moves: game.moves + 1 });
}

/** The best place for a run: onto a same-suit card, then any card, then an empty column. */
function bestTarget(game: Game, from: number, index: number) {
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
function hint(game: Game): { from: number; index: number; to: number } | null {
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

interface Drag {
  from: number;
  index: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** The cards' width on the table, so the dragged ones match. */
  w: number;
}

function CardFace({ card }: { card: Card }) {
  if (!card.up) return <span className="os-spider-card" data-back />;
  return (
    <span className="os-spider-card" data-red={RED.has(card.suit) || undefined}>
      <span className="os-spider-corner">
        {RANKS[card.rank]}
        <br />
        {card.suit}
      </span>
      <span className="os-spider-pip">{card.rank > 10 ? RANKS[card.rank] : card.suit}</span>
    </span>
  );
}

export default function Spider({ win }: AppProps) {
  const saved = useMemo(() => loadSettings(SETTINGS_KEY, { suits: 1 as Suits, best: {} as Partial<Record<Suits, number>> }), []);
  const [suits, setSuits] = useState<Suits>(saved.suits);
  const [best, setBest] = useState(saved.best);
  const [game, setGame] = useState(() => newGame(saved.suits));
  const [history, setHistory] = useState<Game[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [lit, setLit] = useState<{ from: number; index: number; to: number } | null>(null);
  const table = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const front = useFocusedId() === win.id;
  const won = game.done.length === 8;

  const commit = (next: Game | null) => {
    if (!next) return false;
    setHistory((h) => [...h.slice(-199), game]);
    setGame(next);
    setLit(null);
    play('click');
    return true;
  };

  useEffect(() => {
    if (!won) return;
    play('chime');
    if (game.score > (best[suits] ?? 0)) {
      const next = { ...best, [suits]: game.score };
      setBest(next);
      saveJSON(SETTINGS_KEY, { suits, best: next });
    }
  }, [won]);

  const restart = (n: Suits = suits) => {
    setSuits(n);
    saveJSON(SETTINGS_KEY, { suits: n, best });
    setGame(newGame(n));
    setHistory([]);
    setLit(null);
  };

  const deal = () => {
    if (!game.stock.length) return;
    if (game.columns.some((c) => c.length === 0)) {
      play('error');
      return;
    }
    const stock = [...game.stock];
    const columns = game.columns.map((c) => [...c, { ...stock.shift()!, up: true }]);
    commit(settle({ ...game, columns, stock, moves: game.moves + 1 }));
  };

  const undo = () => {
    if (!history.length) return;
    setGame(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setGame((g) => ({ ...g, score: g.score - 1 }));
  };

  const showHint = () => {
    const h = hint(game);
    if (!h) return play('error');
    setLit(h);
    setTimeout(() => setLit((l) => (l === h ? null : l)), 1600);
  };

  // Keyboard: ⌥Z undo, H hint, D deal, F2 new game (as on Windows; a letter would be too easy to hit).
  useEffect(() => {
    if (!front) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.matches('input, select, textarea')) return;
      if ((e.altKey || e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
        e.preventDefault();
        undo();
      } else if (!e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.code === 'KeyH') showHint();
        else if (e.code === 'KeyD') deal();
        else if (e.code === 'F2') restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Which column the pointer is over. */
  const columnAt = (x: number) => {
    const cols = table.current?.querySelectorAll<HTMLElement>('.os-spider-column');
    let hit: number | null = null;
    cols?.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right) hit = i;
    });
    return hit;
  };

  const startDrag = (e: React.PointerEvent, from: number, index: number) => {
    if (e.button !== 0 || !movable(game.columns[from], index)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      setDrag({ from, index, x: ev.clientX, y: ev.clientY, dx: start.x - r.left, dy: start.y - r.top, w: r.width });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      if (!moved) {
        // A click (or tap) sends the run wherever it goes best.
        const to = bestTarget(game, from, index);
        if (to === null || !commit(move(game, from, index, to))) play('error');
        return;
      }
      const to = columnAt(ev.clientX);
      if (to === null || to === from || !commit(move(game, from, index, to))) play('error');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const dragging = drag ? game.columns[drag.from].slice(drag.index) : [];

  return (
    <div ref={root} className="os-app os-spider">
      <div className="os-toolbar">
        <button type="button" className="os-button" onClick={() => restart()} title="New game (F2)">
          New Game
        </button>
        <select value={suits} onChange={(e) => restart(Number(e.target.value) as Suits)} aria-label="Difficulty">
          <option value={1}>One suit</option>
          <option value={2}>Two suits</option>
          <option value={4}>Four suits</option>
        </select>
        <button type="button" className="os-button" onClick={undo} disabled={!history.length} title="Undo (⌥Z)">
          Undo
        </button>
        <button type="button" className="os-button" onClick={showHint} title="Hint (H)">
          Hint
        </button>
        <span className="os-toolbar-meta">
          Score {game.score} · Moves {game.moves}
          {best[suits] ? ` · Best ${best[suits]}` : ''}
        </span>
      </div>

      <div className="os-spider-table">
        <div ref={table} className="os-spider-columns">
          {game.columns.map((col, c) => (
            <div key={c} className="os-spider-column" data-empty={!col.length || undefined} data-lit={lit?.to === c || undefined}>
              {col.map((card, i) => {
                const hidden = drag && drag.from === c && i >= drag.index;
                return (
                  <div
                    key={card.id}
                    className="os-spider-slot"
                    data-down={!card.up || undefined}
                    data-hidden={hidden || undefined}
                    data-lit={(lit && lit.from === c && i >= lit.index) || undefined}
                    onPointerDown={(e) => startDrag(e, c, i)}
                    role={card.up ? 'button' : undefined}
                    aria-label={card.up ? `${RANKS[card.rank]}${card.suit}` : 'Face-down card'}
                  >
                    <CardFace card={card} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="os-spider-bottom">
          <div className="os-spider-done" aria-label={`${game.done.length} of 8 runs complete`}>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="os-spider-done-slot">
                {game.done[i] && <CardFace card={{ id: -1, rank: 13, suit: game.done[i], up: true }} />}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="os-spider-stock"
            onClick={deal}
            disabled={!game.stock.length}
            aria-label={`Deal ten cards (${game.stock.length / 10} deals left)`}
            title="Deal (D)"
          >
            {Array.from({ length: game.stock.length / 10 }, (_, i) => (
              <span key={i} className="os-spider-card" data-back style={{ left: i * 10 }} />
            ))}
          </button>
        </div>

        {won && (
          <div className="os-spider-won">
            <strong>You won!</strong>
            <span>
              Score {game.score} in {game.moves} moves
            </span>
            <button type="button" className="os-button os-button-primary" onClick={() => restart()}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {drag && (
        <div
          className="os-spider-drag"
          // Inside the window (which may be moved by a transform), relative to it.
          style={{
            '--cw': `${drag.w}px`,
            left: drag.x - drag.dx - (root.current?.getBoundingClientRect().left ?? 0),
            top: drag.y - drag.dy - (root.current?.getBoundingClientRect().top ?? 0)
          } as React.CSSProperties}
          aria-hidden="true"
        >
          {dragging.map((card) => (
            <div key={card.id} className="os-spider-slot">
              <CardFace card={card} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
