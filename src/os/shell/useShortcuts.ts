import { useEffect } from 'react';
import { launch } from '../core/registry';
import { isPhone, useWindows } from '../core/store';

/** The desktop's keys: F9 Exposé; ⌘K search; ⌥W / ⌥M / ⌥T for windows (the browser keeps ⌘W/⌘T). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWindows.getState();
      const top = [...s.order].reverse().find((id) => !s.windows[id]?.minimized);
      if (e.key === 'F9' && !isPhone()) {
        e.preventDefault();
        s.setExpose(!s.exposeOpen);
      } else if (e.key === 'Escape' && s.exposeOpen) {
        s.setExpose(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setSpotlight(!s.spotlightOpen);
      } else if (e.altKey && e.code === 'KeyW' && top) {
        e.preventDefault();
        s.close(top);
      } else if (e.altKey && e.code === 'KeyM' && top) {
        e.preventDefault();
        s.minimize(top);
      } else if (e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        launch('terminal', { key: `terminal-${Date.now()}` });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
