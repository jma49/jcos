import { describe, expect, test } from 'vitest';
import { isMenuKey, menuStep } from './menuKeys';

// The context menu's keys: the arrows go round its items, Home and End go
// to the ends, and from the menu itself (opened with the pointer) ↓ starts
// at the top and ↑ at the bottom.

describe('menuStep', () => {
  test('↓ and ↑ move one item and go round', () => {
    expect(menuStep('ArrowDown', 0, 4)).toBe(1);
    expect(menuStep('ArrowDown', 3, 4)).toBe(0);
    expect(menuStep('ArrowUp', 2, 4)).toBe(1);
    expect(menuStep('ArrowUp', 0, 4)).toBe(3);
  });

  test('Home and End go to the first and last item', () => {
    expect(menuStep('Home', 2, 4)).toBe(0);
    expect(menuStep('End', 0, 4)).toBe(3);
  });

  test('from the menu itself, ↓ is the first item and ↑ the last', () => {
    expect(menuStep('ArrowDown', -1, 4)).toBe(0);
    expect(menuStep('ArrowUp', -1, 4)).toBe(3);
  });

  test('other keys, and a menu with nothing to choose, move nothing', () => {
    expect(menuStep('Enter', 1, 4)).toBeNull();
    expect(menuStep('a', 1, 4)).toBeNull();
    expect(menuStep('ArrowDown', -1, 0)).toBeNull();
    expect(menuStep('End', -1, 0)).toBeNull();
  });
});

describe('isMenuKey', () => {
  test('Shift+F10 and the context-menu key; not F10 alone', () => {
    expect(isMenuKey({ key: 'F10', shiftKey: true })).toBe(true);
    expect(isMenuKey({ key: 'ContextMenu', shiftKey: false })).toBe(true);
    expect(isMenuKey({ key: 'F10', shiftKey: false })).toBe(false);
    expect(isMenuKey({ key: 'ArrowDown', shiftKey: true })).toBe(false);
  });
});
