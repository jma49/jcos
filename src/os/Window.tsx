import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { apps } from './registry';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, MOBILE_BREAKPOINT, useWindows } from './store';
import { frameOf } from './Expose';
import { GENIE_REACH, genieMap, genieSupported } from './genie';
import type { Rect, WindowState } from './types';

type Edge = 'e' | 's' | 'se' | 'w' | 'sw';

interface Props {
  win: WindowState;
  focused: boolean;
  z: number;
  /** Where Exposé shows the window, while it is open. */
  exposed?: Rect;
}

const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;

/** Genie timing: the funnel forms first, then the window slides down it. */
const GENIE_IN = { duration: 0.42, delay: 0.14, ease: [0.55, 0, 0.9, 0.45] } as const;
const GENIE_OUT = { duration: 0.4, ease: [0.1, 0.55, 0.45, 1] } as const;

/** Offset and scale that map a window's frame onto a target rect (open, minimize, Exposé). */
function towards(frame: Rect, target?: DOMRect | Rect) {
  if (!target) return { x: 0, y: 40, scale: 0.9 };
  const tx = 'left' in target ? target.left : target.x;
  const ty = 'top' in target ? target.top : target.y;
  return {
    x: tx + target.width / 2 - (frame.x + frame.width / 2),
    y: ty + target.height / 2 - (frame.y + frame.height / 2),
    scale: Math.max(0.05, target.width / frame.width)
  };
}

/** How far back the release velocity looks, in milliseconds. */
const VELOCITY_WINDOW = 90;

/**
 * Pointer-captured drag helper: calls onMove with the offset from the start,
 * and onEnd with the pointer's velocity (px/s) as it let go.
 */
function useDrag(
  onMove: (dx: number, dy: number) => void,
  onStart?: () => void,
  onEnd?: (vx: number, vy: number) => void
) {
  return useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      document.body.classList.add('os-dragging');
      onStart?.();
      let frame = 0;
      const samples: { t: number; x: number; y: number }[] = [];
      const move = (ev: PointerEvent) => {
        samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
        while (samples.length > 2 && ev.timeStamp - samples[0].t > VELOCITY_WINDOW) samples.shift();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => onMove(ev.clientX - startX, ev.clientY - startY));
      };
      const up = (ev: PointerEvent) => {
        cancelAnimationFrame(frame);
        document.body.classList.remove('os-dragging');
        const first = samples[0];
        const last = samples[samples.length - 1];
        // A pointer that paused before letting go isn't throwing anything.
        if (onEnd && first && last !== first && ev.timeStamp - last.t < 50) {
          const dt = (last.t - first.t) / 1000;
          onEnd((last.x - first.x) / dt, (last.y - first.y) / dt);
        }
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [onMove, onStart, onEnd]
  );
}

/** Throws below this speed (px/s) just drop the window where it is. */
const THROW_MIN_SPEED = 500;
/** Fastest a window can be thrown, px/s. */
const THROW_MAX_SPEED = 3000;
/** Share of velocity lost per second while gliding. */
const FRICTION = 3.2;
/** Share of velocity kept when bouncing off a screen edge. */
const BOUNCE = 0.45;

