// A member's own calendar in iCal (public.events and public.todos,
// supabase/migrations/20260929202730_ical_of_their_own.sql), which only
// they see. Events are read a few weeks at a time, as the month shown
// moves; to-dos are read whole. Changed here as the member adds, edits or
// deletes one, so iCal shows it at once, and the member's other tabs read
// again on every change. Signing out, or in as someone else, takes them
// away at once. Each save names the version it was made from, so one from
// an older copy (another device) is refused as a conflict rather than
// losing what was saved there; an item's saves on this page go one after
// another, each naming the version the one before it made.

import { useEffect, useSyncExternalStore } from 'react';
import { getSocial } from '../../social/social';
import { EVENT_MOST, SocialError, TODO_MOST, type CalendarEvent, type EventDraft, type Todo, type TodoDraft } from '../../social/types';

export type { CalendarEvent, EventDraft, Todo, TodoDraft };

// ---------- Days ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** A day (YYYY-MM-DD) from a date, where this device is. */
export const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Today, where this device is. */
export const today = (now = new Date()) => dayOf(now);

/** A day as a date at noon where this device is (noon, so no clock change moves it to another day). */
export const dateOf = (day: string) => new Date(`${day}T12:00:00`);

/** The day `n` days after `day`. */
export function addDays(day: string, n: number) {
  const date = dateOf(day);
  date.setDate(date.getDate() + n);
  return dayOf(date);
}

