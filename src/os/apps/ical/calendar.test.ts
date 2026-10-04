import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarEvent, Todo } from '../../social/types';

// iCal's calendar (calendar.ts): the days a month shows, times, the order
// of a day's events and of the to-dos, and a member's calendar read for
// them alone, a few weeks at a time, with changes shown at once.

const backend = vi.hoisted(() => ({ social: null as null | Record<string, (...args: never[]) => unknown> }));
vi.mock('../../social/social', () => ({ getSocial: async () => backend.social }));

const event = (id: string, day: string, more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  calendar: 'home',
  day,
  starts: null,
  ends: null,
  notes: '',
  version: 1,
  ...more
});
const todo = (id: string, more: Partial<Todo> = {}): Todo => ({
  id,
  title: id,
  calendar: 'home',
  priority: 0,
  due: null,
  done: false,
  doneAt: null,
  created: '2026-09-29T10:00:00Z',
  version: 1,
  ...more
});

/**
 * Saves as the database makes them: a new one at version 1; a change
 * names the version it was made from, refused ('conflict') unless it's
 * the one saved, and counts.
 */
async function saved<T extends { id: string; version: number }>(rows: T[], { id, version, ...fields }: Partial<T>, fresh: () => T): Promise<T> {
  if (!id) {
    const made = { ...fresh(), ...fields, version: 1 } as T;
    rows.push(made);
    return structuredClone(made);
  }
  const at = rows.findIndex((r) => r.id === id);
  // The SocialError calendar.ts knows: the one loaded since vi.resetModules().
  const { SocialError } = await import('../../social/types');
  if (at < 0 || rows[at].version !== version) throw new SocialError('conflict', 'It was changed or thrown away somewhere else since this copy was opened.');
  rows[at] = { ...rows[at], ...fields, version: rows[at].version + 1 };
  return structuredClone(rows[at]);
}

/** A backend holding a member's calendar, which a test can slow down or make refuse. */
function database(events: CalendarEvent[], todos: Todo[] = []) {
  const answer = { events: structuredClone(events), todos: structuredClone(todos), wait: Promise.resolve(), refuse: false, saving: Promise.resolve() };
  const social = {
    myEvents: vi.fn(async (from: string, to: string) => {
      const read = answer.events.filter((e) => e.day >= from && e.day <= to);
      await answer.wait;
      return structuredClone(read);
    }),
    myTodos: vi.fn(async () => structuredClone(answer.todos)),
    saveEvent: vi.fn(async (draft: Partial<CalendarEvent>) => {
      await answer.saving;
      if (answer.refuse) throw new Error('refused');
      return saved(answer.events, draft, () => event('new', ''));
    }),
    removeEvent: vi.fn(async () => {}),
    saveTodo: vi.fn(async (draft: Partial<Todo>) => {
      await answer.saving;
      if (answer.refuse) throw new Error('refused');
      return saved(answer.todos, draft, () => todo('new'));
    }),
    removeTodo: vi.fn(async () => {}),
    limits: vi.fn(async () => ({ notesPerDay: 3, stickies: 50, events: 5000, todos: 1000 }))
  };
  backend.social = social as never;
  return { social, answer };
}

const load = async () => {
  vi.resetModules();
  return import('./calendar');
};

beforeEach(() => {
  backend.social = null;
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});

afterEach(() => vi.unstubAllGlobals());

describe('days', () => {
  test('a month shows six weeks from the Sunday on or before its first', async () => {
    const { monthGrid } = await load();
    const september = monthGrid('2026-09');
    expect(september).toHaveLength(42);
    expect(september[0]).toBe('2026-08-30');
    expect(september[2]).toBe('2026-09-01');
    expect(september[41]).toBe('2026-10-10');
    expect(monthGrid('2026-02')[0]).toBe('2026-02-01');
  });

  test('months and days add up across years and clock changes', async () => {
    const { addDays, addMonths } = await load();
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-08', -1)).toBe('2026-03-07');
  });

  test('times read as a Mac wrote them, and come from and go to a time field', async () => {
    const { minutesOf, shortTime, timeName, timeValue } = await load();
    expect([0, 540, 755, 1439].map(timeName)).toEqual(['12:00 AM', '9:00 AM', '12:35 PM', '11:59 PM']);
    expect([540, 1110, 720].map(shortTime)).toEqual(['9a', '6:30p', '12p']);
    expect(minutesOf('09:30')).toBe(570);
    expect(minutesOf('nope')).toBeNull();
    expect(timeValue(570)).toBe('09:30');
    expect(timeValue(1440)).toBe('23:59');
  });

  test('a day lists all day first, then by time; to-dos the undone and most urgent first', async () => {
    const { dayEvents, todoOrder } = await load();
    const events = [event('late', '2026-09-30', { starts: 900, ends: 960 }), event('all', '2026-09-30'), event('early', '2026-09-30', { starts: 540, ends: 600 }), event('other', '2026-10-01')];
    expect(dayEvents(events, '2026-09-30').map((e) => e.id)).toEqual(['all', 'early', 'late']);
    const todos = [todo('done', { done: true, priority: 3 }), todo('low', { priority: 1 }), todo('high-later', { priority: 3, due: '2026-10-09' }), todo('high-soon', { priority: 3, due: '2026-10-01' })];
    expect(todoOrder(todos).map((t) => t.id)).toEqual(['high-soon', 'high-later', 'low', 'done']);
  });
});

