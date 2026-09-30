import { useEffect, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '../../shell/ContextMenu';
import { CALENDARS } from '../../social/types';
import { addDays, dateOf, today, todoOrder, type Todo } from './calendar';

// iCal's To Do list: ticked off, renamed with a click on the title, and
// the rest (priority, when it's due, which calendar, deleting it) from a
// right-click, as Tiger kept it. Undone first, the most urgent on top.

const PRIORITIES = ['None', 'Low', 'Medium', 'High'];
export const CALENDAR_NAMES = { home: 'Home', work: 'Work' } as const;

/** "Today", "Tomorrow", or "Oct 2", for when a to-do is due. */
function dueName(due: string) {
  const now = today();
  if (due === now) return 'Today';
  if (due === addDays(now, 1)) return 'Tomorrow';
  return dateOf(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Todos({
  todos,
  editing,
  onEdit,
  onChange,
  onRemove
}: {
  todos: Todo[];
  /** The to-do being renamed (a new one starts that way). */
  editing: string | null;
  onEdit: (id: string | null) => void;
  onChange: (todo: Todo) => void;
  onRemove: (todo: Todo) => void;
}) {
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; todo: Todo } | null>(null);
  const now = today();

  const itemsFor = (t: Todo): ContextMenuItem[] => [
    ...PRIORITIES.map((label, priority) => ({ label: `${label} Priority`, checked: t.priority === priority, action: () => onChange({ ...t, priority }) })),
    { divider: true, label: '' },
    { label: 'Due Today', checked: t.due === now, action: () => onChange({ ...t, due: now }) },
    { label: 'Due Tomorrow', checked: t.due === addDays(now, 1), action: () => onChange({ ...t, due: addDays(now, 1) }) },
    { label: 'Due in a Week', checked: t.due === addDays(now, 7), action: () => onChange({ ...t, due: addDays(now, 7) }) },
    { label: 'No Due Date', checked: t.due === null, action: () => onChange({ ...t, due: null }) },
    { divider: true, label: '' },
    ...CALENDARS.map((calendar) => ({ label: CALENDAR_NAMES[calendar], checked: t.calendar === calendar, action: () => onChange({ ...t, calendar }) })),
    { divider: true, label: '' },
    { label: 'Delete To Do', action: () => onRemove(t) }
  ];

  return (
    <>
      <ul className="os-ical-todos" aria-label="To Do Items">
        {todoOrder(todos).map((t) => (
          <li
            key={t.id}
            className="os-ical-todo"
            data-calendar={t.calendar}
            data-done={t.done || undefined}
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest('input[type="text"]')) return;
              e.preventDefault();
              setMenu({ at: { x: e.clientX, y: e.clientY }, todo: t });
            }}
          >
            <input type="checkbox" checked={t.done} aria-label={`Done: ${t.title}`} onChange={() => onChange({ ...t, done: !t.done })} />
            <span className="os-ical-priority" aria-label={t.priority ? `${PRIORITIES[t.priority]} priority` : undefined}>
              {'!'.repeat(t.priority)}
            </span>
            {editing === t.id ? (
              <TitleField todo={t} onDone={(title) => (onEdit(null), title && title !== t.title && onChange({ ...t, title }))} />
            ) : (
              <button type="button" className="os-ical-todo-title" onClick={() => onEdit(t.id)} title={t.title}>
                {t.title}
              </button>
            )}
            {t.due && (
              <span className="os-ical-due" data-late={(!t.done && t.due < now) || undefined}>
                {dueName(t.due)}
              </span>
            )}
          </li>
        ))}
      </ul>
      {menu && <ContextMenu at={menu.at} items={itemsFor(menu.todo)} onClose={() => setMenu(null)} label={menu.todo.title} />}
    </>
  );
}

/** A to-do's title being typed: Return or leaving keeps it, Escape takes it back. */
function TitleField({ todo, onDone }: { todo: Todo; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(todo.title);
  const field = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const done = (title: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(title);
  };
  return (
    <input
      ref={field}
      type="text"
      value={value}
      maxLength={200}
      aria-label="To do"
      onChange={(e) => setValue(e.target.value.replace(/[\r\n]+/g, ' '))}
      onBlur={() => done(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(value.trim() || null);
        else if (e.key === 'Escape') {
          e.stopPropagation();
          done(null);
        }
      }}
    />
  );
}
