import { useEffect, useRef, useState } from 'react';
import { CALENDARS } from '../../social/types';
import { dateOf, dayEvents, minutesOf, timeName, timeValue, type CalendarEvent } from './calendar';
import { CALENDAR_NAMES } from './Todos';

// iCal's info drawer: the event chosen, to rename, move, time and note, as
// Tiger's drawer had it; with none chosen, the day's events. A title or a
// note is kept when it's left (or with Return, for the title); the rest
// as it's changed.

/** "Wednesday, September 30, 2026". */
export const longDay = (day: string) => dateOf(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export function EventInfo({
  event,
  fresh,
  onChange,
  onDelete
}: {
  event: CalendarEvent;
  /** Just made: its title is chosen, to be typed over. */
  fresh: boolean;
  onChange: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [notes, setNotes] = useState(event.notes);
  const titleField = useRef<HTMLInputElement>(null);

  // Another event chosen, or this one changed elsewhere: the fields follow.
  useEffect(() => {
    setTitle(event.title);
    setNotes(event.notes);
  }, [event.id, event.title, event.notes]);

  useEffect(() => {
    if (!fresh) return;
    titleField.current?.focus();
    titleField.current?.select();
  }, [fresh, event.id]);

  const keepTitle = () => {
    const kept = title.replace(/\s+/g, ' ').trim();
    if (!kept) return setTitle(event.title);
    if (kept !== event.title) onChange({ ...event, title: kept });
  };
  const keepNotes = () => notes !== event.notes && onChange({ ...event, notes });

  const allDay = event.starts === null;
  const setTimes = (starts: number, ends: number) => onChange({ ...event, starts, ends: Math.min(1440, Math.max(ends, starts + 15)) });

  return (
    <div className="os-ical-info" data-calendar={event.calendar}>
      <label>
        Title
        <input
          ref={titleField}
          type="text"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={keepTitle}
          onKeyDown={(e) => e.key === 'Enter' && keepTitle()}
        />
      </label>
      <label className="os-ical-inline">
        <input type="checkbox" checked={allDay} onChange={() => onChange(allDay ? { ...event, starts: 540, ends: 600 } : { ...event, starts: null, ends: null })} />
        all-day
      </label>
      <div className="os-ical-times">
        <span>day</span>
        <input type="date" value={event.day} min="2000-01-01" max="2100-12-31" aria-label="Day" onChange={(e) => e.target.value && onChange({ ...event, day: e.target.value })} />
        {!allDay && event.starts !== null && event.ends !== null && (
          <>
            <span>from</span>
            <input
              type="time"
              step={300}
              value={timeValue(event.starts)}
              aria-label="Starts"
              onChange={(e) => {
                const starts = minutesOf(e.target.value);
                if (starts !== null && event.ends !== null) setTimes(starts, starts + (event.ends - (event.starts ?? starts)));
              }}
            />
            <span>to</span>
            <input
              type="time"
              step={300}
              value={timeValue(event.ends)}
              aria-label="Ends"
              onChange={(e) => {
                const ends = minutesOf(e.target.value);
                if (ends !== null && event.starts !== null) setTimes(event.starts, ends);
              }}
            />
          </>
        )}
      </div>
      <label>
        calendar
        <select value={event.calendar} onChange={(e) => onChange({ ...event, calendar: e.target.value as CalendarEvent['calendar'] })}>
          {CALENDARS.map((c) => (
            <option key={c} value={c}>
              {CALENDAR_NAMES[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        notes
        <textarea value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} onBlur={keepNotes} />
      </label>
      <button type="button" className="os-button" onClick={() => onDelete(event)}>
        Delete Event
      </button>
    </div>
  );
}

/** With no event chosen: the day's events, to choose from, and a way to add one. */
export function DayInfo({
  day,
  events,
  onChoose,
  onNew
}: {
  day: string;
  events: CalendarEvent[];
  onChoose: (event: CalendarEvent) => void;
  onNew: () => void;
}) {
  const list = dayEvents(events, day);
  return (
    <div className="os-ical-info">
      <h4>{longDay(day)}</h4>
      {list.length ? (
        <ul>
          {list.map((e) => (
            <li key={e.id}>
              <button type="button" className="os-ical-event" data-calendar={e.calendar} data-all-day={e.starts === null || undefined} onClick={() => onChoose(e)}>
                <span>
                  {e.starts !== null && `${timeName(e.starts)} `}
                  {e.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nothing on this day.</p>
      )}
      <button type="button" className="os-button" onClick={onNew}>
        New Event
      </button>
    </div>
  );
}
