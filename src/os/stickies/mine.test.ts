import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Sticky, StickyChange } from '../social/types';

// A member's own stickies (mine.ts): read for the one signed in and no
// one else, taken away at sign-out, moved at once and saved after, reads
// that can't undo a change, where new ones go, and drafts.

const backend = vi.hoisted(() => ({ social: null as null | Record<string, (...args: never[]) => unknown> }));
vi.mock('../social/social', () => ({ getSocial: async () => backend.social }));

const stored = new Map<string, string>();

const sticky = (id: string, body = '', more: Partial<Sticky> = {}): Sticky => ({
  id,
  body,
  color: 'yellow',
  x: 60,
  y: 60,
  width: 220,
  height: 180,
  collapsed: false,
  version: 1,
  updated: '2026-09-29T10:00:00.000Z',
  ...more
});

/** A backend holding each account's stickies, which a test can slow down or make refuse. */
function database(byAccount: Record<string, Sticky[]>) {
  const answer = { byAccount: structuredClone(byAccount), wait: Promise.resolve(), refuse: false, signedIn: null as string | null };
  const social = {
    myStickies: vi.fn(async () => {
      const read = structuredClone(answer.byAccount[answer.signedIn ?? ''] ?? []);
      await answer.wait;
      return read;
    }),
    addSticky: vi.fn(async (change: StickyChange) => sticky(`new-${Math.random()}`, change.body ?? '', change)),
    changeSticky: vi.fn(async (id: string, change: StickyChange) => {
      if (answer.refuse) throw new Error('refused');
      return sticky(id, change.body ?? 'from the database', change);
    }),
    removeSticky: vi.fn(async () => {})
  };
  backend.social = social as never;
  return { social, answer };
}

const load = async () => {
  vi.resetModules();
  return import('./mine');
};

beforeEach(() => {
  stored.clear();
  backend.social = null;
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key)
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('reading', () => {
  test('gives the member signed in their own, and signing out takes them away at once', async () => {
    const { answer } = database({ alice: [sticky('a', 'Call mum')] });
    const m = await load();
    answer.signedIn = 'alice';
    await m.readMine('alice');
    expect(m.myStickiesNow().map((s) => s.body)).toEqual(['Call mum']);
    answer.wait = new Promise(() => {});
    void m.readMine(null);
    expect(m.myStickiesNow()).toEqual([]);
  });

  test('another account’s never shows for a moment, and a read for someone gone is dropped', async () => {
    const { answer } = database({ alice: [sticky('a', 'Alice’s')], bob: [sticky('b', 'Bob’s')] });
    const m = await load();
    answer.signedIn = 'alice';
    await m.readMine('alice');
    let release = () => {};
    answer.wait = new Promise<void>((resolve) => (release = resolve));
    const forAlice = m.readMine('alice', { now: true });
    answer.signedIn = 'bob';
    void m.readMine('bob');
    expect(m.myStickiesNow()).toEqual([]);
    release();
    await forAlice;
    expect(m.myStickiesNow().some((s) => s.body === 'Alice’s')).toBe(false);
  });

  test('a read that started before a change can’t undo it', async () => {
    const { answer } = database({ alice: [sticky('a', 'old')] });
    const m = await load();
    answer.signedIn = 'alice';
    await m.readMine('alice');
    let release = () => {};
    answer.wait = new Promise<void>((resolve) => (release = resolve));
    const reading = m.readMine('alice', { now: true });
    await m.writeSticky('a', 'new', 1);
    release();
    await reading;
    expect(m.myStickiesNow()[0].body).toBe('new');
  });
});

describe('changing', () => {
  test('a move shows at once and is saved after; refused, the note goes back', async () => {
    const { social, answer } = database({ alice: [sticky('a', 'x')] });
    const m = await load();
    answer.signedIn = 'alice';
    await m.readMine('alice');
    const moving = m.placeSticky('a', { x: 300, y: 200 });
    expect(m.myStickiesNow()[0]).toMatchObject({ x: 300, y: 200 });
    await moving;
    expect(social.changeSticky).toHaveBeenCalledWith('a', { x: 300, y: 200 });
    answer.refuse = true;
    await expect(m.placeSticky('a', { x: 900 })).rejects.toThrow('refused');
    await vi.waitFor(() => expect(m.myStickiesNow()[0].x).toBe(60));
  });

  test('new stickies go down and across from the last, and there’s a limit', async () => {
    const { social, answer } = database({ alice: [] });
    const m = await load();
    answer.signedIn = 'alice';
    await m.readMine('alice');
    await m.addSticky();
    await m.addSticky();
    expect(social.addSticky.mock.calls.map(([c]) => [c.x, c.y])).toEqual([
      [40, 48],
      [68, 76]
    ]);
    expect(m.nextPlace(8)).toEqual({ x: 280, y: 48 });
    answer.byAccount.alice = Array.from({ length: 50 }, (_, i) => sticky(`s${i}`));
    await m.readMine('alice', { now: true });
    await expect(m.addSticky()).rejects.toThrow(/50 stickies/);
  });

  test('without a database there’s nothing, and nothing breaks', async () => {
    const m = await load();
    await m.readMine('alice');
    expect(m.myStickiesNow()).toEqual([]);
    await expect(m.addSticky()).rejects.toThrow(/database/);
  });

  test('on screen, a sticky keeps its strip within reach, under the menu bar', async () => {
    const m = await load();
    const screen = { width: 900, height: 600 };
    expect(m.onScreen(100, 100, 220, screen)).toEqual({ x: 100, y: 100 });
    expect(m.onScreen(1150, 700, 220, screen)).toEqual({ x: 820, y: 560 });
    expect(m.onScreen(-30, 0, 220, screen)).toEqual({ x: 0, y: 24 });
    // A narrow one may go right up to the edge; a wide one keeps 80px of its strip on the screen.
    expect(m.onScreen(2000, 100, 60, screen).x).toBe(840);
  });
});

describe('drafts', () => {
  test('are kept until dropped, taking a sticky down drops its own, and junk is ignored', async () => {
    database({ alice: [] });
    const m = await load();
    m.keepDraft('a', { body: 'typed', version: 3 });
    m.keepDraft('b', { body: 'other', version: 1 });
    expect(m.draftOf('a')).toEqual({ body: 'typed', version: 3 });
    await m.removeSticky('a');
    expect(m.draftOf('a')).toBeUndefined();
    expect(m.draftOf('b')).toEqual({ body: 'other', version: 1 });
    stored.set('os-sticky-drafts', JSON.stringify({ c: { body: 42 } }));
    expect(m.draftOf('c')).toBeUndefined();
  });
});
