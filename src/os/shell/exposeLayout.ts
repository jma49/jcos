import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, zoomedFrame, type Viewport } from '../core/store';
import type { Rect, WindowState } from '../core/types';

// Where Exposé puts the windows, for the browser's size at the time: worked
// out again whenever that changes while it's open (WindowLayer in
// Desktop.tsx). A plain module, with no React in it, so it can be tested.

const PAD = 48;
const GAP = 28;
/** Room under each window for its title. */
const LABEL = 26;

/** The rect a window occupies on screen, whether or not it is zoomed. */
function frameOf(win: WindowState, viewport: Viewport): Rect {
  return win.maximized ? zoomedFrame(viewport) : { x: win.x, y: win.y, width: win.width, height: win.height };
}

/**
 * Where each visible window goes in Exposé: a grid that keeps the windows as
 * large as possible (never larger than they are), filled in the order they
 * sit on screen so they fan out instead of crossing over each other.
 */
export function exposeLayout(windows: WindowState[], viewport: Viewport): Record<string, Rect> {
  const items = windows.filter((w) => !w.minimized).map((w) => ({ id: w.id, rect: frameOf(w, viewport) }));
  if (items.length === 0) return {};

  const area = {
    x: PAD,
    y: MENU_BAR_HEIGHT + PAD,
    width: viewport.width - PAD * 2,
    height: viewport.height - MENU_BAR_HEIGHT - DOCK_CLEARANCE - PAD * 2
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
