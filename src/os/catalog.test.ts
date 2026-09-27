import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { catalog } from './catalog';

// The catalog's contract: every app is a folder named by its id with a
// manifest, listed once; applets, and only applets, have a store page.

const folders = (dir: string) =>
  readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

describe('catalog', () => {
  test('lists each app once, under its folder’s name', () => {
    const ids = catalog.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !catalog.find((m) => m.id === id)?.applet).sort()).toEqual(folders('./apps/'));
    expect(ids.filter((id) => catalog.find((m) => m.id === id)?.applet).sort()).toEqual(folders('./applets/'));
  });

  test('every app folder has a manifest', () => {
    for (const dir of ['apps', 'applets']) {
      for (const name of folders(`./${dir}/`)) expect(existsSync(new URL(`./${dir}/${name}/manifest.ts`, import.meta.url))).toBe(true);
    }
  });

  test('windows open at least as big as their smallest size', () => {
    for (const { id, window: w } of catalog) {
      expect(w.minWidth, id).toBeLessThanOrEqual(w.width);
      expect(w.minHeight, id).toBeLessThanOrEqual(w.height);
    }
  });

  test('Dock positions are distinct', () => {
    const docked = catalog.flatMap((m) => ('dock' in m && m.dock ? [m.dock] : []));
    expect(new Set(docked).size).toBe(docked.length);
  });

  test('applets have a complete store page', () => {
    for (const m of catalog) {
      if (!('applet' in m) || !m.applet) continue;
      expect(m.applet.tagline.length, m.id).toBeGreaterThan(0);
      expect(m.applet.description.length, m.id).toBeGreaterThan(m.applet.tagline.length);
      expect(m.applet.added, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
