import { describe, expect, test } from 'vitest';
import { exposeLayout } from './exposeLayout';
import type { Rect, WindowState } from '../core/types';

// Exposé's grid: inside the desktop for the browser's size it's given,
// windows no larger than they are, and laid out again for a smaller size.

const win = (id: string, rect: Partial<Rect>, rest: Partial<WindowState> = {}): WindowState =>
  ({ id, app: 'about', title: id, x: 100, y: 100, width: 600, height: 400, minimized: false, maximized: false, ...rect, ...rest }) as WindowState;

const windows = [
  win('a', { x: 100, y: 100, width: 600, height: 400 }),
  win('b', { x: 400, y: 200, width: 800, height: 500 }),
  win('c', { x: 50, y: 300, width: 300, height: 300 })
];

/** The desktop Exposé may use: inside the padding, between the menu bar and the Dock. */
const area = (vw: number, vh: number) => ({ left: 48, top: 22 + 48, right: vw - 48, bottom: vh - 78 - 48 });
const inside = (r: Rect, { left, top, right, bottom }: ReturnType<typeof area>) =>
  r.x >= left && r.y >= top && r.x + r.width <= right && r.y + r.height <= bottom;

describe('exposeLayout', () => {
  test('lays the windows out inside the desktop, no larger than they are', () => {
    const layout = exposeLayout(windows, { width: 1280, height: 800 });
    expect(Object.keys(layout).sort()).toEqual(['a', 'b', 'c']);
    for (const w of windows) {
      expect(inside(layout[w.id], area(1280, 800))).toBe(true);
      expect(layout[w.id].width).toBeLessThanOrEqual(w.width);
      expect(layout[w.id].width / layout[w.id].height).toBeCloseTo(w.width / w.height, 5);
    }
  });

  test('a smaller browser gets a grid of its own', () => {
    const large = exposeLayout(windows, { width: 1280, height: 800 });
    const small = exposeLayout(windows, { width: 900, height: 600 });
    for (const w of windows) expect(inside(small[w.id], area(900, 600))).toBe(true);
    expect(small).not.toEqual(large);
    expect(windows.some((w) => !inside(large[w.id], area(900, 600)))).toBe(true);
  });

  test('a zoomed window is laid out at its zoomed size, and minimized ones are left out', () => {
    const layout = exposeLayout([win('z', {}, { maximized: true }), win('m', {}, { minimized: true })], { width: 1280, height: 800 });
    expect(Object.keys(layout)).toEqual(['z']);
    expect(layout.z.width / layout.z.height).toBeCloseTo(1264 / 700, 5);
    expect(exposeLayout([], { width: 1280, height: 800 })).toEqual({});
  });
});
