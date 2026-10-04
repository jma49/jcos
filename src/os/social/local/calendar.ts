// A member's own calendar in this browser, each account's apart, with the
// database's rules: its checks, event_limit and todo_limit, and a change
// from an older version refused. Events and to-dos kept before there were
// versions count as version 1.

import { loadJSON, saveJSON } from '../../core/storage';
import { CALENDARS, type CalendarEvent, type CalendarSocial, type Todo } from '../calendar';
import { changedElsewhere, SocialError } from '../errors';
import type { LocalContext } from './context';
import { LOCAL_LIMITS } from './limits';

/** Every member's own calendar, by account id. */
const CALENDAR_KEY = 'os-dev-calendar';

type StoredCalendar = { events: CalendarEvent[]; todos: Todo[] };

/** The database's checks on an event's or a to-do's title and calendar, and an event's times. */
const checkEntry = (e: { title: string; calendar: string; starts?: number | null; ends?: number | null; priority?: number }) => {
  const titled = e.title.length >= 1 && e.title.length <= 200 && e.title === e.title.trim() && !/[\u0000-\u001f\u007f]/.test(e.title);
  const timed =
    (e.starts == null && e.ends == null) ||
    (e.starts != null && e.ends != null && e.starts >= 0 && e.starts <= 1439 && e.ends >= 1 && e.ends <= 1440 && e.ends > e.starts);
  const ranked = e.priority === undefined || (Number.isInteger(e.priority) && e.priority >= 0 && e.priority <= 3);
  if (!titled || !timed || !ranked || !(CALENDARS as readonly string[]).includes(e.calendar)) {
    throw new SocialError('invalid', 'A title is one line of 200 characters at most, and an event ends after it starts.');
  }
};

export function localCalendar({ account, member }: LocalContext): CalendarSocial {
  /** Changes the member's stored calendar from what's stored now; a refusal thrown by `change` stores nothing. */
  const changeCalendar = <T,>(change: (mine: StoredCalendar) => T): T => {
    const all = loadJSON<Record<string, StoredCalendar>>(CALENDAR_KEY, {});
    const mine = all[member().id] ?? { events: [], todos: [] };
    const result = change(mine);
    saveJSON(CALENDAR_KEY, { ...all, [member().id]: mine });
    return result;
  };
  const calendarOf = () => {
    const current = account();
    return current ? (loadJSON<Record<string, StoredCalendar>>(CALENDAR_KEY, {})[current.id] ?? { events: [], todos: [] }) : null;
  };

  return {
    async myEvents(from, to) {
      return (calendarOf()?.events ?? []).filter((e) => e.day >= from && e.day <= to).map((e) => ({ ...e, version: e.version ?? 1 }));
    },
    async myTodos() {
      return (calendarOf()?.todos ?? []).map((t) => ({ ...t, version: t.version ?? 1 }));
    },
    // A change names the version it was made from, as the database checks.
    async saveEvent({ id, version, ...fields }) {
      checkEntry(fields);
      return changeCalendar((mine) => {
        if (!id) {
          if (mine.events.length >= LOCAL_LIMITS.events) throw new SocialError('limit', `Your calendar holds ${LOCAL_LIMITS.events} events already. Delete some first.`);
          const made: CalendarEvent = { id: crypto.randomUUID(), ...fields, version: 1 };
          mine.events.push(made);
          return made;
        }
        const at = mine.events.findIndex((e) => e.id === id);
        const was = mine.events[at];
        if (at < 0 || (was.version ?? 1) !== version) throw changedElsewhere();
        mine.events[at] = { ...was, ...fields, version: (was.version ?? 1) + 1 };
        return mine.events[at];
      });
    },
    async removeEvent(id) {
      changeCalendar((mine) => {
        mine.events = mine.events.filter((e) => e.id !== id);
      });
    },
    async saveTodo({ id, version, ...fields }) {
      checkEntry(fields);
      return changeCalendar((mine) => {
        const now = new Date().toISOString();
        if (!id) {
          if (mine.todos.length >= LOCAL_LIMITS.todos) throw new SocialError('limit', `You have ${LOCAL_LIMITS.todos} to-dos already. Delete some you’ve done first.`);
          const made: Todo = { id: crypto.randomUUID(), ...fields, doneAt: fields.done ? now : null, created: now, version: 1 };
          mine.todos.push(made);
          return made;
        }
        const at = mine.todos.findIndex((t) => t.id === id);
        const was = mine.todos[at];
        if (at < 0 || (was.version ?? 1) !== version) throw changedElsewhere();
        mine.todos[at] = { ...was, ...fields, doneAt: !fields.done ? null : was.done ? was.doneAt : now, version: (was.version ?? 1) + 1 };
        return mine.todos[at];
      });
    },
    async removeTodo(id) {
      changeCalendar((mine) => {
        mine.todos = mine.todos.filter((t) => t.id !== id);
      });
    }
  };
}
