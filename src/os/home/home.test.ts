import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DiaryEntry, Home, HomeDocument } from '../social/types';

// Jincheng's home folder (home.ts): how the diary reads, names for new
// documents, what a visitor is left with, reads that can't undo a save,
// the owner's other tabs told of a change, and drafts shared by them.

const backend = vi.hoisted(() => ({ social: null as null | Record<string, (...args: never[]) => unknown> }));
vi.mock('../social/social', () => ({ getSocial: async () => backend.social }));

const stored = new Map<string, string>();

/** The browser's BroadcastChannel: a message reaches every other channel of the same name, after a moment. */
class FakeChannel {
  static open: FakeChannel[] = [];
  static posted: unknown[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(public name: string) {
    FakeChannel.open.push(this);
  }
  postMessage(data: unknown) {
    FakeChannel.posted.push(data);
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) queueMicrotask(() => other.onmessage?.({ data }));
    }
  }
}
/** Lets posted messages arrive. */
const delivered = () => new Promise((resolve) => setTimeout(resolve, 0));

const doc = (id: string, folder: HomeDocument['folder'], name: string, body = ''): HomeDocument => ({
  id,
  folder,
  name,
  body,
  version: 1,
  created: '2026-09-27T10:00:00.000Z',
  updated: '2026-09-28T10:00:00.000Z'
});
const entry = (id: string, day: string, created: string, body = 'x'): DiaryEntry => ({ id, day, body, version: 1, created, updated: created });

/** A backend holding `home`, which a test can change and slow down. */
function database(home: Home) {
  const answer = { home: structuredClone(home), wait: Promise.resolve() };
  const social = {
    home: vi.fn(async (owner: boolean) => {
      const read = structuredClone(answer.home);
      await answer.wait;
      return owner ? read : { documents: read.documents.filter((d) => d.folder === 'public'), diary: [] };
    }),
    saveDocument: vi.fn(async (draft: HomeDocument) => ({ ...draft, id: draft.id ?? 'new', version: (draft.version ?? 0) + 1, updated: new Date().toISOString() })),
    saveEntry: vi.fn(async (draft: DiaryEntry) => ({ ...draft, id: draft.id ?? 'new-entry', version: 1, created: 'now', updated: 'now' })),
    deleteDocument: vi.fn(async () => {}),
    deleteEntry: vi.fn(async () => {})
  };
  backend.social = social as never;
  return { social, answer };
}

const load = async () => {
  vi.resetModules();
  return import('./home');
};

beforeEach(() => {
  stored.clear();
  backend.social = null;
  FakeChannel.open = [];
  FakeChannel.posted = [];
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key)
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('BroadcastChannel', FakeChannel);
});

afterEach(() => vi.unstubAllGlobals());

