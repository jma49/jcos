import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Disc } from '../../lib/library';

// Discs as Realtime tells of them (discWatch.ts): one burned elsewhere goes
// on the shelf and the visitor is told, one burned on this page isn't told
// again, one thrown away leaves the shelf and its notice goes; and a shelf
// read already under way can't put back what Realtime has changed since.

const db = vi.hoisted(() => ({
  handlers: null as null | { onDisc: (disc: Disc, burned: boolean) => void; onRemove: (id: string) => void },
  shelf: null as null | (() => Promise<Disc[]>)
}));
const told = vi.hoisted(() => ({ notices: [] as { id?: string; body: string }[], dismissed: [] as string[] }));

vi.mock('../social/social', () => ({
  getSocial: async () => ({
    watchDiscs: (handlers: typeof db.handlers) => {
      db.handlers = handlers;
      return () => {};
    },
    shelf: () => db.shelf!()
  })
}));
vi.mock('../core/notices', () => ({
  notify: (notice: { id?: string; body: string }) => void told.notices.push(notice),
  dismiss: (id: string) => void told.dismissed.push(id)
}));
vi.mock('../core/icons', () => ({ DiscIcon: () => null }));
vi.mock('./drive', () => ({ insertDisc: async () => {} }));

const disc = (id: string, title = id): Disc => ({ id, title, cover: 'maxresdefault', coverX: 50, added: '2026-09-29T08:00:00.000Z' });

/** The modules afresh, with the library read and Realtime listening. */
async function start(discs: Disc[] = []) {
  vi.resetModules();
  const library = await import('./library');
  library.applyLibrary({ albums: [], songs: [{ id: 's', title: 's', artist: 'a', album: 'x' } as never], discs });
  const discsModule = await import('./discs');
  const { watchDiscs } = await import('./discWatch');
  watchDiscs();
  await vi.waitFor(() => expect(db.handlers).not.toBeNull());
  return { library, discs: discsModule };
}

beforeEach(() => {
  db.handlers = null;
  db.shelf = null;
  told.notices.length = 0;
  told.dismissed.length = 0;
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, addEventListener: () => {}, removeEventListener: () => {} });
});

describe('Realtime', () => {
  test('a disc burned elsewhere goes on the shelf, and the visitor is told', async () => {
    const { library } = await start([disc('A')]);
    db.handlers!.onDisc(disc('B', 'Whiplash'), true);
    expect(library.DISCS.map((d) => d.id)).toEqual(['A', 'B']);
    expect(told.notices).toMatchObject([{ id: 'disc-burned-B', body: 'Whiplash' }]);
  });

  test('one burned on this page isn’t told again, and a relabel isn’t a burn', async () => {
    const { library, discs } = await start([disc('A')]);
    discs.burnedOnThisPage.add('B');
    db.handlers!.onDisc(disc('B'), true);
    db.handlers!.onDisc(disc('A', 'Renamed'), false);
    expect(library.DISCS.map((d) => d.title)).toEqual(['Renamed', 'B']);
    expect(told.notices).toEqual([]);
  });

  test('one thrown away leaves the shelf, and its notice goes', async () => {
    const { library } = await start([disc('A'), disc('B')]);
    db.handlers!.onRemove('A');
    expect(library.DISCS.map((d) => d.id)).toEqual(['B']);
    expect(told.dismissed).toEqual(['disc-burned-A']);
  });

  test('a shelf read under way when a change comes can’t put the old shelf back', async () => {
    const { library, discs } = await start([disc('A')]);
    let answer: ((discs: Disc[]) => void) | null = null;
    db.shelf = () => new Promise((resolve) => (answer = resolve));
    const reading = discs.readShelf();
    await vi.waitFor(() => expect(answer).not.toBeNull());
    db.handlers!.onRemove('A');
    answer!([disc('A')]);
    await reading;
    expect(library.DISCS).toEqual([]);
  });
});