export function Window({ win, focused, z, exposed }: Props) {
  const { close, focus, minimize, toggleMaximize, setBounds } = useWindows.getState();
  const def = apps[win.app];
  const reduced = useReducedMotion();
  const start = useRef(win);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;

  // A thrown window glides on, slows down and bounces off the screen edges.
  const glide = useRef(0);
  useEffect(() => () => cancelAnimationFrame(glide.current), []);
  const throwWindow = (vx: number, vy: number) => {
    const speed = Math.hypot(vx, vy);
    if (reduced || speed < THROW_MIN_SPEED) return;
    const cap = Math.min(1, THROW_MAX_SPEED / speed);
    vx *= cap;
    vy *= cap;
    let { x, y } = useWindows.getState().windows[win.id];
    const { width, height } = useWindows.getState().windows[win.id];
    // A window already hanging off an edge may stay there.
    const minX = Math.min(0, x);
    const maxX = Math.max(window.innerWidth - width, x);
    const minY = MENU_BAR_HEIGHT;
    const maxY = Math.max(window.innerHeight - height, y, minY);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const decay = Math.exp(-FRICTION * dt);
      vx *= decay;
      vy *= decay;
      x += vx * dt;
      y += vy * dt;
      if (x < minX || x > maxX) {
        x = Math.min(maxX, Math.max(minX, x));
        vx *= -BOUNCE;
      }
      if (y < minY || y > maxY) {
        y = Math.min(maxY, Math.max(minY, y));
        vy *= -BOUNCE;
      }
      setBounds(win.id, { x: Math.round(x), y: Math.round(y) });
      if (Math.hypot(vx, vy) > 12) glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
  };

  const beginDrag = useDrag(
    (dx, dy) => {
      const s = start.current;
      const maxX = window.innerWidth - 96;
      setBounds(win.id, {
        x: Math.min(maxX, Math.max(96 - s.width, s.x + dx)),
        y: Math.min(window.innerHeight - 60, Math.max(MENU_BAR_HEIGHT, s.y + dy))
      });
    },
    () => {
      cancelAnimationFrame(glide.current);
      start.current = useWindows.getState().windows[win.id];
      focus(win.id);
    },
    throwWindow
  );

  const edge = useRef<Edge>('se');
  const beginResize = useDrag(
    (dx, dy) => {
      const s = start.current;
      const next: Partial<WindowState> = {};
      if (edge.current.includes('e')) next.width = Math.max(def.minWidth, s.width + dx);
      if (edge.current.includes('s')) next.height = Math.max(def.minHeight, s.height + dy);
      if (edge.current.includes('w')) {
        const width = Math.max(def.minWidth, s.width - dx);
        next.width = width;
        next.x = s.x + s.width - width;
      }
      setBounds(win.id, next);
    },
    () => {
      start.current = useWindows.getState().windows[win.id];
      focus(win.id);
    }
  );

  const resizeHandle = (dir: Edge) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      edge.current = dir;
      beginResize(e);
    },
    className: `os-resize os-resize-${dir}`
  });

  // Maximized windows fill the desktop between the menu bar and the Dock.
  const frame =
    win.maximized || isMobile
      ? {
          left: isMobile ? 0 : 8,
          top: MENU_BAR_HEIGHT + (isMobile ? 0 : 8),
          width: isMobile ? window.innerWidth : window.innerWidth - 16,
          height: window.innerHeight - MENU_BAR_HEIGHT - (isMobile ? 0 : DOCK_CLEARANCE)
        }
      : { left: win.x, top: win.y, width: win.width, height: win.height };

  const dockTarget = () =>
    document.querySelector(`[data-dock-app="${win.app}"]`)?.getBoundingClientRect() ??
    document.querySelector('[data-dock-minimized]')?.getBoundingClientRect();

  const rect = isMobile ? { x: frame.left, y: frame.top, width: frame.width, height: frame.height } : frameOf(win);

  // Genie: from the moment the window minimizes until it has fully come back.
  const [genie, setGenie] = useState<{ neck: number; dx: number; dy: number } | null>(null);
  if (win.minimized && !genie && genieSupported && !reduced && !isMobile) {
    const dock = dockTarget();
    if (dock) {
      const iconX = dock.left + dock.width / 2;
      const neck = Math.min(0.92, Math.max(0.08, (iconX - rect.x) / rect.width));
      setGenie({ neck, dx: iconX - (rect.x + neck * rect.width), dy: dock.top + dock.height / 2 - (rect.y + rect.height) });
    }
  }
  const map = useMemo(() => (genie ? genieMap(genie.neck) : null), [genie?.neck]);
  const warp = useMotionValue(0);
  const displacement = useRef<SVGFEDisplacementMapElement>(null);
  const filterId = `genie-${win.id.replace(/[^\w-]/g, '-')}`;

  useEffect(
    () => warp.on('change', (v) => displacement.current?.setAttribute('scale', String(v * 2 * GENIE_REACH))),
    [warp]
  );
  useEffect(() => {
    if (!genie) return;
    const controls = win.minimized
      ? animate(warp, 1, { duration: 0.26, ease: [0.4, 0, 1, 1] })
      : animate(warp, 0, { duration: 0.24, delay: 0.26, ease: [0, 0, 0.6, 1] });
    return () => controls.stop();
  }, [genie, win.minimized, warp]);

  const shown = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 };
  const target = genie
    ? win.minimized
      ? { x: genie.dx, y: genie.dy, scale: 1, scaleX: 0.12, scaleY: 0.04, opacity: 0, transition: GENIE_IN }
      : { ...shown, transition: GENIE_OUT }
    : win.minimized
      ? { ...towards(rect, dockTarget()), opacity: 0 }
      : exposed
        ? { ...towards(rect, exposed), opacity: 1 }
        : shown;

  // Exposé moves windows even with reduced motion, just without the animation.
  const pickFromExpose = () => {
    useWindows.getState().setExpose(false);
    focus(win.id);
  };

  return (
    <motion.section
      role="dialog"
      aria-label={win.title}
      data-focused={focused}
      data-material={def.material}
      data-exposed={exposed ? true : undefined}
      className="os-window"
      style={{
        ...frame,
        zIndex: z,
        pointerEvents: win.minimized ? 'none' : undefined,
        // Genie pours the window out of its bottom edge, above the Dock icon.
        ...(genie ? { filter: `url(#${filterId})`, originX: genie.neck, originY: 1 } : { originX: 0.5, originY: 0.5 })
      }}
      initial={reduced ? { opacity: 0 } : { ...towards(rect, win.origin), opacity: 0 }}
      animate={reduced ? (exposed ? target : { x: 0, y: 0, scale: 1, opacity: win.minimized ? 0 : 1 }) : target}
      exit={reduced ? { opacity: 0 } : { scale: 0.94, opacity: 0, transition: { duration: 0.16 } }}
      transition={reduced ? { duration: 0 } : spring}
      onPointerDown={() => !exposed && !focused && focus(win.id)}
      onClick={exposed ? pickFromExpose : undefined}
      onAnimationComplete={() => genie && !win.minimized && setGenie(null)}
    >
      {genie && map && (
        <svg className="os-genie-defs" aria-hidden="true">
          {/* Bounding-box units keep the map on the window at any pixel density. */}
          <filter
            id={filterId}
            x="0"
            y="0"
            width="1"
            height="1"
            primitiveUnits="objectBoundingBox"
            colorInterpolationFilters="sRGB"
          >
            <feImage href={map} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
            <feDisplacementMap ref={displacement} in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <header
        className="os-titlebar"
        onPointerDown={isMobile || win.maximized ? undefined : beginDrag}
        onDoubleClick={() => !isMobile && toggleMaximize(win.id)}
      >
        <div className="os-controls" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="os-control os-close" aria-label="Close" onClick={() => close(win.id)} />
          <button type="button" className="os-control os-min" aria-label="Minimize" onClick={() => minimize(win.id)} />
          <button type="button" className="os-control os-max" aria-label="Zoom" onClick={() => toggleMaximize(win.id)} />
        </div>
        {/* Phones show this in place of the traffic lights. */}
        <button type="button" className="os-back" onClick={() => close(win.id)} onPointerDown={(e) => e.stopPropagation()}>
          ‹ Home
        </button>
        <h2 className="os-title">{win.title}</h2>
      </header>

      <div className="os-body">
        <Suspense fallback={<Loading />}>
          <def.Component win={win} />
        </Suspense>
      </div>

      {!win.maximized && !isMobile && (
        <>
          <div {...resizeHandle('e')} />
          <div {...resizeHandle('s')} />
          <div {...resizeHandle('se')} />
          <div {...resizeHandle('w')} />
          <div {...resizeHandle('sw')} />
        </>
      )}
    </motion.section>
  );
}

function Loading(): ReactNode {
  return (
    <div className="os-loading" role="status" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}
