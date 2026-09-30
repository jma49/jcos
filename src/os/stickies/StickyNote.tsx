import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { adoptStyles } from '../core/appStyles';
import { MENU_BAR_HEIGHT } from '../core/store';
import { useAutosave } from '../core/useAutosave';
import { ContextMenu, type ContextMenuItem } from '../shell/ContextMenu';
import { NOTE_COLORS, SocialError, STICKY_MAX, type NoteColor } from '../social/types';
import { draftOf, dropDraft, keepDraft, latest, myStickiesNow, placeSticky, removeSticky, writeSticky, type Sticky } from './mine';
import styles from './own-stickies.css?inline';

// One of a member's own stickies (mine.ts), as Tiger's Stickies drew a
// note. On the desktop (`placed`) it's where it was left: held by its
// strip to move it, by the corner to size it, rolled up with a
// double-click on the strip or the window shade. In Stickies › Yours it's
// a card in a row. What's typed is saved once the typing rests, and kept
// in the browser until it is; the close box takes it down, asking first
// if there's anything on it. A right-click gives its colours.

adoptStyles('own-stickies', styles);

const COLOR_NAMES: Record<NoteColor, string> = { yellow: 'Yellow', blue: 'Blue', green: 'Green', pink: 'Pink', purple: 'Purple', gray: 'Gray' };

/** A size a sticky may take (the database's checks). */
const clampSize = (width: number, height: number) => ({
  width: Math.round(Math.min(900, Math.max(120, width))),
  height: Math.round(Math.min(900, Math.max(60, height)))
});

/** Somewhere on the screen, under the menu bar, with at least its strip in reach. */
function onScreen(x: number, y: number, width: number) {
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  return {
    x: Math.round(Math.min(Math.max(0, x), Math.max(0, vw - Math.min(width, 80)))),
    y: Math.round(Math.min(Math.max(MENU_BAR_HEIGHT + 2, y), Math.max(MENU_BAR_HEIGHT + 2, vh - 40)))
  };
}

type Ask = { kind: 'remove' } | { kind: 'conflict' } | { kind: 'failed'; message: string };

