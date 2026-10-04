// iCal's data: a member's own events and to-dos, which only they read.
// The Supabase side is supabase/calendar.ts, the stand-in's
// local/calendar.ts; iCal uses them through apps/ical/calendar.ts.

/** The calendars iCal keeps events and to-dos in, as Tiger's started with (the database's check). */
export const CALENDARS = ['home', 'work'] as const;
export type CalendarName = (typeof CALENDARS)[number];

/** One of a member's own events, which only they read. */
export interface CalendarEvent {
  id: string;
  /** One line, 200 characters at most. */
  title: string;
  calendar: CalendarName;
  /** The day it's on (YYYY-MM-DD), where the member is. */
  day: string;
  /** When it starts and ends, in minutes after midnight; both null for all day. */
  starts: number | null;
  ends: number | null;
  notes: string;
  /** Counts saves (the database's): a change names the version it was made from. */
  version: number;
}

/** A new event (no `id`), or a change to one made from `version`. */
export type EventDraft = Omit<CalendarEvent, 'id' | 'version'> & { id?: string; version?: number };

/** One of a member's own to-dos. */
export interface Todo {
  id: string;
  title: string;
  calendar: CalendarName;
  /** 0 none, 1 low, 2 medium, 3 high. */
  priority: number;
  /** The day it's due (YYYY-MM-DD), or null. */
  due: string | null;
  done: boolean;
  /** When it was done (the database's), or null. */
  doneAt: string | null;
  created: string;
  /** Counts saves (the database's), as an event's does. */
  version: number;
}

/** A new to-do (no `id`), or a change to one made from `version`. */
export type TodoDraft = Pick<Todo, 'title' | 'calendar' | 'priority' | 'due' | 'done'> & { id?: string; version?: number };

export interface CalendarSocial {
  /** The signed-in member's own events on the days `from` to `to` (YYYY-MM-DD, both kept); none signed out. */
  myEvents: (from: string, to: string) => Promise<CalendarEvent[]>;
  /** The signed-in member's own to-dos; none signed out. */
  myTodos: () => Promise<Todo[]>;
  /**
   * Adds one of the member's events (no `id`), or changes it from
   * `version`; refused ('conflict') if it was saved or deleted elsewhere
   * since.
   */
  saveEvent: (event: EventDraft) => Promise<CalendarEvent>;
  removeEvent: (id: string) => Promise<void>;
  /** Adds one of the member's to-dos (no `id`), or changes it, as saveEvent does an event. */
  saveTodo: (todo: TodoDraft) => Promise<Todo>;
  removeTodo: (id: string) => Promise<void>;
}
