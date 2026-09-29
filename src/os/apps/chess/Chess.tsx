import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Color, Move, PieceSymbol, Square } from 'chess.js';
import type { AppProps } from '../../core/types';
import { useReduceMotion } from '../../core/system';
import { play } from '../../core/sound';
import { useWindows } from '../../core/store';
import { bestMove } from './engine';
import type { Answer, Ask } from './engine.worker';
import { lastMove, replay, standing, targetsOf } from './rules';
import { onMovesStored, storedMoves, storeMoves } from './saved';

// Chess, as Tiger and Leopard had it: a wooden board in perspective, the
// visitor playing White against the computer. Click a piece, then one of
// the squares it can go to (they're marked). The computer thinks in a
// worker (engine.worker.ts) and answers a moment later; the status bar
// says whose move it is and what the last one was. The game is kept in
// this browser (saved.ts) and every tab shows the same one: the reply is
// played only if the game hasn't moved on in another tab meanwhile, so
// two tabs thinking at once still make one move.

const FILES = 'abcdefgh';
/** The solid glyphs for both sides, coloured in CSS; U+FE0E keeps the pawn from turning into an emoji. */
const GLYPH: Record<PieceSymbol, string> = { k: '♚\uFE0E', q: '♛\uFE0E', r: '♜\uFE0E', b: '♝\uFE0E', n: '♞\uFE0E', p: '♟\uFE0E' };
const NAME: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const PROMOTIONS = ['q', 'r', 'b', 'n'] as const;
/** The computer's move comes no sooner than this after the visitor's, so each is seen to happen. */
const REPLY_MS = 600;
/** How long the computer may think here, if the worker can't start. */
const THINK_MS = 1500;

const squareAt = (row: number, col: number) => `${FILES[col]}${8 - row}` as Square;
const rowOf = (sq: Square) => 8 - Number(sq[1]);
const colOf = (sq: Square) => FILES.indexOf(sq[0]);
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((move, i) => move === b[i]);

/** The squares a move slides a piece between: the piece itself, and the rook when it castles. */
function slides(move: Move): { from: Square; to: Square }[] {
  const rank = move.color === 'w' ? '1' : '8';
  const rook = move.isKingsideCastle() ? ['h', 'f'] : move.isQueensideCastle() ? ['a', 'd'] : null;
  return [{ from: move.from, to: move.to }, ...(rook ? [{ from: `${rook[0]}${rank}` as Square, to: `${rook[1]}${rank}` as Square }] : [])];
}

interface Game {
  moves: string[];
  /** Whether the last move was just played here, and slides into place. */
  fresh: boolean;
}

