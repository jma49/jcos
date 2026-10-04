// The keyboard's way into a context menu (ContextMenu.tsx) and through it.

/**
 * The item a key moves to in a menu of `count` items (the ones that can be
 * chosen: no separators, nothing disabled), from item `at`, or -1 with
 * focus on the menu itself: ↓ and ↑ go round, Home and End go to the
 * ends. Null for any other key, or an empty menu.
 */
export function menuStep(key: string, at: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return at < 0 ? 0 : (at + 1) % count;
  if (key === 'ArrowUp') return at < 0 ? count - 1 : (at - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Shift+F10, or the context-menu key some keyboards have. */
export const isMenuKey = (e: Pick<KeyboardEvent, 'key' | 'shiftKey'>) => e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');

// A text field keeps the browser's own menu (copy, paste, spelling).
const TEXT = 'textarea, select, [contenteditable], input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"])';

let byKeyboard = false;
/** Whether the menu opening now was asked for from the keyboard; asked once, by the menu as it mounts. */
export function openedByKeyboard() {
  const was = byKeyboard;
  byKeyboard = false;
  return was;
}

/**
 * Opens the context menu of what has focus, as a right-click on it would
 * (the same `contextmenu` event, from its middle), so every place with a
 * menu (the Dock, Finder, Stickies, iCal) has it from the keyboard too.
 * With focus on the page itself, the desktop's, unless a window is in
 * front (`windowInFront`). Returns whether a menu opened, so the key can
 * be kept from the browser.
 */
export function openContextMenu(e: KeyboardEvent, windowInFront: boolean): boolean {
  let target = e.target instanceof Element ? e.target : null;
  if (!target || target.closest(TEXT)) return false;
  let x: number;
  let y: number;
  if (target === document.body || target === document.documentElement) {
    if (windowInFront) return false;
    target = document.querySelector('.os-root');
    if (!target) return false;
    x = window.innerWidth / 2;
    y = window.innerHeight / 3;
  } else {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  byKeyboard = true;
  const opened = !target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
  if (!opened) byKeyboard = false;
  return opened;
}
