import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * A line of text that scrolls back and forth when it doesn't fit, as the
 * iPod does for the highlighted row and the song on Now Playing.
 */
export function Marquee({ text, run = true, className }: { text: string; run?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflow(Math.max(0, el.scrollWidth - el.clientWidth));
  }, [text]);

  const style = { '--shift': `${-overflow}px`, '--duration': `${3 + overflow / 22}s` } as CSSProperties;
  return (
    <span ref={ref} className={`os-marquee ${className ?? ''}`} data-run={(run && overflow > 0) || undefined} style={style}>
      <span>{text}</span>
    </span>
  );
}