/** A month (YYYY-MM) `n` months after `month`. */
export function addMonths(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + n, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** The six weeks iCal shows for a month (YYYY-MM): from the Sunday on or before its first day, 42 days. */
export function monthGrid(month: string): string[] {
  const first = dateOf(`${month}-01`);
  const start = addDays(`${month}-01`, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** "9:00 AM", for minutes after midnight. */
export function timeName(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "6:30p", "9a": a time short enough for a day of the month, where the title matters more. */
export function shortTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}${m ? `:${pad(m)}` : ''}${h < 12 ? 'a' : 'p'}`;
}

/** Minutes after midnight from an <input type="time"> value ("09:30"); null if it isn't one. */
export function minutesOf(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** An <input type="time"> value for minutes after midnight (1440, the end of the day, as 23:59). */
export const timeValue = (minutes: number) => `${pad(Math.floor(Math.min(minutes, 1439) / 60))}:${pad(Math.min(minutes, 1439) % 60)}`;

/** A day's events as iCal lists them: all day first, then by when they start, then by title. */
export function dayEvents(events: CalendarEvent[], day: string) {
  return events
    .filter((e) => e.day === day)
    .sort((a, b) => (a.starts ?? -1) - (b.starts ?? -1) || a.title.localeCompare(b.title));
}

/** To-dos as iCal lists them: not done first, then the most urgent, the soonest due, the oldest. */
export function todoOrder(todos: Todo[]) {
  return [...todos].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      b.priority - a.priority ||
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      a.created.localeCompare(b.created)
  );
}

// ---------- The store ----------

interface Mine {
  account: string | null;
  events: CalendarEvent[];
  todos: Todo[];
}

let mine: Mine = { account: null, events: [], todos: [] };
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The member's calendar as it is now, for a view: it renders again when it changes. */
export function useCalendar() {
  useSyncExternalStore(subscribe, () => version, () => version);
  return mine;
}

/** The member's calendar as it is now, outside a view. */
export const calendarNow = () => mine;

// ---------- Reading ----------

/** How long a read stands before the database is asked again. */
const FRESH_MS = 30_000;
/** When each range of days, and the to-dos, were last read, for the account read. */
const freshAt = new Map<string, number>();
const reading = new Map<string, Promise<void>>();
/** Whose calendar was last asked for: a read for someone else since is dropped. */
let asked: string | null = null;
/** Changes made on this page, counted as each begins and ends: a read that started before one is dropped. */
let writes = 0;

/** Leaves `account`'s calendar (none for null) shown, and nobody else's, at once. */
function belongTo(account: string | null) {
  asked = account;
  if (mine.account === account) return;
  mine = { account, events: [], todos: [] };
  freshAt.clear();
  moved.clear();
  changed();
}

/** Reads one thing (a range of days, or the to-dos) for `account`, at most every 30 s unless `now`. */
function read(account: string | null, key: string, fetch: () => Promise<(current: Mine) => Mine>, now: boolean): Promise<void> {
  belongTo(account);
  if (!account) return Promise.resolve();
  const going = reading.get(key);
  if (going) return going;
  if (!now && Date.now() - (freshAt.get(key) ?? 0) < FRESH_MS) return Promise.resolve();
  const at = writes;
  const done = fetch()
    .then((apply) => {
      if (at !== writes || asked !== account || mine.account !== account) return;
      freshAt.set(key, Date.now());
      mine = apply(mine);
      changed();
    })
    .catch(() => {})
    .finally(() => {
      if (reading.get(key) === done) reading.delete(key);
    });
  reading.set(key, done);
  return done;
}

async function database() {
  const social = await getSocial();
  if (!social) throw new Error('iCal needs the database, which isn’t here.');
  return social;
}

/** Reads `account`'s events on the days `from` to `to`, in place of those held for them. */
export function readEvents(account: string | null, from: string, to: string, { now = false } = {}) {
  return read(
    account,
    `events:${from}:${to}`,
    async () => {
      const events = await (await database()).myEvents(from, to);
      return (current) => ({ ...current, events: [...current.events.filter((e) => e.day < from || e.day > to), ...events] });
    },
    now
  );
}

/** Reads `account`'s to-dos. */
export function readTodos(account: string | null, { now = false } = {}) {
  return read(
    account,
    'todos',
    async () => {
      const todos = await (await database()).myTodos();
      return (current) => ({ ...current, todos });
    },
    now
  );
}

/** For iCal: while it shows `from` to `to`, those days' events and the to-dos are read, and again when the tab comes back. */
export function useCalendarRefresh(account: string | null, from: string, to: string) {
  useEffect(() => {
    const fetch = (now = false) => {
      void readEvents(account, from, to, { now });
      void readTodos(account, { now });
    };
    fetch();
    if (!account) return;
    const onVisible = () => document.visibilityState === 'visible' && fetch();
    const onOther = () => fetch(true);
    document.addEventListener('visibilitychange', onVisible);
    otherTabs.add(onOther);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      otherTabs.delete(onOther);
    };
  }, [account, from, to]);
}

// ---------- Changing ----------

/** The member's other tabs: told of each change, they read again at once, so two windows side by side agree. */
const otherTabs = new Set<() => void>();
const tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('os-ical');
if (tabs) tabs.onmessage = ({ data }) => data?.account && data.account === mine.account && otherTabs.forEach((read) => read());

/** Runs a change, counting it as a write both ways, so no read from before it lands after, and tells the other tabs. */
async function writing<T>(write: () => Promise<T>): Promise<T> {
  writes++;
  try {
    return await write();
  } finally {
    writes++;
    freshAt.clear();
    tabs?.postMessage({ account: mine.account });
  }
}

// ---------- Saving in turn ----------

/** Each item's latest save on this page: a change made while one is saving waits for it. */
const turns = new Map<string, Promise<unknown>>();
/** The version each of this page's saves moved an item to, by `id@version` it was made from. */
const moved = new Map<string, number>();

/** The version a change made over `version` of an item names: past this page's own saves since. */
function baseOf(id: string, version: number) {
  let base = version;
  for (let next = moved.get(`${id}@${base}`); next !== undefined; next = moved.get(`${id}@${base}`)) base = next;
  return base;
}

/** Saves an item after its saves already going, naming the version it was made from. */
function inTurn<T extends { version: number }>(id: string, version: number, save: (version: number) => Promise<T>): Promise<T> {
  const turn = (turns.get(id) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const base = baseOf(id, version);
      const saved = await save(base);
      moved.set(`${id}@${base}`, saved.version);
      return saved;
    });
  turns.set(id, turn);
  void turn.catch(() => {}).finally(() => turns.get(id) === turn && turns.delete(id));
  return turn;
}

/** Whether `turn` is still the item's latest save: no change made since waits behind it. */
const latestTurn = (id: string, turn: Promise<unknown>) => (turns.get(id) ?? turn) === turn;

const isConflict = (error: unknown) => error instanceof SocialError && error.reason === 'conflict';

/** After a conflict: what was saved elsewhere, read now, here and in iCal's open views. */
function readAgain(day: string | null) {
  const account = mine.account;
  otherTabs.forEach((read) => read());
  return day ? readEvents(account, day, day, { now: true }) : readTodos(account, { now: true });
}

const withEvent = (event: CalendarEvent) => (mine = { ...mine, events: [...mine.events.filter((e) => e.id !== event.id), event] });
const withTodo = (todo: Todo) => (mine = { ...mine, todos: [...mine.todos.filter((t) => t.id !== todo.id), todo] });

/** Adds an event of the member's own. */
export async function addEvent(draft: Omit<EventDraft, 'id'>): Promise<CalendarEvent> {
  if (mine.events.length >= EVENT_MOST) throw new Error(`Your calendar holds ${EVENT_MOST} events already. Delete some first.`);
  const made = await writing(async () => (await database()).saveEvent(draft));
  withEvent(made);
  changed();
  return made;
}

/**
 * Changes an event: shown at once, saved after; refused, it goes back to
 * what the database has (read again when it was saved elsewhere since:
 * a 'conflict').
 */
export async function changeEvent(event: CalendarEvent): Promise<void> {
  const was = mine.events.find((e) => e.id === event.id);
  withEvent(event);
  changed();
  const turn = inTurn(event.id, event.version, (version) => writing(async () => (await database()).saveEvent({ ...event, version })));
  try {
    const saved = await turn;
    // A change made since shows already, and saves next.
    if (!latestTurn(event.id, turn)) return;
    withEvent(saved);
    changed();
  } catch (error) {
    if (was) withEvent(was);
    changed();
    if (isConflict(error)) await readAgain(was?.day ?? event.day);
    throw error;
  }
}

export async function removeEvent(id: string): Promise<void> {
  await writing(async () => (await database()).removeEvent(id));
  mine = { ...mine, events: mine.events.filter((e) => e.id !== id) };
  changed();
}

/** Adds a to-do of the member's own. */
export async function addTodo(draft: Omit<TodoDraft, 'id'>): Promise<Todo> {
  if (mine.todos.length >= TODO_MOST) throw new Error(`You have ${TODO_MOST} to-dos already. Delete some you’ve done first.`);
  const made = await writing(async () => (await database()).saveTodo(draft));
  withTodo(made);
  changed();
  return made;
}

/** Changes a to-do (ticked, renamed, its priority or when it's due), as changeEvent does an event. */
export async function changeTodo(todo: Todo): Promise<void> {
  const was = mine.todos.find((t) => t.id === todo.id);
  withTodo(todo);
  changed();
  const { id, title, calendar, priority, due, done } = todo;
  const turn = inTurn(id, todo.version, (version) => writing(async () => (await database()).saveTodo({ id, version, title, calendar, priority, due, done })));
  try {
    const saved = await turn;
    if (!latestTurn(id, turn)) return;
    withTodo(saved);
    changed();
  } catch (error) {
    if (was) withTodo(was);
    changed();
    if (isConflict(error)) await readAgain(null);
    throw error;
  }
}

export async function removeTodo(id: string): Promise<void> {
  await writing(async () => (await database()).removeTodo(id));
  mine = { ...mine, todos: mine.todos.filter((t) => t.id !== id) };
  changed();
}
