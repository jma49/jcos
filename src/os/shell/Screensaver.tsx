import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { isPhone, useWindows } from '../core/store';
import { useMusic } from '../media/music';
import { afterSettled } from '../core/warmUp';

// Starts the screen saver after the idle time chosen in System
// Preferences. What it draws, and the list System Preferences offers,
// live in saverViews.tsx, loaded the first time it's needed (and fetched
// ahead once the desktop has settled), so the desktop's first load
// doesn't carry them.

const loadViews = () => import('./saverViews');
const ScreensaverLayer = lazy(loadViews);

/**
 * Starts the screensaver after `minutes` without input (never for 0). Doesn't
 * run on phones, or while an iframe (a live demo in the Browser) has focus,
 * since the page can't see input inside it, or during karaoke.
 */
function useIdle(minutes: number, onIdle: () => void) {
  useEffect(() => {
    if (isPhone() || minutes <= 0) return;
    let timer = 0;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Nor in the middle of a song in Karaoke, where nobody touches anything.
        const { owner, playing } = useMusic.getState();
        if (document.activeElement?.tagName === 'IFRAME' || (owner === 'karaoke' && playing)) reset();
        else onIdle();
      }, minutes * 60_000);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, onIdle]);
}

/** The screensaver the visitor picked in System Preferences. */
export function Screensaver() {
  const active = useWindows((s) => s.screensaverOn);
  const { style, idle } = useWindows((s) => s.saver);
  const start = useCallback(() => useWindows.getState().setScreensaver(true), []);
  const stop = useCallback(() => useWindows.getState().setScreensaver(false), []);
  useIdle(idle, start);
  // Mounted from the first start on, so it can fade out again.
  const [used, setUsed] = useState(false);
  if (active && !used) setUsed(true);

  // Fetch the views once the desktop has settled, so starting is instant.
  useEffect(() => (isPhone() ? undefined : afterSettled(loadViews)), []);

  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <ScreensaverLayer active={active} style={style} onStop={stop} />
    </Suspense>
  );
}
