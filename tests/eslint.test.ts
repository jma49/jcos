import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// The lint's own rules (eslint.config.js), each probed with a snippet that
// fails without it: the boundaries between the OS, apps and applets
// (docs/agents/desktop.md), for import declarations and import() alike.
// The snippets name files that don't exist: ESLint needs only the path to
// choose the rules.

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: root });

/** What the lint says about `code` as the file at `path` (from the repository's root): one line a message, or ''. */
async function lint(path: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: root + path });
  return result.messages.map((m) => m.message).join('\n');
}

describe('the OS reaches apps only through the catalog', () => {
  const rule = 'The OS reaches apps only through src/os/catalog.ts.';
  test('an import declaration', async () => {
    expect(await lint('src/os/shell/Probe.tsx', "import { Finder } from '../apps/finder/Finder';")).toContain(rule);
  });
  test('an import()', async () => {
    expect(await lint('src/os/shell/Probe.tsx', "export const load = () => import('../apps/finder/Finder');")).toContain(rule);
    expect(await lint('src/os/core/probe.ts', "export const load = () => import('../applets/pinball/table');")).toContain(rule);
  });
  test('from a folder the config never heard of', async () => {
    expect(await lint('src/os/probe/probe.ts', "import { Finder } from '../apps/finder/Finder';")).toContain(rule);
    expect(await lint('src/os/probe/deeper/probe.ts', "export const load = () => import('../../apps/finder/Finder');")).toContain(rule);
  });
  test('the catalog lists the manifests, and the OS loads its own parts on demand', async () => {
    expect(await lint('src/os/catalog.ts', "export { finder } from './apps/finder/manifest';")).toBe('');
    expect(await lint('src/os/shell/Probe.tsx', "export const load = () => import('./Expose');\nexport const store = () => import('../core/store');")).toBe('');
  });
});

describe('an app uses the OS, never another app or an applet', () => {
  const rule = 'An app doesn’t import another app; move what they share into the OS.';
  test('a sibling by name', async () => {
    expect(await lint('src/os/apps/probe/Probe.tsx', "import { IPod } from '../ipod/IPod';")).toContain(rule);
    expect(await lint('src/os/apps/probe/Probe.tsx', "export const load = () => import('../ipod/IPod');")).toContain(rule);
  });
  test('a sibling by way of apps/', async () => {
    expect(await lint('src/os/apps/probe/Probe.tsx', "import { IPod } from '../../apps/ipod/IPod';")).toContain(rule);
    expect(await lint('src/os/apps/probe/Probe.tsx', "export const load = () => import('../../apps/ipod/IPod');")).toContain(rule);
  });
  test('an applet', async () => {
    expect(await lint('src/os/apps/probe/Probe.tsx', "import { table } from '../../applets/pinball/table';")).toContain('Apps don’t import applets.');
    expect(await lint('src/os/apps/probe/Probe.tsx', "export const load = () => import('../../applets/pinball/table');")).toContain('Apps don’t import applets.');
  });
  test('the OS and its own folder', async () => {
    const code = [
      "import { useWindows } from '../../core/store';",
      "import { Thumb } from '../../files/parts';",
      "import { Sheet } from './Sheet';",
      "export const load = () => import('./Views');",
      "export const store = () => import('../../core/store');"
    ].join('\n');
    expect(await lint('src/os/apps/probe/Probe.tsx', code)).toBe('');
  });
  test('a manifest imports only the kit, the icons and its own folder', async () => {
    const rule = 'A manifest imports only kit/manifest, core/icons and its own folder.';
    const own = [
      "import { pngIcon } from '../../core/icons';",
      "import { defineApp } from '../../kit/manifest';",
      "export default defineApp({ load: () => import('./Probe'), styles: () => import('./probe.css?inline') });",
      // Lazy, so not in the first load: the app rule holds it, not this one.
      "export const data = () => import('../../media/library');"
    ].join('\n');
    expect(await lint('src/os/apps/probe/manifest.ts', own)).toBe('');
    expect(await lint('src/os/apps/probe/manifest.ts', "import { useWindows } from '../../core/store';")).toContain(rule);
    expect(await lint('src/os/apps/probe/manifest.ts', "export const load = () => import('../../apps/ipod/IPod');")).toContain('An app doesn’t import another app');
  });
});

describe('an applet sees only the kit', () => {
  const rule = 'Applets import only src/os/kit and their own folder.';
  test('the OS', async () => {
    expect(await lint('src/os/applets/probe/Probe.tsx', "import { useWindows } from '../../core/store';")).toContain(rule);
    expect(await lint('src/os/applets/probe/Probe.tsx', "export const store = () => import('../../core/store');")).toContain(rule);
  });
  test('another applet', async () => {
    expect(await lint('src/os/applets/probe/Probe.tsx', "import { rules } from '../spider/rules';")).toContain(rule);
    expect(await lint('src/os/applets/probe/Probe.tsx', "export const load = () => import('../spider/Spider');")).toContain(rule);
  });
  test('the kit and its own folder', async () => {
    const code = [
      "import { saved } from '../../kit';",
      "import { defineApp } from '../../kit/manifest';",
      "import { table } from './table';",
      "export const load = () => import('./Probe');"
    ].join('\n');
    expect(await lint('src/os/applets/probe/manifest.ts', code)).toBe('');
  });
});