export default function ChessApp({ win }: AppProps) {
  const reduced = useReduceMotion();
  const [game, setGame] = useState<Game>(() => ({ moves: replay(storedMoves() ?? []).moves, fresh: false }));
  const { moves } = game;
  const { chess, last } = useMemo(() => replay(moves), [moves]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promoting, setPromoting] = useState<{ from: Square; to: Square } | null>(null);

  const status = standing(chess);
  const thinking = chess.turn() === 'b' && !status.over;
  const targets = useMemo(() => (selected ? targetsOf(chess, selected) : []), [chess, selected]);

  /** Shows `next`, and keeps it for a reload and the visitor's other tabs. */
  const commit = useCallback((next: string[], fresh: boolean) => {
    storeMoves(next);
    setGame({ moves: next, fresh });
    setSelected(null);
    setPromoting(null);
  }, []);

  const newGame = useCallback(() => commit([], false), [commit]);
  // The Game menu in the menu bar while Chess is in front, as on a Mac.
  useEffect(() => {
    const { setMenus } = useWindows.getState();
    setMenus(win.id, { Game: [{ label: 'New Game', action: newGame }] });
    return () => setMenus(win.id, undefined);
  }, [win.id, newGame]);

  // A move or a new game in another tab.
  useEffect(
    () =>
      onMovesStored(() => {
        setGame({ moves: replay(storedMoves() ?? []).moves, fresh: true });
        setSelected(null);
        setPromoting(null);
      }),
    []
  );

  // The worker the computer thinks in, while the window is open. If it
  // can't start, or fails, the computer thinks here instead: slower to
  // answer, but the game goes on.
  const worker = useRef<Worker | null>(null);
  const [inWorker, setInWorker] = useState(true);
  useEffect(() => {
    let started: Worker;
    try {
      started = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      setInWorker(false);
      return;
    }
    const fail = () => {
      started.terminate();
      worker.current = null;
      setInWorker(false);
    };
    started.addEventListener('error', fail);
    worker.current = started;
    return () => {
      started.removeEventListener('error', fail);
      started.terminate();
      worker.current = null;
    };
  }, []);

  // The computer's turn: its move is played a moment later, unless another
  // tab has moved on meanwhile (then that tab's game stands).
  const asked = useRef(0);
  useEffect(() => {
    if (!thinking) return;
    const base = moves;
    const since = performance.now();
    let timer = 0;
    let answered = false;
    const answer = (move: string | null) => {
      if (answered) return;
      answered = true;
      timer = window.setTimeout(
        () => {
          if (!move) return;
          const stored = storedMoves();
          const theirs = stored && replay(stored).moves;
          if (theirs && !same(theirs, base)) {
            setGame({ moves: theirs, fresh: false });
            return;
          }
          play('tick');
          commit([...base, move], true);
        },
        Math.max(0, REPLY_MS - (performance.now() - since))
      );
    };
    const w = inWorker ? worker.current : null;
    let onMessage: ((e: MessageEvent<Answer>) => void) | null = null;
    if (w) {
      const id = ++asked.current;
      onMessage = (e) => e.data.id === id && answer(e.data.move);
      w.addEventListener('message', onMessage);
      w.postMessage({ id, moves: base } satisfies Ask);
    } else {
      // After a frame, so the status bar says it's thinking first.
      timer = window.setTimeout(() => answer(bestMove(replay(base).chess, { ms: THINK_MS })), 50);
    }
    return () => {
      answered = true;
      clearTimeout(timer);
      if (onMessage) w?.removeEventListener('message', onMessage);
    };
  }, [thinking, moves, commit, inWorker]);

  const moveTo = (from: Square, to: Square, promotion?: PieceSymbol) => {
    const found = chess.moves({ square: from, verbose: true }).find((mv) => mv.to === to && (!mv.promotion || mv.promotion === promotion));
    if (!found) return;
    play('tick');
    commit([...moves, found.san], true);
  };

  const choose = (sq: Square) => {
    if (thinking || status.over || promoting) return;
    const target = selected ? targets.find((t) => t.to === sq) : undefined;
    if (selected && target) {
      if (target.promotes) setPromoting({ from: selected, to: sq });
      else moveTo(selected, sq);
      return;
    }
    setSelected(chess.get(sq)?.color === 'w' && sq !== selected ? sq : null);
  };

  const board = chess.board();
  const king = chess.isCheck() ? board.flat().find((p) => p?.type === 'k' && p.color === chess.turn())?.square : undefined;
  const sliding = game.fresh && last && !reduced ? slides(last) : [];
  const said = lastMove(moves);

  return (
    <div className="os-app os-chess">
      <div className="os-chess-stage">
        <div className="os-chess-board" role="group" aria-label="Chessboard">
          {board.map((rank, row) =>
            rank.map((piece, col) => {
              const sq = squareAt(row, col);
              const target = targets.find((t) => t.to === sq);
              const slide = sliding.find((s) => s.to === sq);
              return (
                <button
                  key={sq}
                  type="button"
                  className="os-chess-square"
                  data-dark={(row + col) % 2 === 1 || undefined}
                  data-selected={sq === selected || undefined}
                  data-target={target ? (piece ? 'take' : 'go') : undefined}
                  data-last={(last && (sq === last.from || sq === last.to)) || undefined}
                  data-check={sq === king || undefined}
                  aria-label={[
                    sq,
                    piece && `${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}`,
                    sq === selected && 'selected',
                    target && 'can move here'
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => choose(sq)}
                >
                  {piece && (
                    <Piece
                      // A piece that has just moved is new here, so it slides in from where it was.
                      key={slide ? `moved-${moves.length}` : 'still'}
                      type={piece.type}
                      color={piece.color}
                      from={slide ? { x: colOf(slide.from) - col, y: rowOf(slide.from) - row } : undefined}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
        {promoting && (
          <div className="os-chess-promote" role="dialog" aria-label="Promote the pawn">
            <p>Promote the pawn to</p>
            <div className="os-chess-promote-choices">
              {PROMOTIONS.map((p) => {
                const name = NAME[p][0].toUpperCase() + NAME[p].slice(1);
                return (
                  <button key={p} type="button" className="os-button" onClick={() => moveTo(promoting.from, promoting.to, p)} aria-label={name} title={name}>
                    {GLYPH[p]}
                  </button>
                );
              })}
            </div>
            <button type="button" className="os-button" onClick={() => setPromoting(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="os-chess-bar" aria-live="polite">
        <span>{said ? `${status.text} · ${said}` : status.text}</span>
        {thinking ? (
          <span>Computer is thinking…</span>
        ) : (
          <button type="button" className="os-button" onClick={newGame}>
            New Game
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A piece standing on its square. `from` is how many squares away it
 * slides in from (a CSS animation, chess.css), when it has just moved.
 */
function Piece({ type, color, from }: { type: PieceSymbol; color: Color; from?: { x: number; y: number } }) {
  return (
    <span
      className="os-chess-piece"
      data-color={color}
      data-slide={from ? '' : undefined}
      style={from ? ({ '--dx': from.x, '--dy': from.y } as CSSProperties) : undefined}
    >
      <b>{GLYPH[type]}</b>
    </span>
  );
}
