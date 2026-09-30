import { useEffect, useRef, useState, type ChangeEvent } from 'react';

/**
 * A position slider (`<input type="range">`) that stays where it's put.
 * Set from the clock alone, it would go back to where the video was after
 * every move of a drag until the clock caught up, and again after a seek,
 * as YouTube says the old time for a moment. So what's asked for is shown
 * until the clock gets there (a second and a half at most). While it's
 * dragged `seek(t, false)` follows it, within what's loaded, and it lands
 * with `seek(t, true)` where it's let go, as YouTube advises; a key seeks
 * at once. `value` is the time to show beside it too.
 */
export function useScrub(time: number, seek: (seconds: number, done: boolean) => void) {
  const [held, setHeld] = useState<{ value: number; dragging: boolean } | null>(null);
  const drag = useRef<{ value: number; moved: boolean } | null>(null);
  const seekNow = useRef(seek);
  /** Stops listening for the drag's end. */
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => {
    seekNow.current = seek;
  });

  // Let go (or a key pressed): shown where it was put until the clock is there.
  useEffect(() => {
    if (!held || held.dragging) return;
    if (Math.abs(time - held.value) < 1.5) return setHeld(null);
    const timer = setTimeout(() => setHeld(null), 1500);
    return () => clearTimeout(timer);
  }, [held, time]);

  // Gone mid-drag: the drag is dropped.
  useEffect(() => () => stop.current?.(), []);

  return {
    value: held?.value ?? Math.round(time),
    onPointerDown: () => {
      const value = held?.value ?? Math.round(time);
      drag.current = { value, moved: false };
      setHeld({ value, dragging: true });
      // Where it's let go may be outside the slider.
      const end = () => {
        stop.current?.();
        const done = drag.current;
        drag.current = null;
        if (!done?.moved) return setHeld(null);
        setHeld({ value: done.value, dragging: false });
        seekNow.current(done.value, true);
      };
      stop.current?.();
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      stop.current = () => {
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        stop.current = null;
      };
    },
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      const dragged = drag.current;
      if (dragged) {
        dragged.value = value;
        dragged.moved = true;
      }
      setHeld({ value, dragging: !!dragged });
      seek(value, !dragged);
    }
  };
}
