import { Suspense, useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { apps } from './registry';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, MOBILE_BREAKPOINT, useWindows } from './store';
import type { WindowState } from './types';

type Edge = 'e' | 's' | 'se' | 'w' | 'sw';

interface Props {
  win: WindowState;
  focused: boolean;
  z: number;
}

const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;

/** Offset and scale that map the window onto a target rect (for open/minimize). */
function towards(win: WindowState, target?: DOMRect | { x: number; y: number; width: number; height: number }) {
  if (!target) return { x: 0, y: 40, scale: 0.9 };
  const tx = 'left' in target ? target.left : target.x;
  const ty = 'top' in target ? target.top : target.y;
  return {
    x: tx + target.width / 2 - (win.x + win.width / 2),
    y: ty + target.height / 2 - (win.y + win.height / 2),
    scale: Math.max(0.05, target.width / win.width)
  };
}

/** Pointer-captured drag helper: calls onMove with the offset from the start. */
function useDrag(onMove: (dx: number, dy: number) => void, onStart?: () => void) {
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
      const move = (ev: PointerEvent) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => onMove(ev.clientX - startX, ev.clientY - startY));
      };
      const up = () => {
        cancelAnimationFrame(frame);
        document.body.classList.remove('os-dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [onMove, onStart]
  );
}

export function Window({ win, focused, z }: Props) {
  const { close, focus, minimize, toggleMaximize, setBounds } = useWindows.getState();
  const def = apps[win.app];
  const reduced = useReducedMotion();
  const start = useRef(win);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;

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
      start.current = useWindows.getState().windows[win.id];
      focus(win.id);
    }
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

  const hidden = win.minimized
    ? { ...towards(win, dockTarget()), opacity: 0 }
    : { x: 0, y: 0, scale: 1, opacity: 1 };

  return (
    <motion.section
      role="dialog"
      aria-label={win.title}
      data-focused={focused}
      className="os-window"
      style={{ ...frame, zIndex: z, pointerEvents: win.minimized ? 'none' : undefined }}
      initial={reduced ? { opacity: 0 } : { ...towards(win, win.origin), opacity: 0 }}
      animate={reduced ? { opacity: win.minimized ? 0 : 1 } : hidden}
      exit={reduced ? { opacity: 0 } : { scale: 0.94, opacity: 0, transition: { duration: 0.16 } }}
      transition={spring}
      onPointerDown={() => !focused && focus(win.id)}
    >
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
