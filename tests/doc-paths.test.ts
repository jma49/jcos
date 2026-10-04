import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { missingPaths } from '../scripts/check-doc-paths.mjs';

describe('paths cited in the docs', () => {
  it('all exist', () => {
    expect(missingPaths()).toEqual([]);
  });
});

describe('check-doc-paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doc-paths-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (path: string, text = '') => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  write('src/os/apps/finder/manifest.ts');
  write('supabase/functions/bot/index.ts');
  write('scripts/audit.mjs');
  write('supabase/migrations/0001_first.sql');
  write('README.md');
  write(
    'docs/guide.md',
    [
      'Present: `src/os/apps/finder/manifest.ts`, `README.md`, `api/` is not a top folder here.',
      'Placeholders: `src/os/apps/<id>/manifest.ts`, `supabase/migrations/NNNN_name.sql`.',
      'Globs: `supabase/functions/*/index.ts`; a command: `node scripts/audit.mjs --fix`.',
      'Elsewhere: `../jmos-ops/HANDOFF.md`, `https://example.com/src/x.ts`, `/api/geo`.',
      'Relative to the OS: `apps/finder/manifest.ts`.',
      'Missing: `src/os/apps/gone/`, `scripts/gone.mjs:12`, `node scripts/old.mjs`,',
      '`supabase/functions/*/missing.ts`, `shell/Gone.tsx`.',
      '```',
      '`src/in/a/fence.ts`',
      '```'
    ].join('\n')
  );

  it('reports only the paths that are missing, with their lines', () => {
    expect(missingPaths(dir)).toEqual([
      { file: 'docs/guide.md', line: 6, path: 'src/os/apps/gone/' },
      { file: 'docs/guide.md', line: 6, path: 'scripts/gone.mjs' },
      { file: 'docs/guide.md', line: 6, path: 'scripts/old.mjs' },
      { file: 'docs/guide.md', line: 7, path: 'supabase/functions/*/missing.ts' },
      { file: 'docs/guide.md', line: 7, path: 'shell/Gone.tsx' }
    ]);
  });
});
