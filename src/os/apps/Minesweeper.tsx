import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';
import { play } from '../core/sound';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, MOBILE_BREAKPOINT, useWindows } from '../core/store';
import { loadSettings, saveJSON } from '../core/storage';

// Minesweeper. The first click is always safe (mines are laid after it),
// right-click or long-press flags, and clicking a number whose flags are
// all placed opens its neighbours. Best times are kept in this browser.

type Level = 'beginner' | 'intermediate' | 'expert';

const LEVELS: Record<Level, { name: string; cols: number; rows: number; mines: number }> = {
  beginner: { name: 'Beginner', cols: 9, rows: 9, mines: 10 },
  intermediate: { name: 'Intermediate', cols: 16, rows: 16, mines: 40 },
  expert: { name: 'Expert', cols: 30, rows: 16, mines: 99 }
};

const BEST_KEY = 'os-minesweeper-best';

interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  /** Mines around it. */
  count: number;
}

type Status = 'ready' | 'playing' | 'won' | 'lost';

const blank = (cols: number, rows: number): Cell[] =>
  Array.from({ length: cols * rows }, () => ({ mine: false, open: false, flag: false, count: 0 }));

function neighbours(i: number, cols: number, rows: number) {
  const x = i % cols;
  const y = Math.floor(i / cols);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
    }
  }
  return out;
}

/** Lays mines anywhere except the first cell clicked and the cells around it. */
function layMines(cells: Cell[], cols: number, rows: number, mines: number, safe: number) {
  const keepClear = new Set([safe, ...neighbours(safe, cols, rows)]);
  // On tiny boards there may not be room to keep all neighbours clear.
  const spots = cells.map((_, i) => i).filter((i) => (cells.length - keepClear.size >= mines ? !keepClear.has(i) : i !== safe));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const next = cells.map((c) => ({ ...c }));
  for (const i of spots.slice(0, mines)) next[i].mine = true;
  next.forEach((c, i) => (c.count = neighbours(i, cols, rows).filter((n) => next[n].mine).length));
  return next;
}

/** Opens cells from `start`, spreading across empty ones. Returns false if a mine went off. */
function reveal(cells: Cell[], start: number[], cols: number, rows: number) {
  const queue = [...start];
  while (queue.length) {
    const i = queue.pop()!;
    const c = cells[i];
    if (c.open || c.flag) continue;
    c.open = true;
    if (c.mine) return false;
    if (c.count === 0) queue.push(...neighbours(i, cols, rows));
  }
  return true;
}

function readBest(): Partial<Record<Level, number>> {
  return loadSettings<Partial<Record<Level, number>>>(BEST_KEY, {});
}

const pad = (n: number) => String(Math.max(-99, Math.min(999, n))).padStart(3, '0');

