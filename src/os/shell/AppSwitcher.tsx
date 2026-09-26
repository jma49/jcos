import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { apps } from '../core/registry';
import { isPhone, useWindowList, useWindows } from '../core/store';

// ⌥Tab: the window switcher. Hold ⌥ and press Tab to step through the open
// windows, most recent first (⇧ steps back); let go of ⌥ to bring the
// chosen one forward. Browsers keep ⌘Tab for themselves.

/** Window ids, most recently used first; minimized windows last. */
function recentWindows() {
  const { order, windows } = useWindows.getState();
  const ids = [...order].reverse();
  return [...ids.filter((id) => !windows[id]?.minimized), ...ids.filter((id) => windows[id]?.minimized)];
}

export function AppSwitcher() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const list = useWindowList();
  const windows = Object.fromEntries(list.map((w) => [w.id, w]));
  // Mirrors of the state for the key listeners, which outlive renders.
  const current = useRef<string[] | null>(null);
  const at = useRef(0);
  const show = useCallback((next: string[] | null, i = 0) => {
    current.current = next;
    at.current = i;
    setIds(next);
    setIndex(i);
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (isPhone()) return;
      if (e.altKey && e.code === 'Tab') {
        e.preventDefault();
        const list = current.current;
        if (!list) {
          const recent = recentWindows();
          if (recent.length === 0) return;
          show(recent, recent.length > 1 ? (e.shiftKey ? recent.length - 1 : 1) : 0);
        } else {
          show(list, (at.current + (e.shiftKey ? -1 : 1) + list.length) % list.length);
        }
      } else if (current.current && e.key === 'Escape') {
        e.preventDefault();
        show(null);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const list = current.current;
      if (list && e.key === 'Alt') {
        const id = list[at.current];
        if (useWindows.getState().windows[id]) useWindows.getState().focus(id);
        show(null);
      }
    };
    // Switching away from the page mid-gesture shouldn't leave it open.
    const onBlur = () => current.current && show(null);

    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [show]);

  const shown = ids?.filter((id) => windows[id]) ?? null;
  const selected = shown?.[Math.min(index, shown.length - 1)];

  return (
    <AnimatePresence>
      {shown && shown.length > 0 && (
        <motion.div
          className="os-switcher"
          role="listbox"
          aria-label="Open windows"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.12 }}
        >
          <ul>
            {shown.map((id) => {
              const win = windows[id];
              const { Icon } = apps[win.app];
              return (
                <li key={id} role="option" aria-selected={id === selected} data-minimized={win.minimized || undefined}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      useWindows.getState().focus(id);
                      show(null);
                    }}
                  >
                    <Icon size={64} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p>{selected ? windows[selected].title : ''}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
