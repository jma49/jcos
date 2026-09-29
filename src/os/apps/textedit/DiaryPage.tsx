import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AboutIcon } from '../../core/icons';
import { useWindows } from '../../core/store';
import type { WindowState } from '../../core/types';
import {
  deleteEntry,
  diaryOf,
  draftOf,
  dropDraft,
  homeNow,
  keepDraft,
  latest,
  readHome,
  saveEntry,
  today,
  useHome,
  type DiaryEntry
} from '../../home/home';
import { Alert } from '../../shell/Alert';
import { SocialError } from '../../social/types';
import { useAutosave } from './useAutosave';
import { useFileMenu } from './useFileMenu';

// A year of Jincheng's diary in TextEdit, as "Diary 2026.rtf": the days
// newest first, each under its date in grey, and each day's entries in
// the order they were written. This year's has today at the top, with a
// line to write a new entry on. Every entry is saved by itself as it's
// typed; one emptied and left is taken out. Only the owner reads it.

/** "Monday, September 28, 2026", for a diary day. */
const dayName = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

interface Trouble {
  message: string;
  detail: string;
  /** Takes the copy saved somewhere else. */
  revert?: () => void;
  /** Saves this one over it, or tries again. */
  retry: () => void;
  retryLabel: string;
}

export function DiaryPage({ win, year, owner }: { win: WindowState; year: number; owner: boolean }) {
  const { diary } = useHome();
  const [checked, setChecked] = useState(false);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  // Today's lines to write new entries on. An entry first saved from one
  // stays on that line (claimed, so it isn't shown twice), which keeps the
  // caret where it is, and a fresh line follows.
  const [lines, setLines] = useState(() => [`line-${Date.now()}`]);
  const claimed = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    void readHome(owner).then(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, [owner]);

  useEffect(() => {
    useWindows.getState().setTitle(win.id, `Diary ${year}.rtf`);
  }, [win.id, year]);

  useFileMenu(win, owner, {});

  if (!owner) {
    return (
      <div className="os-app os-textedit">
        {checked && (
          <div className="os-textedit-missing">
            <p>This is Jincheng’s diary.</p>
            <p>Only Jincheng can open it.</p>
          </div>
        )}
      </div>
    );
  }

  const now = today();
  const thisYear = now.startsWith(`${year}-`);
  const days = diaryOf(diary, year);
  if (thisYear && days[0]?.day !== now) days.unshift({ day: now, entries: [] });

  // Claimed before the diary changes, so the entry never shows on a line of its own for a moment.
  const created = (id: string) => {
    claimed.current.add(id);
    setLines((l) => [...l, `line-${Date.now()}-${l.length}`]);
  };

  return (
    <div className="os-app os-textedit">
      <div className="os-scroll os-textedit-page os-textedit-diary">
        {days.length === 0 && <p className="os-textedit-empty">Nothing was written in {year}.</p>}
        {days.map(({ day, entries }) => (
          <section key={day} aria-label={dayName(day)}>
            <h2>{dayName(day)}</h2>
            {entries
              .filter((entry) => !claimed.current.has(entry.id))
              .map((entry) => (
                <EntryEditor key={entry.id} day={day} entry={entry} onTrouble={setTrouble} />
              ))}
            {day === now &&
              lines.map((line, i) => (
                <EntryEditor
                  key={line}
                  day={day}
                  placeholder={i === lines.length - 1 ? (i ? 'And then?' : 'What happened today?') : undefined}
                  onCreated={created}
                  onTrouble={setTrouble}
                />
              ))}
          </section>
        ))}
      </div>
      {trouble && (
        <Alert
          Icon={AboutIcon}
          message={trouble.message}
          detail={trouble.detail}
          other={trouble.revert ? { label: 'Revert', action: () => (trouble.revert?.(), setTrouble(null)) } : undefined}
          onCancel={() => setTrouble(null)}
          confirm={trouble.retryLabel}
          onConfirm={() => {
            trouble.retry();
            setTrouble(null);
          }}
        />
      )}
    </div>
  );
}

