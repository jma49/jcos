import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Sticky } from '../stickies';
import { backends, type Backend } from './backends';

// A member's own stickies, the same on both backends: theirs alone, the
// table's checks, the database's limit, and a change of the text from an
// older copy refused while moving one never is.

afterEach(() => {
  vi.unstubAllGlobals();
});

const row = (id: string, more: Partial<Record<string, unknown>> = {}) => ({
  id,
  body: '',
  color: 'yellow',
  x: 60,
  y: 60,
  width: 220,
  height: 180,
  collapsed: false,
  version: 1,
  updated_at: '2026-10-02T10:00:00Z',
  ...more
});

describe.each(backends)('stickies: $name', ({ make }) => {
  let b: Backend;

  test('signed out, there are none and none can be put up', async () => {
    b = make();
    expect(await b.social.myStickies()).toEqual([]);
    await expect(b.social.addSticky({ body: 'hi' })).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.removeSticky('any')).rejects.toMatchObject({ reason: 'signed-out' });
  });

  test('a sticky holds 4,000 characters at most, in one of its colours', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => (db.refuse('stickies.insert', '23514'), db.refuse('stickies.insert', '23514')) });
    await expect(b.social.addSticky({ body: 'x'.repeat(4001) })).rejects.toMatchObject({ reason: 'invalid' });
    await expect(b.social.addSticky({ color: 'orange' as never })).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('past the database’s limit, a new one is refused', async () => {
    b = make();
    const alice = await b.signUp('alice');
    const { stickies } = (await b.social.limits())!;
    await b.given({
      local: (store) => store.set('os-dev-stickies', JSON.stringify({ [alice.id]: Array.from({ length: stickies }, (_, i) => ({ ...row(`s${i}`), updated: '' })) })),
      supabase: (db) => db.refuse('stickies.insert', 'P0429', `You have ${stickies} stickies already. Close one first.`)
    });
    await expect(b.social.addSticky({})).rejects.toMatchObject({ reason: 'limit' });
  });

  test('a member’s stickies are theirs alone', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => db.answer('stickies.insert', { data: row('a', { body: 'alice’s' }) }) });
    await b.social.addSticky({ body: 'alice’s' });
    await b.social.signOut();
    await b.signUp('bob');
    // Row-level security gives bob none of alice's.
    expect(await b.social.myStickies()).toEqual([]);
  });

  test('a change of the text names the version it was typed over; moving it never does', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => db.answer('stickies.insert', { data: row('a') }) });
    const made: Sticky = await b.social.addSticky({});
    expect(made.version).toBe(1);

    await b.given({ supabase: (db) => db.answer('stickies.update', { data: row(made.id, { body: 'one', version: 2 }) }) });
    const typed = await b.social.changeSticky(made.id, { body: 'one' }, 1);
    expect(typed.version).toBe(2);
    if (b.db) expect(b.db.last('stickies')?.filters).toContainEqual(['eq', 'version', 1]);

    // Another copy, still at version 1, types over it: refused, nothing lost.
    await expect(b.social.changeSticky(made.id, { body: 'stale' }, 1)).rejects.toMatchObject({ reason: 'conflict' });

    // Moving it from the old copy is never out of date, and leaves the text's version.
    await b.given({ supabase: (db) => db.answer('stickies.update', { data: row(made.id, { body: 'one', version: 2, x: 300 }) }) });
    const moved = await b.social.changeSticky(made.id, { x: 300 }, 1);
    expect([moved.x, moved.body, moved.version]).toEqual([300, 'one', 2]);
    if (b.db) expect(b.db.last('stickies')?.filters).not.toContainEqual(['eq', 'version', 1]);
  });

  test('one taken down elsewhere can’t be changed', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => db.answer('stickies.insert', { data: row('a') }) });
    const made = await b.social.addSticky({});
    await b.social.removeSticky(made.id);
    await expect(b.social.changeSticky(made.id, { x: 10 })).rejects.toMatchObject({ reason: 'conflict' });
  });
});
