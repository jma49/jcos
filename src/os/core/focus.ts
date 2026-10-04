// Where the keyboard's focus goes back to when something that took it
// closes: Spotlight, the Dashboard, a full-screen app, an alert, a context
// menu, a window. What had focus is noted as it opens (for the overlays, in
// the store's action, before anything of theirs mounts and focuses itself),
// and given back as it closes; when that's gone or out of reach, or a window
// came to the front meanwhile (something opened an app), focus goes to the
// window in front. Plain DOM, no React, so the store can use it.

/** What had focus when something took it, and which window was in front then. */
export interface Held {
  el: Element | null;
  front: string | null;
}

interface Stack {
  order: string[];
  windows: Record<string, { minimized: boolean } | undefined>;
}

/** The window in front: the last in the order that isn't minimized. */
export function frontOf({ order, windows }: Stack): string | null {
  for (let i = order.length - 1; i >= 0; i--) if (windows[order[i]] && !windows[order[i]]!.minimized) return order[i];
  return null;
}

/** Notes what has focus now (null for the page itself) and the window in front. */
export function hold(front: string | null): Held {
  const el = typeof document === 'undefined' ? null : document.activeElement;
  return { el: el && el !== document.body ? el : null, front };
}

/**
 * Where focus goes back to: the window that came to the front while it was
 * away, else what had it if it can still take it, else the window in front;
 * null for the page itself.
 */
export function focusBackTo(held: Held, front: string | null, windowOf: (id: string) => Element | null, usable: (el: Element) => boolean): Element | null {
  const win = front ? windowOf(front) : null;
  if (front && front !== held.front && win) return win;
  if (held.el && usable(held.el)) return held.el;
  return win;
}

/** Whether an element can take focus back: still on the page, shown, and not under a modal layer. */
const usable = (el: Element) => el.isConnected && !el.closest('[inert]') && el.getClientRects().length > 0;

const windowOf = (id: string) => [...document.querySelectorAll('.os-window')].find((w) => (w as HTMLElement).dataset.id === id) ?? null;

/**
 * Gives focus back, on the next frame, once whatever closed has rendered
 * away and the key that closed it has been handled everywhere (so no app
 * takes that key for its own). Only if focus has nowhere better to be: on
 * the page itself, gone with what closed, or still inside `from` (what's
 * closing); focus that someone put elsewhere meanwhile stays there.
 */
export function giveBack(held: Held | undefined, front: () => string | null, from?: Element | null) {
  if (!held || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const now = document.activeElement;
    if (now && now !== document.body && now.isConnected && !(from && from.contains(now))) return;
    const to = focusBackTo(held, front(), windowOf, usable);
    if (to instanceof HTMLElement) to.focus({ preventScroll: true });
    // Nowhere to go: at least not left on something on its way out.
    else if (now instanceof HTMLElement && from?.contains(now)) now.blur();
  });
}

/**
 * Makes everything on the page but `layer` inert, as a modal layer (the
 * Dashboard, a full-screen app) needs while it's up: the rest of the
 * desktop, and the page around it (its skip link, the text copy). Returns
 * the undo, which leaves alone what was inert already.
 */
export function inertAround(layer: Element) {
  const under: HTMLElement[] = [];
  for (let el: Element = layer; el.parentElement && el !== document.body; el = el.parentElement) {
    for (const other of el.parentElement.children) {
      if (other !== el && other instanceof HTMLElement && !other.inert) under.push(other);
    }
  }
  under.forEach((el) => (el.inert = true));
  return () => under.forEach((el) => (el.inert = false));
}
