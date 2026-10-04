import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { EXCEPTIONS, oversized } from '../scripts/check-public-sizes.mjs';

describe('files in public/', () => {
  it('are within their size budgets', () => {
    expect(oversized()).toEqual([]);
  });
});

describe('check-public-sizes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'public-sizes-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (path: string, kb: number) => {
    mkdirSync(join(dir, 'public', path, '..'), { recursive: true });
    writeFileSync(join(dir, 'public', path), Buffer.alloc(kb * 1024));
  };
  write('icon.png', 200);
  write('big.png', 201);
  write('os/wallpapers/photos/nature/fine.webp', 1000);
  write('os/wallpapers/photos/nature/huge.webp', 1100);
  write('os/wallpapers/thumbs/nature/fine.webp', 300);
  const [exception] = EXCEPTIONS.keys();
  write(exception, 1500);

  it('holds desktop pictures to 1 MB, everything else to 200 KB, and an exception to its own size', () => {
    expect(oversized(dir).map(({ path, budget }) => [path, budget / 1024])).toEqual([
      ['public/big.png', 200],
      ['public/os/wallpapers/photos/nature/huge.webp', 1024],
      ['public/os/wallpapers/thumbs/nature/fine.webp', 200]
    ]);
  });
});