/** One entry of the diary as a line of the page that grows with what's typed; with no entry, a new one's line. */
function EntryEditor({
  day,
  entry,
  placeholder,
  onCreated,
  onTrouble
}: {
  day: string;
  entry?: DiaryEntry;
  placeholder?: string;
  onCreated?: (id: string) => void;
  onTrouble: (trouble: Trouble) => void;
}) {
  const [newKey] = useState(() => `entry:new:${day}`);
  const idNow = useRef(entry?.id);
  const key = () => (idNow.current ? `entry:${idNow.current}` : newKey);
  const [text, setText] = useState(() => draftOf(key())?.body ?? entry?.body ?? '');
  const typed = useRef(text);
  const base = useRef(entry ? (draftOf(key())?.version ?? entry.version) : undefined);
  const [dirty, setDirty] = useState(() => !!draftOf(key()) && draftOf(key())?.body !== entry?.body);
  const box = useRef<HTMLTextAreaElement>(null);

  // Saved somewhere else while nothing is typed here: the newer copy shows.
  useEffect(() => {
    if (!entry || dirty || base.current === entry.version) return;
    base.current = entry.version;
    typed.current = entry.body;
    setText(entry.body);
  }, [entry, dirty]);

  // The line is as tall as what's on it.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const saver = useAutosave(async () => {
    const body = typed.current;
    // An emptied entry is taken out once it's left (see below), not while it's being retyped.
    if (!body.trim()) return;
    try {
      if (!idNow.current) {
        const made = await saveEntry({ day, body }, (entry) => {
          // The draft of a new line is the day's: gone before the next new line starts from it.
          dropDraft(newKey);
          onCreated?.(entry.id);
        });
        idNow.current = made.id;
        base.current = made.version;
      } else {
        const saved = await saveEntry({ id: idNow.current, version: base.current, day, body });
        base.current = saved.version;
      }
      if (typed.current === body) {
        setDirty(false);
        dropDraft(key());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof SocialError && error.reason === 'conflict') {
        await latest(true);
        const newer = homeNow().diary.find((e) => e.id === idNow.current);
        onTrouble({
          message: newer ? 'This entry was changed somewhere else since you opened the diary.' : 'This entry was taken out somewhere else.',
          detail: newer ? 'Revert to see that copy, or save this one over it.' : 'Save it again to keep what’s here.',
          revert: newer
            ? () => {
                saver.cancel();
                typed.current = newer.body;
                base.current = newer.version;
                setText(newer.body);
                setDirty(false);
                dropDraft(key());
              }
            : undefined,
          retry: () => {
            if (newer) base.current = newer.version;
            else idNow.current = undefined;
            void saver.now();
          },
          retryLabel: newer ? 'Save Anyway' : 'Save Again'
        });
      } else {
        onTrouble({ message: 'This entry couldn’t be saved.', detail: `${message} What you typed is kept in this browser until it is.`, retry: () => void saver.now(), retryLabel: 'Try Again' });
      }
    }
  });

  return (
    <textarea
      ref={box}
      className="os-textedit-entry"
      rows={1}
      value={text}
      placeholder={placeholder}
      aria-label={entry ? 'Diary entry' : 'New diary entry'}
      onChange={(e) => {
        typed.current = e.target.value;
        setText(e.target.value);
        setDirty(true);
        keepDraft(key(), { body: e.target.value, version: base.current ?? 0 });
        saver.soon();
      }}
      onBlur={() => {
        // Emptied and left: the entry is taken out.
        if (typed.current.trim() || !idNow.current) return;
        const id = idNow.current;
        saver.cancel();
        dropDraft(key());
        void deleteEntry(id).catch((error) =>
          onTrouble({
            message: 'This entry couldn’t be taken out.',
            detail: error instanceof Error ? error.message : String(error),
            retry: () => void deleteEntry(id),
            retryLabel: 'Try Again'
          })
        );
      }}
    />
  );
}
