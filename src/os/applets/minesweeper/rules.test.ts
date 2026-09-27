import { describe, expect, test } from 'vitest';
import { blank, cleared, layMines, LEVELS, neighbours, reveal, targetsOf, type Cell } from './rules';

/** A board with mines at the given cells and counts filled in. */
function board(cols: number, rows: number, mines: number[]): Cell[] {
  const cells = blank(cols, rows);
  for (const i of mines) cells[i].mine = true;
  cells.forEach((c, i) => (c.count = neighbours(i, cols, rows).filter((n) => cells[n].mine).length));
  return cells;
}

describe('neighbours', () => {
  test('a corner has three, an edge five, the middle eight', () => {
    expect(neighbours(0, 3, 3).sort()).toEqual([1, 3, 4]);
    expect(neighbours(1, 3, 3)).toHaveLength(5);
    expect(neighbours(4, 3, 3)).toHaveLength(8);
  });
});

describe('layMines', () => {
  test('lays exactly the level’s mines, never on or around the first click', () => {
    for (const { cols, rows, mines } of Object.values(LEVELS)) {
      for (let run = 0; run < 20; run++) {
        const safe = Math.floor(Math.random() * cols * rows);
        const cells = layMines(blank(cols, rows), cols, rows, mines, safe);
        expect(cells.filter((c) => c.mine)).toHaveLength(mines);
        for (const i of [safe, ...neighbours(safe, cols, rows)]) expect(cells[i].mine).toBe(false);
      }
    }
  });

  test('on a board too small to keep the neighbours clear, still spares the clicked cell', () => {
    const cells = layMines(blank(3, 3), 3, 3, 8, 4);
    expect(cells.filter((c) => c.mine)).toHaveLength(8);
    expect(cells[4].mine).toBe(false);
    expect(cells[4].count).toBe(8);
  });

  test('counts the mines around each cell', () => {
    const cells = layMines(blank(4, 4), 4, 4, 5, 0, () => 0.5);
    cells.forEach((c, i) => expect(c.count).toBe(neighbours(i, 4, 4).filter((n) => cells[n].mine).length));
  });
});

describe('reveal', () => {
  test('spreads across empty cells and stops at numbers', () => {
    // A mine in the far corner of a 4×4 board: everything else opens from the other corner.
    const cells = board(4, 4, [15]);
    expect(reveal(cells, [0], 4, 4)).toBe(true);
    expect(cells.filter((c) => c.open)).toHaveLength(15);
    expect(cleared(cells)).toBe(true);
  });

  test('leaves flags closed', () => {
    const cells = board(3, 1, []);
    cells[2].flag = true;
    reveal(cells, [0], 3, 1);
    expect(cells.map((c) => c.open)).toEqual([true, true, false]);
  });

  test('reports a mine going off', () => {
    const cells = board(2, 1, [1]);
    expect(reveal(cells, [1], 2, 1)).toBe(false);
  });
});

describe('targetsOf', () => {
  test('a hidden cell opens itself', () => {
    expect(targetsOf(board(3, 3, [0]), 4, 3, 3)).toEqual([4]);
  });

  test('an open number chords only once its flags are all placed', () => {
    const cells = board(3, 3, [0]);
    cells[4].open = true;
    expect(targetsOf(cells, 4, 3, 3)).toEqual([]);
    cells[0].flag = true;
    expect(targetsOf(cells, 4, 3, 3).sort()).toEqual([1, 2, 3, 5, 6, 7, 8]);
  });

  test('a wrong flag makes the chord set off the mine', () => {
    const cells = board(3, 3, [0]);
    cells[4].open = true;
    cells[8].flag = true;
    const targets = targetsOf(cells, 4, 3, 3);
    expect(targets).toContain(0);
    expect(reveal(cells, targets, 3, 3)).toBe(false);
  });
});