export default function Minesweeper({ win }: AppProps) {
  const [level, setLevel] = useState<Level>('beginner');
  const { cols, rows, mines } = LEVELS[level];
  const [cells, setCells] = useState(() => blank(cols, rows));
  const [status, setStatus] = useState<Status>('ready');
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [lastHit, setLastHit] = useState<number | null>(null);
  const [best, setBest] = useState(readBest);
  const longPress = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });

  /** Grows or shrinks the window to fit a level's board, within the screen. */
  const fitWindow = (next: Level) => {
    if (window.innerWidth < MOBILE_BREAKPOINT || win.maximized) return;
    const { cols: c, rows: r } = LEVELS[next];
    const width = Math.min(window.innerWidth - 32, Math.max(400, c * 25 + 60));
    const height = Math.min(window.innerHeight - MENU_BAR_HEIGHT - DOCK_CLEARANCE, r * 25 + 190);
    const x = Math.min(win.x, window.innerWidth - width - 16);
    const y = Math.min(win.y, window.innerHeight - DOCK_CLEARANCE - height);
    useWindows.getState().setBounds(win.id, { x: Math.max(16, x), y: Math.max(MENU_BAR_HEIGHT + 8, y), width, height });
  };

  const reset = (next: Level = level) => {
    if (next !== level) fitWindow(next);
    setLevel(next);
    setCells(blank(LEVELS[next].cols, LEVELS[next].rows));
    setStatus('ready');
    setStarted(0);
    setNow(0);
    setLastHit(null);
  };

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [status]);

  const seconds = started ? Math.floor(((status === 'playing' ? now || Date.now() : now) - started) / 1000) : 0;
  const flags = cells.filter((c) => c.flag).length;

  const finish = (next: Cell[], exploded: number | null) => {
    if (exploded !== null) {
      next.forEach((c) => c.mine && (c.open = true));
      setLastHit(exploded);
      setStatus('lost');
      setNow(Date.now());
      play('error');
      return;
    }
    if (next.every((c) => c.mine || c.open)) {
      next.forEach((c) => c.mine && (c.flag = true));
      const time = Math.floor((Date.now() - (started || Date.now())) / 1000);
      setStatus('won');
      setNow(Date.now());
      play('chime');
      if (best[level] === undefined || time < best[level]!) {
        const updated = { ...best, [level]: time };
        setBest(updated);
        saveJSON(BEST_KEY, updated);
      }
    }
  };

  const open = (i: number) => {
    if (status === 'won' || status === 'lost' || cells[i].flag) return;
    let next = cells.map((c) => ({ ...c }));
    if (status === 'ready') {
      next = layMines(next, cols, rows, mines, i);
      setStatus('playing');
      setStarted(Date.now());
      setNow(Date.now());
    }
    const cell = next[i];
    let targets = [i];
    // Chording: an open number with all its flags placed opens the rest around it.
    if (cell.open && cell.count > 0) {
      const around = neighbours(i, cols, rows);
      if (around.filter((n) => next[n].flag).length !== cell.count) return;
      targets = around.filter((n) => !next[n].flag && !next[n].open);
    } else if (cell.open) {
      return;
    }
    const safe = reveal(next, targets, cols, rows);
    setCells(next);
    finish(next, safe ? null : targets.find((n) => next[n].mine) ?? i);
    if (safe) play('click');
  };

  const flag = (i: number) => {
    if (status === 'won' || status === 'lost' || cells[i].open) return;
    setCells((all) => all.map((c, j) => (j === i ? { ...c, flag: !c.flag } : c)));
  };

  const face = status === 'lost' ? '😵' : status === 'won' ? '😎' : pressing ? '😮' : '🙂';

  return (
    <div className="os-app os-mines">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Difficulty">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => reset(l)}>
              {LEVELS[l].name}
            </button>
          ))}
        </div>
        <span className="os-toolbar-meta">{best[level] !== undefined ? `Best: ${best[level]}s` : 'No best time yet'}</span>
      </div>
      <div className="os-scroll os-mines-stage">
        <div className="os-mines-board" style={{ '--cols': cols } as React.CSSProperties}>
          <div className="os-mines-head">
            <output className="os-mines-lcd" aria-label="Mines left">
              {pad(mines - flags)}
            </output>
            <button type="button" className="os-mines-face" onClick={() => reset()} aria-label="New game">
              {face}
            </button>
            <output className="os-mines-lcd" aria-label="Seconds">
              {pad(seconds)}
            </output>
          </div>
          <div
            className="os-mines-grid"
            role="grid"
            aria-label={`${LEVELS[level].name} board`}
            onContextMenu={(e) => e.preventDefault()}
            onPointerUp={() => setPressing(false)}
            onPointerLeave={() => setPressing(false)}
          >
            {cells.map((c, i) => (
              <button
                key={i}
                type="button"
                role="gridcell"
                className="os-mines-cell"
                data-open={c.open || undefined}
                data-hit={i === lastHit || undefined}
                data-wrong={status === 'lost' && c.flag && !c.mine ? true : undefined}
                data-n={c.open && !c.mine && c.count ? c.count : undefined}
                aria-label={c.open ? (c.mine ? 'mine' : String(c.count || 'empty')) : c.flag ? 'flagged' : 'hidden'}
                onPointerDown={(e) => {
                  if (e.button === 2) return flag(i);
                  if (e.button !== 0) return;
                  setPressing(true);
                  if (e.pointerType === 'touch') {
                    longPress.current.fired = false;
                    longPress.current.timer = window.setTimeout(() => {
                      longPress.current.fired = true;
                      flag(i);
                      navigator.vibrate?.(15);
                    }, 380);
                  }
                }}
                onPointerUp={() => clearTimeout(longPress.current.timer)}
                onClick={() => {
                  if (longPress.current.fired) {
                    longPress.current.fired = false;
                    return;
                  }
                  open(i);
                }}
              >
                {c.open ? (c.mine ? '💣' : c.count || '') : c.flag ? '🚩' : ''}
              </button>
            ))}
          </div>
        </div>
        <p className="os-mines-hint">
          {status === 'won'
            ? `Cleared in ${seconds}s.`
            : status === 'lost'
              ? 'Boom. Click the face to try again.'
              : 'Right-click (or long-press) to flag. Click a number to open around it.'}
        </p>
      </div>
    </div>
  );
}
