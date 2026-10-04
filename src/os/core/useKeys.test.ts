import { beforeAll, describe, expect, test } from 'vitest';

// Whose a key is: the app in front, or the element that has focus. The
// desktop is a tree of plain nodes that answer `closest` for the selectors
// the helpers use, since the unit tests have no DOM.

type Keys = typeof import('./useKeys');
let keys: Keys;

class Node {
  parent: Node | null = null;
  children: Node[] = [];
  constructor(
    public tag: string,
    public attrs: Record<string, string> = {}
  ) {}
  add(...nodes: Node[]) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
    return this;
  }
  /** Tag, classes and attributes, as `.os-window[data-focused="true"]` or `input`; a list matches any. */
  matches(selector: string): boolean {
    return selector.split(',').some((one) => {
      const m = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(one.trim());
      if (!m) throw new Error(`unsupported selector: ${one}`);
      const [, tag, classes, attrs] = m;
      if (tag && tag !== this.tag) return false;
      const own = (this.attrs.class ?? '').split(' ');
      if (
        !classes
          .split('.')
          .filter(Boolean)
          .every((c) => own.includes(c))
      )
        return false;
      return [...attrs.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) =>
        value === undefined ? name in this.attrs : this.attrs[name] === value
      );
    });
  }
  closest(selector: string): Node | null {
    let n: Node | null = this;
    while (n && !n.matches(selector)) n = n.parent;
    return n;
  }
}

const body = new Node('body');
const el = (tag: string, attrs?: Record<string, string>) => new Node(tag, attrs);

// The menu bar and the Dock, a Finder window in front with a search field
// and a Get Info drawer, a Photos window behind, and DVD Player's
// Controller floating on the desktop.
const menuButton = el('button', { class: 'os-menu-title' });
const dockItem = el('button', { class: 'os-dock-item' });
const finderClose = el('button', { class: 'os-control os-close' });
const finderItem = el('button');
const finderSearch = el('input', { type: 'search' });
const drawerNotes = el('textarea');
const otherClose = el('button', { class: 'os-control os-close' });
const panelButton = el('button');
const panelSlider = el('input', { type: 'range' });
const editable = el('div', { contenteditable: 'true' });
const inEditable = el('span');
body.add(
  el('nav').add(menuButton),
  el('section', { class: 'os-window', 'data-focused': 'true' }).add(
    el('header', { class: 'os-titlebar' }).add(finderClose),
    el('div', { class: 'os-body' }).add(finderItem, finderSearch, editable.add(inEditable)),
    el('aside', { class: 'os-drawer' }).add(drawerNotes)
  ),
  el('section', { class: 'os-window', 'data-focused': 'false' }).add(el('header', { class: 'os-titlebar' }).add(otherClose)),
  el('div', { class: 'os-dvd-controller', 'data-panel': '' }).add(panelButton, panelSlider),
  el('nav').add(dockItem)
);

const press = (target: Node | null, key: string, mods: Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey'>> = {}) =>
  ({ target, key, metaKey: false, ctrlKey: false, altKey: false, ...mods }) as unknown as KeyboardEvent;

beforeAll(async () => {
  Object.assign(globalThis, {
    window: { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) },
    document: { body },
    Element: Node
  });
  keys = await import('./useKeys');
});

describe('typing', () => {
  test('a text field, a select and anything editable', () => {
    expect(keys.typing(press(finderSearch, 'a'))).toBe(true);
    expect(keys.typing(press(drawerNotes, 'a'))).toBe(true);
    expect(keys.typing(press(el('select'), 'a'))).toBe(true);
    expect(keys.typing(press(editable, 'a'))).toBe(true);
    expect(keys.typing(press(inEditable, 'a'))).toBe(true);
  });

  test('not a button, and not the page itself', () => {
    expect(keys.typing(press(finderItem, 'a'))).toBe(false);
    expect(keys.typing(press(body, 'a'))).toBe(false);
  });
});

describe('ownsKey', () => {
  test("a key pressed on the page itself, or inside the front window, is the app's", () => {
    expect(keys.ownsKey(press(body, 'Enter'))).toBe(true);
    expect(keys.ownsKey(press(finderItem, 'Enter'))).toBe(true);
    expect(keys.ownsKey(press(finderItem, ' '))).toBe(true);
    expect(keys.ownsKey(press(finderItem, 'ArrowDown'))).toBe(true);
  });

  test('a control outside the window keeps its own keys', () => {
    expect(keys.ownsKey(press(dockItem, 'Enter'))).toBe(false);
    expect(keys.ownsKey(press(dockItem, ' '))).toBe(false);
    expect(keys.ownsKey(press(menuButton, 'Enter'))).toBe(false);
    expect(keys.ownsKey(press(menuButton, 'ArrowDown'))).toBe(false);
    expect(keys.ownsKey(press(otherClose, 'Enter'))).toBe(false);
    expect(keys.ownsKey(press(dockItem, 'Escape'))).toBe(false);
  });

  test("the window's own close box is the shell's, not the app's", () => {
    expect(keys.ownsKey(press(finderClose, 'Enter'))).toBe(false);
    expect(keys.ownsKey(press(finderClose, ' '))).toBe(false);
  });

  test('a panel the app draws outside its window counts as inside', () => {
    expect(keys.ownsKey(press(panelButton, 'ArrowLeft'))).toBe(true);
    expect(keys.ownsKey(press(panelButton, ' '))).toBe(true);
    // Its slider is a field: tabbed to, it keeps the arrows.
    expect(keys.ownsKey(press(panelSlider, 'ArrowLeft'))).toBe(false);
  });

  test('in a text field a key types, ⌥ with a key included; only ⌘ gets through', () => {
    expect(keys.ownsKey(press(finderSearch, 'Enter'))).toBe(false);
    expect(keys.ownsKey(press(finderSearch, 'ArrowDown'))).toBe(false);
    expect(keys.ownsKey(press(finderSearch, '2', { altKey: true }))).toBe(false);
    expect(keys.ownsKey(press(drawerNotes, 'n', { altKey: true }))).toBe(false);
    expect(keys.ownsKey(press(inEditable, 'w', { altKey: true }))).toBe(false);
    expect(keys.ownsKey(press(drawerNotes, 's', { metaKey: true }))).toBe(true);
    expect(keys.ownsKey(press(finderSearch, '[', { metaKey: true }))).toBe(true);
  });

  test('a ⌘ or ⌥ shortcut works wherever focus is, as a menu command does', () => {
    expect(keys.ownsKey(press(dockItem, 'n', { altKey: true }))).toBe(true);
    expect(keys.ownsKey(press(menuButton, '1', { altKey: true }))).toBe(true);
    expect(keys.ownsKey(press(otherClose, 's', { metaKey: true }))).toBe(true);
    expect(keys.ownsKey(press(dockItem, 'ArrowUp', { ctrlKey: true }))).toBe(true);
  });
});