export function StickyNote({
  sticky,
  placed = false,
  z,
  front = false,
  onFront,
  autoFocus = false
}: {
  sticky: Sticky;
  placed?: boolean;
  z?: number;
  front?: boolean;
  onFront?: () => void;
  /** Just put up: the caret goes in it. */
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(() => draftOf(sticky.id)?.body ?? sticky.body);
  const typed = useRef(text);
  const base = useRef(draftOf(sticky.id)?.version ?? sticky.version);
  const [dirty, setDirty] = useState(() => {
    const draft = draftOf(sticky.id);
    return !!draft && draft.body !== sticky.body;
  });
  const [ask, setAsk] = useState<Ask | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** Where it is while it's being moved or sized, before it's saved there. */
  const [live, setLive] = useState<Partial<Pick<Sticky, 'x' | 'y' | 'width' | 'height'>> | null>(null);
  const [dragging, setDragging] = useState(false);
  const page = useRef<HTMLTextAreaElement>(null);

  // Just put up: the caret goes in it (which it learns after it's first drawn).
  useEffect(() => {
    if (autoFocus) page.current?.focus();
  }, [autoFocus]);

  // Saved somewhere else while nothing is typed here: the newer copy shows.
  useEffect(() => {
    if (dirty || sticky.version === base.current) return;
    base.current = sticky.version;
    typed.current = sticky.body;
    setText(sticky.body);
  }, [sticky.version, sticky.body, dirty]);

  const saver = useAutosave(async () => {
    const body = typed.current;
    try {
      const saved = await writeSticky(sticky.id, body, base.current);
      base.current = saved.version;
      if (typed.current === body) {
        setDirty(false);
        dropDraft(sticky.id);
      }
    } catch (error) {
      if (error instanceof SocialError && error.reason === 'conflict') {
        await latest();
        // Taken down elsewhere, it's gone from here too; what was typed stays in the browser's drafts.
        if (myStickiesNow().some((s) => s.id === sticky.id)) setAsk({ kind: 'conflict' });
      } else {
        setAsk({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
      }
    }
  });

  // A draft from before (a closed tab, a dropped connection) is saved again, once, as the note opens.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (dirty) saver.soon();
  }, [dirty, saver]);

  const type = (value: string) => {
    typed.current = value;
    setText(value);
    setDirty(true);
    keepDraft(sticky.id, { body: value, version: base.current });
    saver.soon();
  };

  const place = (change: Parameters<typeof placeSticky>[1]) => void placeSticky(sticky.id, change).catch(() => {});
  const rollUp = () => place({ collapsed: !sticky.collapsed });
  const close = () => {
    if (typed.current.trim()) return setAsk({ kind: 'remove' });
    saver.cancel();
    void removeSticky(sticky.id).catch(() => {});
  };

  const shown = { ...onScreen(live?.x ?? sticky.x, live?.y ?? sticky.y, live?.width ?? sticky.width), width: live?.width ?? sticky.width, height: live?.height ?? sticky.height };

  /** Follows the pointer from `e` until it lets go, then saves where it ended up. */
  const follow = (e: ReactPointerEvent<HTMLElement>, step: (dx: number, dy: number) => Partial<Sticky>) => {
    if (e.button !== 0) return;
    onFront?.();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let last: Partial<Sticky> | null = null;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      last = step(ev.clientX - start.x, ev.clientY - start.y);
      setLive(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDragging(false);
      setLive(null);
      const moved = last && Object.entries(last).some(([key, value]) => sticky[key as keyof Sticky] !== value);
      if (moved && last) place(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const moveBy = (e: ReactPointerEvent<HTMLElement>) => {
    if (!placed || (e.target as HTMLElement).closest('button')) return;
    const from = { x: shown.x, y: shown.y };
    follow(e, (dx, dy) => onScreen(from.x + dx, from.y + dy, shown.width));
  };

  const sizeBy = (e: ReactPointerEvent<HTMLElement>) => {
    const from = { width: shown.width, height: shown.height };
    follow(e, (dx, dy) => clampSize(from.width + dx, from.height + dy));
  };

  const firstLine = text.split('\n').find((line) => line.trim())?.trim() ?? '';
  const menuItems: ContextMenuItem[] = [
    ...NOTE_COLORS.map((color) => ({ label: COLOR_NAMES[color], checked: color === sticky.color, action: () => place({ color }) })),
    { divider: true, label: '' },
    { label: sticky.collapsed ? 'Unroll' : 'Roll Up', action: rollUp },
    { label: 'Delete Note', action: close }
  ];

  return (
    <section
      className="os-own-sticky"
      data-color={sticky.color}
      data-collapsed={sticky.collapsed || undefined}
      data-front={front || undefined}
      aria-label={`Sticky note${firstLine ? `: ${firstLine}` : ''}`}
      style={placed ? { left: shown.x, top: shown.y, width: shown.width, height: shown.height, zIndex: z } : undefined}
      onPointerDown={() => onFront?.()}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('textarea')) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="os-own-sticky-strip" data-dragging={dragging || undefined} onPointerDown={moveBy} onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && rollUp()}>
        <button type="button" aria-label="Close note" title="Close" onClick={close} />
        {sticky.collapsed && <span className="os-own-sticky-title">{firstLine || 'Empty note'}</span>}
        <button type="button" className="os-own-sticky-shade" aria-label={sticky.collapsed ? 'Unroll note' : 'Roll up note'} title={sticky.collapsed ? 'Unroll' : 'Roll up'} onClick={rollUp} />
      </div>
      {!sticky.collapsed && (
        <>
          <textarea
            ref={page}
            value={text}
            maxLength={STICKY_MAX}
            spellCheck
            aria-label="Sticky note"
            placeholder="Write something…"
            onChange={(e) => type(e.target.value)}
            onBlur={() => saver.flush()}
          />
          {dirty && <span className="os-own-sticky-status">Edited</span>}
          {placed && <span className="os-own-sticky-grip" aria-hidden="true" onPointerDown={sizeBy} />}
        </>
      )}
      {ask?.kind === 'remove' && (
        <div className="os-own-sticky-ask" role="alertdialog" aria-label="Delete this note?">
          <p>Delete this note?</p>
          <div>
            <button type="button" className="os-button" onClick={() => setAsk(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="os-button os-button-primary"
              onClick={() => {
                saver.cancel();
                setAsk(null);
                void removeSticky(sticky.id).catch((error) => setAsk({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }));
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {ask?.kind === 'conflict' && (
        <div className="os-own-sticky-ask" role="alertdialog" aria-label="This note was changed somewhere else">
          <p>This note was changed somewhere else.</p>
          <div>
            <button
              type="button"
              className="os-button"
              onClick={() => {
                const newer = myStickiesNow().find((s) => s.id === sticky.id);
                saver.cancel();
                setAsk(null);
                if (!newer) return;
                typed.current = newer.body;
                base.current = newer.version;
                setText(newer.body);
                setDirty(false);
                dropDraft(sticky.id);
              }}
            >
              Use That
            </button>
            <button
              type="button"
              className="os-button os-button-primary"
              onClick={() => {
                const newer = myStickiesNow().find((s) => s.id === sticky.id);
                if (newer) base.current = newer.version;
                setAsk(null);
                void saver.now();
              }}
            >
              Keep This
            </button>
          </div>
        </div>
      )}
      {ask?.kind === 'failed' && (
        <div className="os-own-sticky-ask" role="alertdialog" aria-label="This note couldn’t be saved">
          <p>
            {ask.message}
            <br />
            What you typed is kept in this browser.
          </p>
          <div>
            <button type="button" className="os-button" onClick={() => setAsk(null)}>
              OK
            </button>
            <button
              type="button"
              className="os-button os-button-primary"
              onClick={() => {
                setAsk(null);
                void saver.now();
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}
      {menu && <ContextMenu at={menu} items={menuItems} onClose={() => setMenu(null)} label="Sticky note" />}
    </section>
  );
}
