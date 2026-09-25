import { useEffect, useMemo, useRef, useState } from 'react';
import { useOSData } from '../context';
import type { AppProps } from '../registry';
import { play } from '../sound';
import type { OSPhoto } from '../types';

// Tile Game, after Tiger's Dashboard widget: one of Jincheng's photos cut
// into a 4 × 4 sliding puzzle. Click a tile next to the gap (or use the
// arrow keys) to slide it; put the picture back together.

const SIZE = 4;
/** Board width in px; tiles are a quarter of it. */
const BOARD = 320;
const TILE = BOARD / SIZE;
const GAP = SIZE * SIZE - 1;
const SOLVED = Array.from({ length: SIZE * SIZE }, (_, i) => i);

const neighbours = (i: number) =>
  [i - SIZE, i + SIZE, i % SIZE ? i - 1 : -1, (i + 1) % SIZE ? i + 1 : -1].filter((n) => n >= 0 && n < SIZE * SIZE);

/** Shuffles by making random legal moves, so the board is always solvable. */
function shuffle(): number[] {
  const board = [...SOLVED];
  let gap = GAP;
  let previous = -1;
  for (let step = 0; step < 240; step++) {
    const options = neighbours(gap).filter((n) => n !== previous);
    const next = options[Math.floor(Math.random() * options.length)];
    [board[gap], board[next]] = [board[next], board[gap]];
    previous = gap;
    gap = next;
  }
  return board.every((t, i) => t === i) ? shuffle() : board;
}

function pickPhoto(photos: OSPhoto[], not?: string) {
  // Squarish photos crop best; fall back to any.
  const pool = photos.filter((p) => p.id !== not && p.width / p.height > 0.75 && p.width / p.height < 1.6);
  const from = pool.length ? pool : photos;
  return from[Math.floor(Math.random() * from.length)];
}

export default function TileGame(_: AppProps) {
  const { photos } = useOSData();
  const [photo, setPhoto] = useState(() => pickPhoto(photos));
  // board[position] = which tile sits there; tile GAP is the hole.
  const [board, setBoard] = useState(shuffle);
  const [moves, setMoves] = useState(0);
  // Some photos (a lot of sky) are hard to piece together; numbers help.
  const [numbers, setNumbers] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const solved = useMemo(() => board.every((t, i) => t === i), [board]);

  useEffect(() => root.current?.focus(), []);
  useEffect(() => {
    if (solved && moves > 0) play('chime');
  }, [solved]);

  const slide = (position: number) => {
    if (solved) return;
    const gap = board.indexOf(GAP);
    if (!neighbours(gap).includes(position)) return;
    const next = [...board];
    [next[gap], next[position]] = [next[position], next[gap]];
    setBoard(next);
    setMoves((m) => m + 1);
    play('click');
  };

  const restart = (newPhoto: boolean) => {
    if (newPhoto && photo) setPhoto(pickPhoto(photos, photo.id));
    setBoard(shuffle());
    setMoves(0);
    root.current?.focus();
  };

  // Crop the photo to a centred square, like background-size: cover on the whole board.
  const ratio = photo ? photo.width / photo.height : 1;
  const imgW = ratio >= 1 ? BOARD * ratio : BOARD;
  const imgH = ratio >= 1 ? BOARD : BOARD / ratio;
  const offX = (imgW - BOARD) / 2;
  const offY = (imgH - BOARD) / 2;
  // A size between the 480px thumbnail and the 2000px original, sharp on Retina screens.
  const src = photo?.full.replace(/([?&])w=\d+/, '$1w=800');

  if (!photo) return <div className="os-app os-empty">Photos couldn’t be loaded, so there’s no picture to scramble.</div>;

  return (
    <div
      ref={root}
      className="os-app os-tiles"
      tabIndex={-1}
      onKeyDown={(e) => {
        // Arrow keys move the tile on that side of the gap into it, as in the widget.
        const gap = board.indexOf(GAP);
        const from: Record<string, number> = { ArrowUp: gap + SIZE, ArrowDown: gap - SIZE, ArrowLeft: gap + 1, ArrowRight: gap - 1 };
        const target = from[e.key];
        if (target === undefined) return;
        e.preventDefault();
        if ((e.key === 'ArrowLeft' && gap % SIZE === SIZE - 1) || (e.key === 'ArrowRight' && gap % SIZE === 0)) return;
        if (target >= 0 && target < SIZE * SIZE) slide(target);
      }}
    >
      <div className="os-tiles-frame">
        <div
          className="os-tiles-board"
          data-solved={solved || undefined}
          role="grid"
          aria-label="Sliding puzzle"
          style={{ width: BOARD, height: BOARD }}
        >
          {board.map((tile, position) => {
            if (tile === GAP && !solved) return null;
            const x = tile % SIZE;
            const y = Math.floor(tile / SIZE);
            return (
              <button
                key={tile}
                type="button"
                className="os-tile"
                tabIndex={-1}
                aria-label={`Tile ${tile + 1}`}
                onClick={() => slide(position)}
                style={{
                  width: TILE,
                  height: TILE,
                  backgroundImage: `url(${src})`,
                  backgroundColor: photo.color,
                  backgroundSize: `${imgW}px ${imgH}px`,
                  backgroundPosition: `${-(x * TILE + offX)}px ${-(y * TILE + offY)}px`,
                  transform: `translate(${(position % SIZE) * TILE}px, ${Math.floor(position / SIZE) * TILE}px)`
                }}
              >
                {numbers && !solved && <span className="os-tile-number">{tile + 1}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="os-tiles-status">{solved ? `Solved in ${moves} moves! 🎉` : `${moves} move${moves === 1 ? '' : 's'}`}</p>
      <div className="os-tiles-actions">
        <button type="button" className="os-button" onClick={() => restart(false)}>
          Shuffle
        </button>
        <button type="button" className="os-button" onClick={() => restart(true)}>
          New Photo
        </button>
        <button type="button" className="os-button" aria-pressed={numbers} onClick={() => setNumbers((n) => !n)}>
          {numbers ? 'Hide Numbers' : 'Show Numbers'}
        </button>
      </div>
    </div>
  );
}
