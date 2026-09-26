import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, isPhone, useWindows } from '../core/store';
import type { Rect, WindowState } from '../core/types';

const PAD = 48;
const GAP = 28;
/** Room under each window for its title. */
const LABEL = 26;
/** How long the pointer rests in the bottom-left corner before Exposé opens. */
const CORNER_DELAY = 250;

/** The rect a window occupies on screen, whether or not it is maximized. */
export function frameOf(win: WindowState): Rect {
  if (win.maximized) {
    return {
      x: 8,
      y: MENU_BAR_HEIGHT + 8,
      width: window.innerWidth - 16,
      height: window.innerHeight - MENU_BAR_HEIGHT - DOCK_CLEARANCE
    };
  }
  return { x: win.x, y: win.y, width: win.width, height: win.height };
}

/**
 * Where each visible window goes in Exposé: a grid that keeps the windows as
 * large as possible (never larger than they are), filled in the order they
 * sit on screen so they fan out instead of crossing over each other.
 */
export function exposeLayout(windows: WindowState[]): Record<string, Rect> {
  const items = windows.filter((w) => !w.minimized).map((w) => ({ id: w.id, rect: frameOf(w) }));
  if (items.length === 0) return {};

  const area = {
    x: PAD,
    y: MENU_BAR_HEIGHT + PAD,
    width: window.innerWidth - PAD * 2,
    height: window.innerHeight - MENU_BAR_HEIGHT - DOCK_CLEARANCE - PAD * 2
  };
  const scaleIn = (rect: Rect, cellW: number, cellH: number) =>
    Math.min(1, (cellW - GAP) / rect.width, (cellH - GAP - LABEL) / rect.height);

  // Pick the column count that leaves the windows the most screen area.
  let cols = 1;
  let best = -1;
  for (let c = 1; c <= items.length; c++) {
    const rows = Math.ceil(items.length / c);
    const cellW = area.width / c;
    const cellH = area.height / rows;
    const covered = items.reduce((sum, { rect }) => sum + (scaleIn(rect, cellW, cellH) * rect.width) ** 2, 0);
    if (covered > best) {
      best = covered;
      cols = c;
    }
  }

  const rows = Math.ceil(items.length / cols);
  const cellW = area.width / cols;
  const cellH = area.height / rows;
  const centerY = (r: Rect) => r.y + r.height / 2;
  const centerX = (r: Rect) => r.x + r.width / 2;
  const sorted = [...items].sort((a, b) => centerY(a.rect) - centerY(b.rect));

  const layout: Record<string, Rect> = {};
  for (let row = 0; row < rows; row++) {
    const line = sorted.slice(row * cols, row * cols + cols).sort((a, b) => centerX(a.rect) - centerX(b.rect));
    // Centre a short last row.
    const offset = ((cols - line.length) * cellW) / 2;
    line.forEach(({ id, rect }, col) => {
      const scale = scaleIn(rect, cellW, cellH);
      const width = rect.width * scale;
      const height = rect.height * scale;
      layout[id] = {
        x: area.x + offset + col * cellW + (cellW - width) / 2,
        y: area.y + row * cellH + (cellH - LABEL - height) / 2,
        width,
        height
      };
    });
  }
  return layout;
}

/** Opens Exposé when the pointer rests in the bottom-left screen corner. */
function useHotCorner() {
  useEffect(() => {
    let timer = 0;
    let armed = true;
    const onMove = (e: PointerEvent) => {
      const inCorner = e.clientX <= 2 && e.clientY >= window.innerHeight - 3;
      if (!inCorner) {
        clearTimeout(timer);
        timer = 0;
        armed = true;
        return;
      }
      if (!armed || timer || isPhone()) return;
      timer = window.setTimeout(() => {
        armed = false;
        timer = 0;
        const s = useWindows.getState();
        s.setExpose(!s.exposeOpen);
      }, CORNER_DELAY);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      clearTimeout(timer);
    };
  }, []);
}

/** The dimmed backdrop and window titles shown while Exposé is open. */
export function Expose({ layout }: { layout: Record<string, Rect> | null }) {
  const windows = useWindows((s) => s.windows);
  useHotCorner();

  return (
    <AnimatePresence>
      {layout && (
        <motion.div
          key="expose"
          className="os-expose"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => useWindows.getState().setExpose(false)}
        >
          {Object.entries(layout).map(([id, rect]) => (
            <span
              key={id}
              className="os-expose-label"
              style={{ left: rect.x + rect.width / 2, top: rect.y + rect.height + 8 }}
            >
              {windows[id]?.title}
            </span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
