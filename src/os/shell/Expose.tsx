import { useEffect, useEffectEvent, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { isPhone, useWindows } from '../core/store';
import type { Rect } from '../core/types';

// The grid itself is exposeLayout.ts; this is the overlay drawn over it.

/** How long the pointer rests in the bottom-left corner before Exposé opens. */
const CORNER_DELAY = 250;

/** Opens Exposé when the pointer rests in the bottom-left screen corner. */
function useHotCorner() {
  useEffect(() => {
    let timer = 0;
    let armed = true;
    const onMove = (e: PointerEvent) => {
      const inCorner = e.clientX <= 2 && e.clientY >= window.innerHeight - 3;
      if (!inCorner) {
        clearTimeout(timer);
        timer = 0;
        armed = true;
        return;
      }
      if (!armed || timer || isPhone()) return;
      timer = window.setTimeout(() => {
        armed = false;
        timer = 0;
        const s = useWindows.getState();
        // A full-screen app (Time Machine) covers the windows Exposé would show.
        if (!s.fullScreen) s.setExpose(!s.exposeOpen);
      }, CORNER_DELAY);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      clearTimeout(timer);
    };
  }, []);
}

type Direction = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** The window nearest `from` in a direction, favouring ones straight ahead. */
function nearest(layout: Record<string, Rect>, from: string, direction: Direction) {
  const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const a = centre(layout[from]);
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, rect] of Object.entries(layout)) {
    if (id === from) continue;
    const b = centre(rect);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ahead = direction === 'ArrowLeft' ? -dx : direction === 'ArrowRight' ? dx : direction === 'ArrowUp' ? -dy : dy;
    const aside = direction === 'ArrowLeft' || direction === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
    if (ahead <= 0) continue;
    const score = ahead + aside * 2;
    if (score < bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The dimmed backdrop and window titles shown while Exposé is open. The
 * arrow keys move a highlight between the windows (the mouse does too) and
 * Return brings the highlighted one forward.
 */
export function Expose({ layout }: { layout: Record<string, Rect> | null }) {
  const windows = useWindows((s) => s.windows);
  const [picked, setPicked] = useState<string | null>(null);
  useHotCorner();

  // Start on the window that was in front.
  const open = layout !== null;
  const pickFrontmost = useEffectEvent(() =>
    setPicked([...useWindows.getState().order].reverse().find((id) => layout?.[id]) ?? null)
  );
  useEffect(() => {
    if (open) pickFrontmost();
    else setPicked(null);
  }, [open]);

  // Exposé has the keys while it's open, before the windows under it do
  // (Escape leaving it mustn't also send an app back a step). F9, which
  // closes it, and ⌘ and Ctrl keys are the desktop's.
  useEffect(() => {
    if (!layout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9' || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const s = useWindows.getState();
      if (e.key === 'Escape') s.setExpose(false);
      else if (e.key === 'Enter' && picked) {
        s.setExpose(false);
        s.focus(picked);
      } else if (picked && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        setPicked(nearest(layout, picked, e.key as Direction) ?? picked);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [layout, picked]);

  // The mouse moves the highlight too.
  useEffect(() => {
    if (!layout) return;
    const onMove = (e: PointerEvent) => {
      const hit = Object.entries(layout).find(([, r]) => e.clientX >= r.x && e.clientX <= r.x + r.width && e.clientY >= r.y && e.clientY <= r.y + r.height);
      if (hit) setPicked(hit[0]);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [layout]);

  const ring = picked && layout?.[picked];

  return (
    <AnimatePresence>
      {layout && (
        <m.div
          key="expose"
          className="os-expose"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => useWindows.getState().setExpose(false)}
        >
          {ring && (
            <span
              className="os-expose-ring"
              aria-hidden="true"
              style={{ left: ring.x - 6, top: ring.y - 6, width: ring.width + 12, height: ring.height + 12 }}
            />
          )}
          {Object.entries(layout).map(([id, rect]) => (
            <span
              key={id}
              className="os-expose-label"
              data-picked={id === picked || undefined}
              style={{ left: rect.x + rect.width / 2, top: rect.y + rect.height + 8 }}
            >
              {windows[id]?.title}
            </span>
          ))}
        </m.div>
      )}
    </AnimatePresence>
  );
}
