// Minesweeper's board and rules, without React, so they can be tested.
// Cells are a flat array, row by row.

export type Level = 'beginner' | 'intermediate' | 'expert';

export const LEVELS: Record<Level, { name: string; cols: number; rows: number; mines: number }> = {
  beginner: { name: 'Beginner', cols: 9, rows: 9, mines: 10 },
  intermediate: { name: 'Intermediate', cols: 16, rows: 16, mines: 40 },
  expert: { name: 'Expert', cols: 30, rows: 16, mines: 99 }
};

export interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  /** Mines around it. */
  count: number;
}

export type Status = 'ready' | 'playing' | 'won' | 'lost';

export const blank = (cols: number, rows: number): Cell[] =>
  Array.from({ length: cols * rows }, () => ({ mine: false, open: false, flag: false, count: 0 }));

export function neighbours(i: number, cols: number, rows: number) {
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
export function layMines(cells: Cell[], cols: number, rows: number, mines: number, safe: number, random = Math.random) {
  const keepClear = new Set([safe, ...neighbours(safe, cols, rows)]);
  // On tiny boards there may not be room to keep all neighbours clear.
  const spots = cells.map((_, i) => i).filter((i) => (cells.length - keepClear.size >= mines ? !keepClear.has(i) : i !== safe));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const next = cells.map((c) => ({ ...c }));
  for (const i of spots.slice(0, mines)) next[i].mine = true;
  next.forEach((c, i) => (c.count = neighbours(i, cols, rows).filter((n) => next[n].mine).length));
  return next;
}

/** Opens cells from `start` in place, spreading across empty ones. Returns false if a mine went off. */
export function reveal(cells: Cell[], start: number[], cols: number, rows: number) {
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

/**
 * The cells a click on `i` opens: the cell itself if it's hidden, or, for
 * an open number with all its flags placed (chording), the rest around it.
 * Anything else opens nothing.
 */
export function targetsOf(cells: Cell[], i: number, cols: number, rows: number): number[] {
  const cell = cells[i];
  if (!cell.open) return [i];
  if (cell.count === 0) return [];
  const around = neighbours(i, cols, rows);
  if (around.filter((n) => cells[n].flag).length !== cell.count) return [];
  return around.filter((n) => !cells[n].flag && !cells[n].open);
}

/** Every cell without a mine is open. */
export const cleared = (cells: Cell[]) => cells.every((c) => c.mine || c.open);
