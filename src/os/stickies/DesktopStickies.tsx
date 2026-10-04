import { useEffect, useState, useSyncExternalStore } from 'react';
import { notify } from '../core/notices';
import { MENU_BAR_HEIGHT } from '../core/store';
import { addSticky, useMineRefresh, useMyStickies } from './mine';
import { StickyNote } from './StickyNote';

/** The sticky just put up from the desktop's menu, for the caret to go into (as Stickies › Yours does). */
let newest: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
/** Once it has the caret: drawn again later (signed in again), it doesn't take it a second time. */
const taken = () => {
  newest = null;
};

/** The desktop's New Sticky Note: one of the member's own, where the desktop was clicked. */
export function newStickyAt(at: { x: number; y: number }) {
  addSticky({ x: Math.max(0, Math.round(at.x)), y: Math.max(MENU_BAR_HEIGHT + 2, Math.round(at.y)) }).then(
    (made) => {
      newest = made.id;
      listeners.forEach((listener) => listener());
    },
    (error) => notify({ title: 'No new sticky', body: error instanceof Error ? error.message : 'It couldn’t be put up.' })
  );
}

// The signed-in member's own stickies on their desktop, above its icons and
// below every window, each where it was left. The one touched last is in
// front. Loaded by shell/DesktopStickiesLayer.tsx once someone is signed in.

export function DesktopStickies({ account }: { account: string }) {
  useMineRefresh(account);
  const stickies = useMyStickies();
  const fresh = useSyncExternalStore(subscribe, () => newest);
  // StickyNote's own effect (a child's, so it runs first) has focused it by now.
  useEffect(() => {
    if (fresh) taken();
  }, [fresh]);
  const [order, setOrder] = useState<string[]>([]);
  const toFront = (id: string) => setOrder((o) => (o.at(-1) === id ? o : [...o.filter((x) => x !== id), id]));
  return (
    <div className="os-own-stickies" aria-label="Your stickies">
      {stickies.map((sticky) => (
        <StickyNote
          key={sticky.id}
          sticky={sticky}
          placed
          z={order.indexOf(sticky.id) + 1}
          front={order.at(-1) === sticky.id}
          onFront={() => toFront(sticky.id)}
          autoFocus={sticky.id === fresh}
        />
      ))}
    </div>
  );
}
