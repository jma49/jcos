import { useEffect, useRef, useState } from 'react';
import { pngIcon } from '../../core/icons';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { useFocusedId, useWindows } from '../../core/store';
import { Alert } from '../../shell/Alert';
import { Drawer } from '../../shell/drawer';
import { useAccount } from '../../social/account';
import { CALENDARS, type CalendarName } from '../../social/types';
import {
  addDays,
  addEvent,
  addMonths,
  addTodo,
  changeEvent,
  changeTodo,
  dateOf,
  dayEvents,
  monthGrid,
  removeEvent,
  removeTodo,
  shortTime,
  timeName,
  today,
  useCalendar,
  useCalendarRefresh,
  type CalendarEvent,
  type Todo
} from './calendar';
import { DayInfo, EventInfo, longDay } from './EventInfo';
import { CALENDAR_NAMES, Todos } from './Todos';

// iCal, as in Tiger: a member's own days and to-dos, which only they see
// (calendar.ts). Brushed metal round the calendars (Home and Work, each
// shown or hidden), the month and To Do; the info drawer for the event
// chosen. A double-click on a day makes an event there; File › New Event
// (⌥N) and New To Do (⌥K) too, as ⌘N and ⌘K were (the browser keeps
// those). The arrow keys move the day chosen, Delete deletes its event
// (asked first), Escape closes the drawer. Narrow, it shows the month or
// To Do, chosen at the top.

const ICalIcon = pngIcon('ical');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** How many events a day of the month lists before "more". */
const DAY_ROOM = 3;

