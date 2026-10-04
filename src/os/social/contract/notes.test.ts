import { afterEach, describe, expect, test, vi } from 'vitest';
import { backends, type Backend } from './backends';

// The guestbook, the same on both backends: members only, a few notes a
// day (the database's limit, which limits() tells), and a member takes
// down only their own.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const note = { body: 'hello', color: 'yellow' } as const;

describe.each(backends)('notes: $name', ({ make }) => {
  let b: Backend;

  test('signed out, a note is refused and none are left', async () => {
    b = make();
    await expect(b.social.postNote(note)).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.deleteNote('any')).rejects.toMatchObject({ reason: 'signed-out' });
    expect(await b.social.notesLeft()).toBe(0);
  });

  test('a member has the day’s notes the limit allows, and one past it is refused', async () => {
    b = make();
    await b.signUp('alice');
    const { notesPerDay } = (await b.social.limits())!;
    expect(await b.social.notesLeft()).toBe(notesPerDay);
    await b.given({
      local: async (_, social) => {
        for (let i = 0; i < notesPerDay; i++) await social.postNote(note);
      },
      supabase: (db) => {
        db.answer('rpc.notes_left', { data: 0 });
        db.refuse('notes.insert', 'P0429', `That’s ${notesPerDay} notes today. Come back tomorrow.`);
      }
    });
    expect(await b.social.notesLeft()).toBe(0);
    await expect(b.social.postNote(note)).rejects.toMatchObject({ reason: 'limit', message: expect.stringContaining(String(notesPerDay)) });
  });

  test('a note is signed with the member’s name, newest first', async () => {
    b = make();
    const alice = await b.signUp('alice');
    // A second apart, as the database's clock would have them.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    await b.social.postNote({ body: 'first', color: 'blue' });
    vi.setSystemTime(new Date('2026-10-02T10:00:01Z'));
    await b.social.postNote({ body: 'second', color: 'pink' });
    await b.given({
      supabase: (db) =>
        db.answer('notes.select', {
          data: [
            { id: '2', body: 'second', name: 'alice', color: 'pink', user_id: alice.id, created_at: '2026-10-02T10:00:01Z' },
            { id: '1', body: 'first', name: 'alice', color: 'blue', user_id: alice.id, created_at: '2026-10-02T10:00:00Z' }
          ]
        })
    });
    const notes = await b.social.listNotes();
    expect(notes.map((n) => [n.body, n.name, n.user_id])).toEqual([
      ['second', 'alice', alice.id],
      ['first', 'alice', alice.id]
    ]);
    // What the database fills in (who, when) isn't the site's to send.
    if (b.db) expect(b.db.last('notes')?.op).toBe('select');
    if (b.db) expect(b.db.calls.find((c) => c.target === 'notes' && c.op === 'insert')?.payload).toEqual({ body: 'first', color: 'blue' });
  });

  test('a member takes down their own note, never another’s', async () => {
    b = make();
    await b.signUp('alice');
    await b.social.postNote({ body: 'alice’s', color: 'yellow' });
    const [mine] = await b.social.listNotes();
    await b.social.signOut();
    await b.signUp('bob');
    // Row-level security lets bob's delete reach no row, without an error.
    await b.social.deleteNote(mine?.id ?? 'alices-note');
    await b.given({
      supabase: (db) => db.answer('notes.select', { data: [{ id: 'alices-note', body: 'alice’s', name: 'alice', color: 'yellow', user_id: 'a', created_at: '2026-10-02T10:00:00Z' }] })
    });
    expect((await b.social.listNotes()).map((n) => n.body)).toEqual(['alice’s']);
  });
});
