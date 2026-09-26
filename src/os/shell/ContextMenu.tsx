import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
 */
export function ContextMenu({ at, items, onClose, label }: { at: { x: number; y: number }; items: ContextMenuItem[]; onClose: () => void; label?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - width - 4)), y: Math.max(24, Math.min(at.y, window.innerHeight - height - 4)) });
  }, [at.x, at.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onClose);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onClose);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const menu = (
    <ul
      ref={ref}
      className="os-menu-list os-context-menu"
      role="menu"
      aria-label={label}
      style={{ left: pos.x, top: pos.y }}
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
                onClose();
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