/** This device's choices: which calendars show, and whether To Do does. */
const SHOWN_KEY = 'os-ical-shown';
const TODOS_KEY = 'os-ical-todos';
const loadShown = (): CalendarName[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? 'null');
    return Array.isArray(stored) ? CALENDARS.filter((c) => stored.includes(c)) : [...CALENDARS];
  } catch {
    return [...CALENDARS];
  }
};
const remember = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const monthName = (month: string) => dateOf(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function ICal({ win }: AppProps) {
  const account = useAccount((s) => s.account?.id ?? null);
  const ready = useAccount((s) => s.ready);
  if (!ready) return <div className="os-app os-ical" />;
  if (!account) {
    return (
      <div className="os-app os-ical">
        <div className="os-ical-out">
          <ICalIcon size={64} />
          <p>iCal keeps your own days and to-dos, for your eyes only.</p>
          <button type="button" className="os-button" onClick={() => launch('account', { props: { then: 'ical' } })}>
            Sign In to Keep Some…
          </button>
        </div>
      </div>
    );
  }
  return <Calendar win={win} account={account} />;
}

function Calendar({ win, account }: AppProps & { account: string }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [day, setDay] = useState(today);
  const [chosen, setChosen] = useState<string | null>(null);
  /** The event just made, whose title is chosen in the drawer to be typed over. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [shown, setShown] = useState(loadShown);
  const [todosShown, setTodosShown] = useState(() => {
    try {
      return localStorage.getItem(TODOS_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [pane, setPane] = useState<'month' | 'todos'>('month');
  const [editingTodo, setEditingTodo] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const front = useFocusedId() === win.id;

  const grid = monthGrid(month);
  useCalendarRefresh(account, grid[0], grid[41]);
  const { events, todos } = useCalendar();
  const visible = events.filter((e) => shown.includes(e.calendar));
  const chosenEvent = events.find((e) => e.id === chosen) ?? null;

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);
  const say = (error: unknown) => setNote(error instanceof Error ? error.message : 'That didn’t work. Try again.');

  /** Chooses a day, showing its month. */
  const goTo = (d: string) => {
    setDay(d);
    setMonth(d.slice(0, 7));
  };

  const newEvent = async (on = day) => {
    try {
      const made = await addEvent({ title: 'New Event', calendar: shown[0] ?? 'home', day: on, starts: null, ends: null, notes: '' });
      if (!shown.includes(made.calendar)) setShown((s) => [...s, made.calendar]);
      goTo(on);
      setChosen(made.id);
      setFresh(made.id);
      setInfo(true);
    } catch (error) {
      say(error);
    }
  };

  const newTodo = async () => {
    try {
      const made = await addTodo({ title: 'New To Do', calendar: shown[0] ?? 'home', priority: 0, due: null, done: false });
      setTodosShown(true);
      setPane('todos');
      setEditingTodo(made.id);
    } catch (error) {
      say(error);
    }
  };

  const change = (e: CalendarEvent) => void changeEvent(e).catch(say);
  const changeT = (t: Todo) => void changeTodo(t).catch(say);
  const deleteEvent = (e: CalendarEvent) => {
    setDeleting(null);
    if (chosen === e.id) setChosen(null);
    void removeEvent(e.id).catch(say);
  };

  const toggleTodos = () =>
    setTodosShown((s) => {
      remember(TODOS_KEY, !s);
      return !s;
    });

  // The menu bar's File and View while iCal is in front, and the keys.
  const commands = useRef({ newEvent, newTodo, toggleTodos, goTo, day, chosenEvent, info });
  useEffect(() => {
    commands.current = { newEvent, newTodo, toggleTodos, goTo, day, chosenEvent, info };
  });
  useEffect(() => {
    const { setMenus, close } = useWindows.getState();
    const run = (act: (c: typeof commands.current) => void) => () => act(commands.current);
    setMenus(win.id, {
      File: [
        { label: 'New Event', shortcut: '⌥N', action: run((c) => void c.newEvent()) },
        { label: 'New To Do', shortcut: '⌥K', action: run((c) => void c.newTodo()) },
        { label: '', divider: true },
        { label: 'Close Window', shortcut: '⌥W', action: () => close(win.id) }
      ],
      View: [
        { label: 'Go to Today', action: run((c) => c.goTo(today())) },
        { label: 'Previous Month', action: () => setMonth((m) => addMonths(m, -1)) },
        { label: 'Next Month', action: () => setMonth((m) => addMonths(m, 1)) },
        { label: '', divider: true },
        { label: todosShown ? 'Hide To Do List' : 'Show To Do List', action: run((c) => c.toggleTodos()) }
      ]
    });
    return () => setMenus(win.id, undefined);
  }, [win.id, todosShown]);

  useEffect(() => {
    if (!front) return;
    const onKey = (e: KeyboardEvent) => {
      if (useWindows.getState().exposeOpen) return;
      const c = commands.current;
      // e.code: ⌥ changes e.key on a Mac.
      if (e.altKey && !e.metaKey && (e.code === 'KeyN' || e.code === 'KeyK')) {
        e.preventDefault();
        void (e.code === 'KeyN' ? c.newEvent() : c.newTodo());
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) {
        e.preventDefault();
        c.goTo(addDays(c.day, step));
        setChosen(null);
      } else if (e.key === 'Escape' && c.info) {
        setInfo(false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && c.chosenEvent) {
        e.preventDefault();
        setDeleting(c.chosenEvent);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [front]);

  const now = today();

  return (
    <div className="os-app os-ical">
      <div className="os-ical-frame">
        <div className="os-ical" style={{ height: '100%' }}>
          <div className="os-ical-top">
            <div>
              <button type="button" className="os-button" onClick={() => goTo(now)}>
                Today
              </button>
            </div>
            <h2>
              <button type="button" className="os-button os-ical-arrow" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
                ◀
              </button>
              <span aria-live="polite">{monthName(month)}</span>
              <button type="button" className="os-button os-ical-arrow" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
                ▶
              </button>
            </h2>
            <div className="os-ical-top-end">
              <div className="os-segmented os-ical-switch" role="group" aria-label="Show">
                <button type="button" aria-pressed={pane === 'month'} onClick={() => setPane('month')}>
                  Month
                </button>
                <button type="button" aria-pressed={pane === 'todos'} onClick={() => setPane('todos')}>
                  To Do
                </button>
              </div>
            </div>
          </div>

          <div className="os-ical-body" data-todos={todosShown ? undefined : 'hidden'} data-pane={pane}>
            <aside className="os-ical-pane os-ical-side" aria-label="Calendars">
              <h3>Calendars</h3>
              <ul className="os-ical-calendars">
                {CALENDARS.map((c) => (
                  <li key={c} data-calendar={c}>
                    <label>
                      <input
                        type="checkbox"
                        checked={shown.includes(c)}
                        onChange={() =>
                          setShown((s) => {
                            const next = s.includes(c) ? s.filter((x) => x !== c) : CALENDARS.filter((x) => x === c || s.includes(x));
                            remember(SHOWN_KEY, next);
                            return next;
                          })
                        }
                      />
                      <span className="os-ical-swatch" aria-hidden="true" />
                      {CALENDAR_NAMES[c]}
                    </label>
                  </li>
                ))}
              </ul>
              <MiniMonth month={month} day={day} onPick={(d) => (goTo(d), setChosen(null))} onMonth={setMonth} />
            </aside>

            <section className="os-ical-pane os-ical-month-pane" aria-label={monthName(month)}>
              <div className="os-ical-month" role="grid" aria-label={monthName(month)}>
                <div className="os-ical-weekdays" role="row">
                  {WEEKDAYS.map((w) => (
                    <span key={w} role="columnheader">
                      {w}
                    </span>
                  ))}
                </div>
                {Array.from({ length: 6 }, (_, week) => (
                  <div key={week} className="os-ical-week" role="row">
                    {grid.slice(week * 7, week * 7 + 7).map((d) => {
                      const list = dayEvents(visible, d);
                      return (
                        <div
                          key={d}
                          className="os-ical-day"
                          role="gridcell"
                          aria-label={longDay(d)}
                          aria-selected={d === day}
                          data-other={d.slice(0, 7) !== month || undefined}
                          data-today={d === now || undefined}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('.os-ical-event')) return;
                            setDay(d);
                            setChosen(null);
                          }}
                          onDoubleClick={(e) => !(e.target as HTMLElement).closest('.os-ical-event, .os-ical-more') && void newEvent(d)}
                        >
                          <span className="os-ical-date">{Number(d.slice(8))}</span>
                          {list.slice(0, DAY_ROOM).map((ev) => (
                            <button
                              key={ev.id}
                              type="button"
                              className="os-ical-event"
                              data-calendar={ev.calendar}
                              data-all-day={ev.starts === null || undefined}
                              aria-pressed={ev.id === chosen}
                              title={ev.starts !== null && ev.ends !== null ? `${timeName(ev.starts)}–${timeName(ev.ends)} ${ev.title}` : ev.title}
                              onClick={() => {
                                setDay(d);
                                setChosen(ev.id);
                                setFresh(null);
                              }}
                              onDoubleClick={() => setInfo(true)}
                            >
                              <span>
                                {ev.starts !== null && `${shortTime(ev.starts)} `}
                                {ev.title}
                              </span>
                            </button>
                          ))}
                          {list.length > DAY_ROOM && (
                            <button
                              type="button"
                              className="os-ical-more"
                              onClick={() => {
                                setDay(d);
                                setChosen(null);
                                setInfo(true);
                              }}
                            >
                              {list.length - DAY_ROOM} more…
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>

            {todosShown && (
              <section className="os-ical-pane os-ical-todo-pane" aria-label="To Do">
                <h3>To Do Items</h3>
                <Todos
                  todos={todos.filter((t) => shown.includes(t.calendar))}
                  editing={editingTodo}
                  onEdit={setEditingTodo}
                  onChange={changeT}
                  onRemove={(t) => void removeTodo(t.id).catch(say)}
                />
                <div className="os-ical-todos-foot">
                  <span>{todos.filter((t) => !t.done).length} to do</span>
                  <button type="button" className="os-button" aria-label="New To Do" title="New To Do (⌥K)" onClick={() => void newTodo()}>
                    +
                  </button>
                </div>
              </section>
            )}
          </div>

          <div className="os-ical-bottom">
            {note && (
              <p className="os-ical-note" role="status">
                {note}
              </p>
            )}
            <button type="button" className="os-button" aria-label="New Event" title="New Event (⌥N)" onClick={() => void newEvent()}>
              +
            </button>
            <button type="button" className="os-button" aria-pressed={info} onClick={() => setInfo((i) => !i)} title="Show or hide the info drawer">
              i
            </button>
            <button type="button" className="os-button os-ical-todo-toggle" aria-pressed={todosShown} onClick={toggleTodos}>
              To Do
            </button>
          </div>
        </div>
      </div>

      <Drawer open={info} label="Info" width={230}>
        {chosenEvent ? (
          <EventInfo event={chosenEvent} fresh={fresh === chosenEvent.id} onChange={change} onDelete={setDeleting} />
        ) : (
          <DayInfo
            day={day}
            events={visible}
            onChoose={(e) => {
              setChosen(e.id);
              setFresh(null);
            }}
            onNew={() => void newEvent()}
          />
        )}
      </Drawer>

      {deleting && (
        <Alert
          Icon={ICalIcon}
          message={`Are you sure you want to delete the event “${deleting.title}”?`}
          detail="You can’t undo this action."
          confirm="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteEvent(deleting)}
        />
      )}
    </div>
  );
}

/** The little month under the calendars: a day picked there is shown in the big one. */
function MiniMonth({ month, day, onPick, onMonth }: { month: string; day: string; onPick: (day: string) => void; onMonth: (month: string) => void }) {
  const grid = monthGrid(month);
  const now = today();
  return (
    <div className="os-ical-mini">
      <p className="os-ical-mini-title">
        <button type="button" className="os-ical-arrow" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
          ‹
        </button>{' '}
        {monthName(month)}{' '}
        <button type="button" className="os-ical-arrow" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          ›
        </button>
      </p>
      <div className="os-ical-mini-grid">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w[0]}</span>
        ))}
        {grid.map((d) => (
          <button
            key={d}
            type="button"
            aria-label={longDay(d)}
            aria-current={d === day ? 'date' : undefined}
            data-other={d.slice(0, 7) !== month || undefined}
            data-today={d === now || undefined}
            onClick={() => onPick(d)}
          >
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}
