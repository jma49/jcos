import { useEffect, useRef } from 'react';
import { useWindows } from './store';

/** Whether the key was pressed in a text field (an input, a textarea, a select, anything editable), where it types. */
export function typing(e: KeyboardEvent) {
  return e.target instanceof Element && !!e.target.closest('input, textarea, select, [contenteditable]');
}

/**
 * Whether a key pressed while an app's window is in front is the app's to
 * take, rather than the focused element's. A ⌘, Ctrl or ⌥ shortcut is,
 * wherever focus is, as a menu command would be; in a text field only ⌘
 * gets through, since ⌥ with a key types a character on a Mac (⌥W is ∑).
 * Any other key is the app's with focus on the page itself or anywhere in
 * the window, or in a panel of the app's own drawn outside it (`data-panel`,
 * DVD Player's Controller); a control anywhere else (a Dock icon, the menu
 * bar, a menu, a window's close box, which is the shell's) keeps its own
 * keys, and a text field its typing. Every handler on `window` asks this
 * first; that its window is the one in front is the handler's own check.
 */
export function ownsKey(e: KeyboardEvent) {
  if (typing(e)) return e.metaKey;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const target = e.target;
  if (!(target instanceof Element) || target === document.body) return true;
  // The title bar's close, minimize and zoom boxes are the shell's, not the app's.
  if (target.closest('.os-titlebar')) return false;
  return !!target.closest('.os-window[data-focused="true"], [data-panel]');
}

/**
 * Keyboard shortcuts for an app while its window is frontmost, with focus
 * on the page or anywhere inside the window (ownsKey). Typing in a field
 * (Spotlight, the seek slider) is left alone.
 */
export function useKeys(active: boolean, keys: Record<string, () => void>) {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Exposé has the arrow keys and Return while it's open.
      if (useWindows.getState().exposeOpen) return;
      if (!ownsKey(e)) return;
      const run = latest.current[e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/**
 * For a slider on an app's remote (a volume, a position): let go by the
 * pointer, it lets go of the keys too, so Space and the arrows are the
 * app's again (a focused slider keeps them, and useKeys leaves them to
 * it). Tabbed to, it keeps them.
 */
export function releaseAfterPointer(e: { currentTarget: HTMLElement }) {
  const el = e.currentTarget;
  const done = () => {
    window.removeEventListener('pointerup', done);
    window.removeEventListener('pointercancel', done);
    el.blur();
  };
  window.addEventListener('pointerup', done);
  window.addEventListener('pointercancel', done);
}
