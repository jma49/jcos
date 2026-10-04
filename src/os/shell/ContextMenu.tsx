import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { frontOf, giveBack, hold } from '../core/focus';
import { useWindows } from '../core/store';
import { menuStep, openedByKeyboard } from './menuKeys';

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  divider?: boolean;
}

/**
 * A right-click menu at a point on the screen. It's drawn over the whole
 * desktop (a window's own transform would otherwise move it), kept on
 * screen, and closes on a click elsewhere, Escape or leaving the page.
 * Focus goes into it as it opens: to its first item when it was opened from
 * the keyboard (Shift+F10, menuKeys.ts), else to the menu itself, so ↓
 * starts from the top. ↑ ↓ Home and End move through it, as through the
 * menu bar's; Escape and Tab close it and give focus back to what opened
 * it, and so does a command, unless the command put focus somewhere.
 */
export function ContextMenu({ at, items, onClose, label }: { at: { x: number; y: number }; items: ContextMenuItem[]; onClose: () => void; label?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState(at);
  // What opened it, noted while rendering, before it takes the focus.
  const [opener] = useState(() => ({ held: hold(frontOf(useWindows.getState())), keyboard: openedByKeyboard() }));
  /** Closes it from the keyboard, or by a command: focus goes back. */
  const dismiss = () => {
    giveBack(opener.held, () => frontOf(useWindows.getState()), ref.current);
    onClose();
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - width - 4)), y: Math.max(24, Math.min(at.y, window.innerHeight - height - 4)) });
  }, [at.x, at.y]);

  useEffect(() => {
    const list = ref.current;
    const first = opener.keyboard ? list?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)') : null;
    (first ?? list)?.focus({ preventScroll: true });
  }, [opener]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      giveBack(opener.held, () => frontOf(useWindows.getState()), ref.current);
      onClose();
    };
    window.addEventListener('pointerdown', onClose);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onClose);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, opener]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      dismiss();
      return;
    }
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')];
    const next = menuStep(e.key, items.indexOf(document.activeElement as HTMLElement), items.length);
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  };

  const menu = (
    <ul
      ref={ref}
      className="os-menu-list os-context-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.divider ? (
          <li key={i} className="os-menu-divider" role="separator" />
        ) : (
          <li key={i} role="none">
            <button
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              disabled={item.disabled}
              onClick={() => {
                dismiss();
                item.action?.();
              }}
            >
              <span>
                {item.checked !== undefined && (
                  <span className="os-menu-check" aria-hidden="true">
                    {item.checked ? '✓' : ''}
                  </span>
                )}
                {item.label}
              </span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          </li>
        )
      )}
    </ul>
  );
  const root = typeof document !== 'undefined' ? document.querySelector('.os-root') : null;
  return root ? createPortal(menu, root) : menu;
}
