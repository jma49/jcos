import type { SkyState } from '../ambient/Sky';
import { useSystem } from '../core/system';

/**
 * Night Shift (Displays in System Preferences): a warm wash over the whole
 * screen, always or from sunset to sunrise where the visitor is. It's a
 * multiply layer that lets every click through.
 */
export function NightShift({ sky }: { sky: SkyState }) {
  const mode = useSystem((s) => s.nightShift);
  const warmth = useSystem((s) => s.warmth);
  const on = mode === 'on' || (mode === 'sunset' && !sky.daylight);
  if (!on) return null;
  return (
    <div className="os-night-shift" aria-hidden="true" style={{ '--warmth': 0.12 + warmth * 0.28 } as React.CSSProperties} />
  );
}
