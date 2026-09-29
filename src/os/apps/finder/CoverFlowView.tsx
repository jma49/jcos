import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { animate, m, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react';
import type { FileNode } from '../../core/files';
import { useReduceMotion } from '../../core/system';
import { Thumb } from './parts';

// Leopard's Cover Flow in Finder: the folder's items stand in a row over
// their reflections, on black, the selected one facing you and the rest
// turned away, above the folder's list. A disc stands as its case, a
// photo as its picture, anything else as its icon. Drag the row or its
// scroller, use the arrow keys, or click a cover to bring it to the
// front; a double-click opens it.
//
// Where the row stands is one continuous number (`pos`, in items), as on
// the iPod, so a cover passing the middle turns towards you and away again
// smoothly instead of jumping between places.

/** How big a cover is at most; a shorter window gets smaller ones, so the caption stays clear. */
const SIZE = 190;
/** Pixels of drag per item. */
const SPACING = 60;
/** Covers drawn either side of the middle; the rest aren't. */
const REACH = 7;
const SPRING = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 } as const;

/**
 * Where a cover `size` px big stands `d` items from the middle (d may be
 * fractional mid-move): facing you at 0, turned 70° away and set back
 * beyond ±1, and everything in between on the way.
 */
function place(d: number, size: number) {
  const t = Math.max(-1, Math.min(1, d));
  const beyond = Math.abs(d) > 1 ? (Math.abs(d) - 1) * size * 0.28 * Math.sign(d) : 0;
  const x = t * size * 0.88 + beyond;
  const z = size * 0.24 - Math.abs(t) * size * 0.88;
  return `translateX(calc(-50% + ${x.toFixed(2)}px)) translateZ(${z.toFixed(2)}px) rotateY(${(-t * 70).toFixed(2)}deg)`;
}

function Cover({
  node,
  index,
  pos,
  size,
  onPick,
  onOpen
}: {
  node: FileNode;
  index: number;
  pos: MotionValue<number>;
  size: number;
  onPick: (i: number) => void;
  onOpen: (node: FileNode, el: Element) => void;
}) {
  const transform = useTransform(pos, (p) => place(index - p, size));
  const zIndex = useTransform(pos, (p) => 100 - Math.round(Math.abs(index - p) * 10));
  return (
    <m.button
      type="button"
      className="os-finder-cf-item"
      style={{ transform, zIndex, width: size, height: size }}
      aria-label={node.name}
      onClick={() => onPick(index)}
      onDoubleClick={(e) => onOpen(node, e.currentTarget)}
    >
      <Thumb node={node} size={size} />
    </m.button>
  );
}

export function CoverFlowView({
  items,
  selected,
  onSelect,
  onOpen,
  children
}: {
  items: FileNode[];
  selected: string | null;
  onSelect: (node: FileNode) => void;
  onOpen: (node: FileNode, el: Element) => void;
  /** The folder's list, under the row. */
  children: ReactNode;
}) {
  const last = Math.max(0, items.length - 1);
  const chosen = Math.max(0, items.findIndex((n) => n.path === selected));
  const pos = useMotionValue(chosen);
  const [at, setAt] = useState(chosen);
  const reduced = useReduceMotion();
  const dragged = useRef(false);
  const target = useRef(chosen);
  const flow = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(SIZE);

  // Covers as big as the row's height allows, with room below for the caption and the scroller.
  useLayoutEffect(() => {
    const el = flow.current;
    if (!el) return;
    const fit = () => setSize(Math.round(Math.min(SIZE, Math.max(80, el.clientHeight - 110))));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  useMotionValueEvent(pos, 'change', (p) => {
    const nearest = Math.max(0, Math.min(last, Math.round(p)));
    setAt((a) => (a === nearest ? a : nearest));
  });

  /** Slides the row to an item, from wherever it is and at whatever speed it's going. */
  const settle = (index: number, velocity = pos.getVelocity()) => {
    const to = Math.max(0, Math.min(last, Math.round(index)));
    target.current = to;
    if (reduced) animate(pos, to, { duration: 0.2, ease: 'easeOut' });
    else animate(pos, to, { ...SPRING, velocity });
  };

  // The selection moves the row: a click in the list, the arrow keys, a search.
  useEffect(() => {
    if (chosen !== target.current) {
      target.current = chosen;
      if (reduced) animate(pos, chosen, { duration: 0.2, ease: 'easeOut' });
      else animate(pos, chosen, SPRING);
    }
  }, [chosen, pos, reduced]);

  /** Brings an item to the front and selects it. */
  const pick = (index: number) => {
    if (dragged.current) return;
    const to = Math.max(0, Math.min(last, index));
    settle(to);
    if (items[to]) onSelect(items[to]);
  };

  // Dragging the row: it follows the pointer, and a flick carries on and settles.
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const start = { x: e.clientX, pos: pos.get() };
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      if (!dragged.current && Math.abs(dx) < 4) return;
      if (!dragged.current) el.setPointerCapture(ev.pointerId);
      dragged.current = true;
      pos.stop();
      pos.set(Math.max(-0.4, Math.min(last + 0.4, start.pos - dx / SPACING)));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (!dragged.current) return;
      const velocity = pos.getVelocity();
      const to = Math.round(pos.get() + velocity * 0.12);
      settle(to, velocity);
      const node = items[Math.max(0, Math.min(last, to))];
      if (node) onSelect(node);
      // The click that ends a drag isn't a pick.
      setTimeout(() => (dragged.current = false), 0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const node = items[at];
  const note = node?.look?.lines?.find(Boolean) ?? node?.kind;
  const near = items.flatMap((n, i) => (Math.abs(i - at) <= REACH ? [{ n, i }] : []));

  return (
    <div className="os-finder-cf-view">
      <div ref={flow} className="os-finder-cf" onPointerDown={drag} style={{ '--cf': `${size}px` } as CSSProperties}>
        <div className="os-finder-cf-stage">
          {near.map(({ n, i }) => (
            <Cover key={n.path} node={n} index={i} pos={pos} size={size} onPick={pick} onOpen={onOpen} />
          ))}
        </div>
        {node && (
          <div className="os-finder-cf-caption" aria-live="polite">
            {node.name}
            {note && <span>{note}</span>}
          </div>
        )}
        {items.length > 1 && (
          <input
            className="os-finder-cf-scroller"
            type="range"
            min={0}
            max={last}
            step={1}
            value={at}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => pick(Number(e.target.value))}
            aria-label="Scroll through the covers"
          />
        )}
      </div>
      <div className="os-finder-cf-split" aria-hidden="true" />
      {children}
    </div>
  );
}
