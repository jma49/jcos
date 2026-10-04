import { afterEach, describe, expect, test, vi } from 'vitest';
import type { EventDraft, TodoDraft } from '../calendar';
import { backends, type Backend } from './backends';

// A member's own calendar, the same on both backends: theirs alone, the
// tables' checks, the database's limits, and every change naming the
// version it was made from.

afterEach(() => {
  vi.unstubAllGlobals();
});

const lunch: EventDraft = { title: 'Lunch', calendar: 'home', day: '2026-10-05', starts: 720, ends: 780, notes: '' };
const milk: TodoDraft = { title: 'Milk', calendar: 'home', priority: 0, due: null, done: false };
const eventRow = (id: string, version = 1, more = {}) => ({ id, title: 'Lunch', calendar: 'home', day: '2026-10-05', starts: 720, ends: 780, notes: '', version, ...more });
const todoRow = (id: string, version = 1, more = {}) => ({
  id,
  title: 'Milk',
  calendar: 'home',
  priority: 0,
  due: null,
  done: false,
  done_at: null,
  created_at: '2026-10-02T10:00:00Z',
  version,
  ...more
});

describe.each(backends)('calendar: $name', ({ make }) => {
  let b: Backend;

  test('signed out, there’s nothing, and nothing can be added', async () => {
    b = make();
    expect(await b.social.myEvents('2026-10-01', '2026-10-31')).toEqual([]);
    expect(await b.social.myTodos()).toEqual([]);
    await expect(b.social.saveEvent(lunch)).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.saveTodo(milk)).rejects.toMatchObject({ reason: 'signed-out' });
  });

  test('a title is one line, and an event ends after it starts', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => ['events', 'events', 'todos'].forEach((t) => db.refuse(`${t}.insert`, '23514')) });
    await expect(b.social.saveEvent({ ...lunch, title: 'two\nlines' })).rejects.toMatchObject({ reason: 'invalid' });
    await expect(b.social.saveEvent({ ...lunch, starts: 800, ends: 700 })).rejects.toMatchObject({ reason: 'invalid' });
    await expect(b.social.saveTodo({ ...milk, title: '' })).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('past the database’s limits, a new event or to-do is refused', async () => {
    b = make();
    const alice = await b.signUp('alice');
    const { events, todos } = (await b.social.limits())!;
    await b.given({
      local: (store) =>
        store.set(
          'os-dev-calendar',
          JSON.stringify({
            [alice.id]: {
              events: Array.from({ length: events }, (_, i) => ({ ...lunch, id: `e${i}`, version: 1 })),
              todos: Array.from({ length: todos }, (_, i) => ({ ...milk, id: `t${i}`, doneAt: null, created: '', version: 1 }))
            }
          })
        ),
      supabase: (db) => (db.refuse('events.insert', 'P0429'), db.refuse('todos.insert', 'P0429'))
    });
    await expect(b.social.saveEvent(lunch)).rejects.toMatchObject({ reason: 'limit' });
    await expect(b.social.saveTodo(milk)).rejects.toMatchObject({ reason: 'limit' });
  });

  test('a change names the version it was made from; one from an older copy is refused', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => db.answer('events.insert', { data: eventRow('e') }) });
    const made = await b.social.saveEvent(lunch);
    expect(made.version).toBe(1);
    await b.given({ supabase: (db) => db.answer('events.update', { data: eventRow(made.id, 2, { title: 'Long lunch' }) }) });
    const saved = await b.social.saveEvent({ ...lunch, title: 'Long lunch', id: made.id, version: 1 });
    expect([saved.title, saved.version]).toEqual(['Long lunch', 2]);
    if (b.db) expect(b.db.last('events')?.filters).toEqual([
      ['eq', 'id', made.id],
      ['eq', 'version', 1]
    ]);
    await expect(b.social.saveEvent({ ...lunch, title: 'Stale', id: made.id, version: 1 })).rejects.toMatchObject({ reason: 'conflict' });

    await b.given({ supabase: (db) => db.answer('todos.insert', { data: todoRow('t') }) });
    const todo = await b.social.saveTodo(milk);
    await b.given({ supabase: (db) => db.answer('todos.update', { data: todoRow(todo.id, 2, { done: true, done_at: '2026-10-02T11:00:00Z' }) }) });
    const done = await b.social.saveTodo({ ...milk, done: true, id: todo.id, version: 1 });
    expect([done.done, done.doneAt !== null, done.version]).toEqual([true, true, 2]);
    await expect(b.social.saveTodo({ ...milk, id: todo.id, version: 1 })).rejects.toMatchObject({ reason: 'conflict' });
  });

  test('a member’s calendar is theirs alone', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => db.answer('events.insert', { data: eventRow('e') }) });
    await b.social.saveEvent(lunch);
    await b.social.signOut();
    await b.signUp('bob');
    expect(await b.social.myEvents('2026-10-01', '2026-10-31')).toEqual([]);
  });
});