describe('the diary', () => {
  test('reads newest day first, a day’s entries in the order they were written, a year at a time', async () => {
    const { diaryOf } = await load();
    const diary = [
      entry('a', '2026-09-27', '2026-09-27T09:00:00Z'),
      entry('b', '2026-09-28', '2026-09-28T22:00:00Z'),
      entry('c', '2026-09-28', '2026-09-28T08:00:00Z'),
      entry('d', '2025-12-31', '2025-12-31T23:00:00Z')
    ];
    expect(diaryOf(diary, 2026).map(({ day, entries }) => `${day}: ${entries.map((e) => e.id).join('')}`)).toEqual(['2026-09-28: cb', '2026-09-27: a']);
    expect(diaryOf(diary, 2025)).toHaveLength(1);
  });

  test('has a document for every year written in, and this year’s to start', async () => {
    const { diaryYears } = await load();
    expect(diaryYears([entry('a', '2024-03-01', 't')], new Date('2026-09-29T12:00:00'))).toEqual([2026, 2024]);
    expect(diaryYears([], new Date('2026-09-29T12:00:00'))).toEqual([2026]);
  });

  test('today is the day on this device', async () => {
    const { today } = await load();
    expect(today(new Date(2026, 8, 29, 23, 59))).toBe('2026-09-29');
    expect(today(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });
});

describe('a new document’s name', () => {
  test('is Untitled, then the next number free in that folder, whatever the case', async () => {
    const { newName } = await load();
    const documents = [doc('1', 'documents', 'untitled.txt'), doc('2', 'documents', 'Untitled 2.txt'), doc('3', 'public', 'Untitled 3.txt')];
    expect(newName(documents, 'documents')).toBe('Untitled 3.txt');
    expect(newName(documents, 'desktop')).toBe('Untitled.txt');
  });
});

describe('reading', () => {
  const home: Home = {
    documents: [doc('p', 'public', 'Hello.txt'), doc('d', 'documents', 'Things to remember.txt')],
    diary: [entry('e', '2026-09-28', 't')]
  };

  test('gives a visitor Public alone, and the owner all of it', async () => {
    database(home);
    const h = await load();
    await h.readHome(false);
    expect(h.homeNow().documents.map((d) => d.id)).toEqual(['p']);
    await h.readHome(true);
    expect(h.homeNow().documents).toHaveLength(2);
    expect(h.homeNow().diary).toHaveLength(1);
  });

  test('signing out takes the owner’s own things away at once, before any read', async () => {
    const { answer } = database(home);
    const h = await load();
    await h.readHome(true);
    answer.wait = new Promise(() => {});
    void h.readHome(false);
    expect(h.homeNow().documents.map((d) => d.folder)).toEqual(['public']);
    expect(h.homeNow().diary).toEqual([]);
  });

  test('a read that started before a save can’t undo it', async () => {
    const { answer } = database(home);
    const h = await load();
    await h.readHome(true);
    let release = () => {};
    answer.wait = new Promise<void>((resolve) => (release = resolve));
    const reading = h.readHome(true, { now: true });
    await h.saveDocument({ id: 'd', version: 1, folder: 'documents', name: 'Things to remember.txt', body: 'Chalk.' });
    release();
    await reading;
    expect(h.homeNow().documents.find((d) => d.id === 'd')?.body).toBe('Chalk.');
  });

  test('a read for someone who has since signed out is dropped', async () => {
    const { answer } = database(home);
    const h = await load();
    let release = () => {};
    answer.wait = new Promise<void>((resolve) => (release = resolve));
    const asOwner = h.readHome(true);
    void h.readHome(false);
    release();
    await asOwner;
    expect(h.homeNow().owner).toBe(false);
    expect(h.homeNow().documents.every((d) => d.folder === 'public')).toBe(true);
  });

  test('without a database there’s nothing, and nothing breaks', async () => {
    const h = await load();
    await h.readHome(true);
    expect(h.homeNow().documents).toEqual([]);
    await expect(h.saveDocument({ folder: 'documents', name: 'x.txt', body: '' })).rejects.toThrow(/database/);
  });
});

describe('the owner’s other tabs', () => {
  const home: Home = { documents: [doc('d', 'documents', 'Things to remember.txt')], diary: [entry('e', '2026-09-28', 't')] };

  test('are told of every save and delete, and of no read', async () => {
    database(home);
    const h = await load();
    await h.readHome(true);
    await h.readHome(true, { now: true });
    expect(FakeChannel.posted).toEqual([]);
    await h.saveDocument({ id: 'd', version: 1, folder: 'documents', name: 'Things to remember.txt', body: 'Chalk.' });
    await h.deleteDocument('d');
    await h.saveEntry({ day: '2026-09-29', body: 'Sent it.' });
    await h.deleteEntry('e');
    expect(FakeChannel.posted).toHaveLength(4);
  });

  test('a tab showing the home folder reads it again at once; one that isn’t, the next time something shows it', async () => {
    const { answer, social } = database(home);
    // Three tabs: A saves; B shows the home folder (Finder, TextEdit); C read it once and shows nothing now.
    const a = await load();
    const b = await load();
    const c = await load();
    await Promise.all([a.readHome(true), b.readHome(true), c.readHome(true)]);
    const stop = b.watchHome(true);
    expect(social.home).toHaveBeenCalledTimes(3);
    answer.home.documents[0] = { ...answer.home.documents[0], body: 'Chalk.', version: 2 };
    await a.saveDocument({ id: 'd', version: 1, folder: 'documents', name: 'Things to remember.txt', body: 'Chalk.' });
    await delivered();
    await vi.waitFor(() => expect(b.homeNow().documents[0].body).toBe('Chalk.'));
    expect(social.home).toHaveBeenCalledTimes(4);
    // C didn't ask for it, but its copy is stale now: showing it reads again, within the 30 s a read stands otherwise.
    expect(c.homeNow().documents[0].body).toBe('');
    await c.readHome(true);
    expect(social.home).toHaveBeenCalledTimes(5);
    expect(c.homeNow().documents[0].body).toBe('Chalk.');
    // Once B shows nothing, it's left alone.
    stop();
    await a.saveEntry({ day: '2026-09-29', body: 'Sent it.' });
    await delivered();
    expect(social.home).toHaveBeenCalledTimes(5);
  });
});

describe('drafts', () => {
  test('are kept until dropped, and another tab’s stay', async () => {
    const h = await load();
    h.keepDraft('doc:a', { body: 'typed', version: 3 });
    stored.set('os-textedit-drafts', JSON.stringify({ ...JSON.parse(stored.get('os-textedit-drafts')!), 'doc:b': { body: 'other tab', version: 1 } }));
    h.dropDraft('doc:a');
    expect(h.draftOf('doc:a')).toBeUndefined();
    expect(h.draftOf('doc:b')).toEqual({ body: 'other tab', version: 1 });
  });

  test('that aren’t drafts are ignored', async () => {
    stored.set('os-textedit-drafts', JSON.stringify({ 'doc:a': { body: 42 }, 'doc:b': 'nope' }));
    const h = await load();
    expect(h.draftOf('doc:a')).toBeUndefined();
    expect(h.draftOf('doc:b')).toBeUndefined();
  });
});