describe('the store', () => {
  test('reads a range of days for the member, and signing out takes it all away at once', async () => {
    database([event('a', '2026-09-30'), event('b', '2026-11-20')], [todo('t')]);
    const c = await load();
    await c.readEvents('alice', '2026-08-30', '2026-10-10');
    await c.readTodos('alice');
    expect(c.calendarNow().events.map((e) => e.id)).toEqual(['a']);
    expect(c.calendarNow().todos).toHaveLength(1);
    await c.readEvents('alice', '2026-11-01', '2026-12-12');
    expect(c.calendarNow().events.map((e) => e.id).sort()).toEqual(['a', 'b']);
    void c.readEvents(null, '2026-08-30', '2026-10-10');
    expect(c.calendarNow()).toMatchObject({ events: [], todos: [] });
  });

  test('a read that started before a change can’t undo it', async () => {
    const { answer } = database([event('a', '2026-09-30', { title: 'old' })]);
    const c = await load();
    await c.readEvents('alice', '2026-08-30', '2026-10-10');
    let release = () => {};
    answer.wait = new Promise<void>((resolve) => (release = resolve));
    const reading = c.readEvents('alice', '2026-08-30', '2026-10-10', { now: true });
    await c.changeEvent(event('a', '2026-09-30', { title: 'new' }));
    release();
    await reading;
    expect(c.calendarNow().events[0].title).toBe('new');
  });

  test('a change shows at once; refused, it goes back', async () => {
    const { answer } = database([], [todo('t')]);
    const c = await load();
    await c.readTodos('alice');
    answer.refuse = true;
    const ticking = c.changeTodo({ ...c.calendarNow().todos[0], done: true });
    expect(c.calendarNow().todos[0].done).toBe(true);
    await expect(ticking).rejects.toThrow('refused');
    expect(c.calendarNow().todos[0].done).toBe(false);
  });

  test('a change names the version it was made from, and one made while another is saving waits for it', async () => {
    const { social, answer } = database([event('a', '2026-09-30')]);
    const c = await load();
    await c.readEvents('alice', '2026-08-30', '2026-10-10');
    let release = () => {};
    answer.saving = new Promise<void>((resolve) => (release = resolve));
    const first = c.changeEvent({ ...c.calendarNow().events[0], title: 'Lunch' });
    // Made over the first, which shows already but hasn't saved yet.
    const second = c.changeEvent({ ...c.calendarNow().events[0], notes: 'Upstairs' });
    expect(c.calendarNow().events[0]).toMatchObject({ title: 'Lunch', notes: 'Upstairs' });
    release();
    await Promise.all([first, second]);
    expect(social.saveEvent.mock.calls.map(([draft]) => draft.version)).toEqual([1, 2]);
    expect(answer.events[0]).toMatchObject({ title: 'Lunch', notes: 'Upstairs', version: 3 });
    expect(c.calendarNow().events[0]).toMatchObject({ title: 'Lunch', notes: 'Upstairs', version: 3 });
  });

  test('a change from an older copy is refused as a conflict, and what was saved elsewhere comes back', async () => {
    const { answer } = database([event('a', '2026-09-30', { title: 'Lunch' })], [todo('t')]);
    const c = await load();
    await c.readEvents('alice', '2026-08-30', '2026-10-10');
    await c.readTodos('alice');
    // Another device saves both meanwhile.
    answer.events[0] = { ...answer.events[0], title: 'Lunch with Sam', version: 2 };
    answer.todos[0] = { ...answer.todos[0], priority: 3, version: 2 };
    await expect(c.changeEvent({ ...c.calendarNow().events[0], title: 'Dinner' })).rejects.toMatchObject({ reason: 'conflict' });
    await expect(c.changeTodo({ ...c.calendarNow().todos[0], done: true })).rejects.toMatchObject({ reason: 'conflict' });
    expect(answer.events[0].title).toBe('Lunch with Sam');
    expect(c.calendarNow().events[0]).toMatchObject({ title: 'Lunch with Sam', version: 2 });
    expect(c.calendarNow().todos[0]).toMatchObject({ done: false, priority: 3, version: 2 });
  });

  test('adds and deletes, and without a database there’s nothing, and nothing breaks', async () => {
    database([]);
    const c = await load();
    await c.readEvents('alice', '2026-08-30', '2026-10-10');
    const made = await c.addEvent({ title: 'Standup', calendar: 'work', day: '2026-09-30', starts: 540, ends: 555, notes: '' });
    expect(c.calendarNow().events).toEqual([made]);
    await c.removeEvent(made.id);
    expect(c.calendarNow().events).toEqual([]);
    backend.social = null;
    const d = await load();
    await d.readTodos('alice');
    expect(d.calendarNow().todos).toEqual([]);
    await expect(d.addTodo({ title: 'x', calendar: 'home', priority: 0, due: null, done: false })).rejects.toThrow(/database/);
  });
});
