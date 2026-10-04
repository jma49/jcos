import { useEffect, useRef, useState } from 'react';

/** How long typing rests before it's saved. */
export const SAVE_AFTER_MS = 1000;

/**
 * Saving as someone types (TextEdit, a sticky of one's own): once the
 * typing rests, at once when asked (⌘S), and on the way out (the window
 * or the note closing). Saves run one after another, each with what's
 * typed by the time it runs, so a later one can't overtake an earlier
 * one. Callers keep what's typed as a draft in the browser until it's
 * saved (files/documents.ts, stickies/mine.ts), so closing the tab loses nothing,
 * and ask for a draft they find as they open to be saved (`soon()`).
 */
export function useAutosave(save: () => Promise<void>) {
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  const [saver] = useState(() => {
    let chain: Promise<void> = Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waiting = false;
    const now = () => {
      clearTimeout(timer);
      waiting = false;
      chain = chain.then(() => latest.current()).catch(() => {});
      return chain;
    };
    return {
      /** Typed: saved once the typing rests. */
      soon() {
        clearTimeout(timer);
        waiting = true;
        timer = setTimeout(now, SAVE_AFTER_MS);
      },
      now,
      /** Nothing waits any more (what was typed has been emptied, or taken back). */
      cancel() {
        clearTimeout(timer);
        waiting = false;
      },
      /** On the way out: whatever is waiting is saved now. */
      flush() {
        if (waiting) void now();
      }
    };
  });
  useEffect(() => () => saver.flush(), [saver]);
  return saver;
}
