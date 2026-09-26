import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts for an app while its window is frontmost, whatever
 * inside it has focus. Typing in a field (Spotlight, the seek slider) is left
 * alone.
 */
export function useKeys(active: boolean, keys: Record<string, () => void>) {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const run = latest.current[e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
