import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, isPhone, useFocusedId, useWindows } from '../core/store';
import type { WindowState } from '../core/types';

/** Whether this window is the front one, the one keys and the game loop belong to. */
export function useIsFront(win: WindowState) {
  return useFocusedId() === win.id;
}

/**
 * Asks for a new window size, as a game does for a bigger board. It's kept
 * within the screen, and the window moves if it has to. Phones (where apps
 * are full screen) and zoomed windows keep their size.
 */
export function resizeWindow(win: WindowState, width: number, height: number) {
  if (isPhone() || win.maximized) return;
  const w = Math.min(window.innerWidth - 32, width);
  const h = Math.min(window.innerHeight - MENU_BAR_HEIGHT - DOCK_CLEARANCE, height);
  const x = Math.min(win.x, window.innerWidth - w - 16);
  const y = Math.min(win.y, window.innerHeight - DOCK_CLEARANCE - h);
  useWindows.getState().setBounds(win.id, { x: Math.max(16, x), y: Math.max(MENU_BAR_HEIGHT + 8, y), width: w, height: h });
}
