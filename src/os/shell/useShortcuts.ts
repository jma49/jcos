import { useEffect } from 'react';
import { launch } from '../core/registry';
import { isPhone, useWindows } from '../core/store';
import { typing } from '../core/useKeys';

/** The desktop's keys: F9 Exposé; ⌘K search; ⌥W / ⌥M / ⌥T for windows (the browser keeps ⌘W/⌘T). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWindows.getState();
      // A full-screen app (Time Machine) has the keyboard to itself.
      if (s.fullScreen) return;
      const top = [...s.order].reverse().find((id) => !s.windows[id]?.minimized);
      // In a text field ⌥ with a letter types a character (⌥W is ∑, ⌥M is µ, ⌥T is †).
      const alt = e.altKey && !typing(e);
      // Escape and the rest of Exposé's keys are Exposé's own (Expose.tsx).
      if (e.key === 'F9' && !isPhone()) {
        e.preventDefault();
        s.setExpose(!s.exposeOpen);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setSpotlight(!s.spotlightOpen);
      } else if (alt && e.code === 'KeyW' && top) {
        e.preventDefault();
        s.close(top);
      } else if (alt && e.code === 'KeyM' && top) {
        e.preventDefault();
        s.minimize(top);
      } else if (alt && e.code === 'KeyT') {
        e.preventDefault();
        launch('terminal', { key: `terminal-${Date.now()}` });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
