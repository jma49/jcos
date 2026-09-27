import { useEffect, useEffectEvent } from 'react';

/** The longest step a frame may take, so a stall doesn't teleport anything. */
const MAX_STEP = 0.05;

/**
 * Calls `tick(dt)` every animation frame while `running`, with the seconds
 * since the last frame (at most 0.05). When it stops, `tick(0)` runs once,
 * so the game can draw its paused state, and then nothing runs at all: an
 * applet in the background costs no script time. Browsers also stop
 * animation frames in a hidden tab.
 */
export function useGameLoop(tick: (dt: number) => void, running: boolean) {
  const onFrame = useEffectEvent(tick);
  useEffect(() => {
    if (!running) {
      onFrame(0);
      return;
    }
    let last = performance.now();
    let raf = requestAnimationFrame(function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
      last = now;
      onFrame(dt);
    });
    return () => cancelAnimationFrame(raf);
  }, [running]);
}
