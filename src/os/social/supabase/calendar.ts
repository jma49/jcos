// A member's own calendar in public.events and public.todos: row-level
// security gives each member theirs alone, and a change names the version
// it was made from, as a document's does.

import type { Tables } from '../../../lib/database.types';
import type { CalendarEvent, CalendarName, CalendarSocial, Todo } from '../calendar';
import { changedElsewhere, SocialError } from '../errors';
import { refusal, type SupabaseContext } from './context';

/** The columns of a member's events and to-dos, as they read them. */
const EVENT_COLUMNS = 'id,title,calendar,day,starts,ends,notes,version';
const TODO_COLUMNS = 'id,title,calendar,priority,due,done,done_at,created_at,version';

// The calendar is text in the generated types; the tables' check holds it
// to CALENDARS, so it's narrowed here.
type EventRow = Pick<Tables<'events'>, 'id' | 'title' | 'calendar' | 'day' | 'starts' | 'ends' | 'notes' | 'version'>;
type TodoRow = Pick<Tables<'todos'>, 'id' | 'title' | 'calendar' | 'priority' | 'due' | 'done' | 'done_at' | 'created_at' | 'version'>;

const eventOf = (row: EventRow): CalendarEvent => ({
  id: row.id,
  title: row.title,
  calendar: row.calendar as CalendarName,
  day: row.day,
  starts: row.starts,
  ends: row.ends,
  notes: row.notes,
  version: row.version
});

const todoOf = (row: TodoRow): Todo => ({
  id: row.id,
  title: row.title,
  calendar: row.calendar as CalendarName,
  priority: row.priority,
  due: row.due,
  done: row.done,
  doneAt: row.done_at,
  created: row.created_at,
  version: row.version
});

/** An event or a to-do the database's checks refuse. */
const badEntry = () => new SocialError('invalid', 'A title is one line of 200 characters at most, and an event ends after it starts.');

export function supabaseCalendar({ client, account, member, ready }: SupabaseContext): CalendarSocial {
  return {
    async myEvents(from, to) {
      await ready;
      if (!account()) return [];
      const { data, error } = await client.from('events').select(EVENT_COLUMNS).gte('day', from).lte('day', to).order('day').order('starts', { nullsFirst: true });
      if (error) throw error;
      return (data ?? []).map(eventOf);
    },

    async myTodos() {
      await ready;
      if (!account()) return [];
      const { data, error } = await client.from('todos').select(TODO_COLUMNS).order('created_at');
      if (error) throw error;
      return (data ?? []).map(todoOf);
    },

    async saveEvent({ id, version, ...fields }) {
      member();
      const request = id
        ? client.from('events').update(fields).eq('id', id).eq('version', version ?? 0).select(EVENT_COLUMNS).maybeSingle()
        : client.from('events').insert(fields).select(EVENT_COLUMNS).single();
      const { data, error } = await request;
      if (error) throw error.code === '23514' ? badEntry() : refusal(error);
      if (!data) throw changedElsewhere();
      return eventOf(data);
    },

    async removeEvent(id) {
      member();
      const { error } = await client.from('events').delete().eq('id', id);
      if (error) throw refusal(error);
    },

    async saveTodo({ id, version, ...fields }) {
      member();
      const request = id
        ? client.from('todos').update(fields).eq('id', id).eq('version', version ?? 0).select(TODO_COLUMNS).maybeSingle()
        : client.from('todos').insert(fields).select(TODO_COLUMNS).single();
      const { data, error } = await request;
      if (error) throw error.code === '23514' ? badEntry() : refusal(error);
      if (!data) throw changedElsewhere();
      return todoOf(data);
    },

    async removeTodo(id) {
      member();
      const { error } = await client.from('todos').delete().eq('id', id);
      if (error) throw refusal(error);
    }
  };
}
