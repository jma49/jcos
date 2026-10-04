import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { dockable, keepInDock, removeFromDock } from '../core/dock';
import { apps } from '../core/registry';
import { play } from '../core/sound';
import type { AppId } from '../core/types';
import { useDockDrag } from './dockDragState';

// Moving apps in, along and out of the Dock, which draws what this decides
// (dockDragState.ts). None of it is in the first load: Dock.tsx fetches it
// once the desktop has settled, or when an icon is first pressed.
//
// A drag from the Dock: past a few pixels the icon follows the pointer,
// its slot closes up and a gap opens where it would land. Let go over the
// Dock and the icon glides into the gap and stays; off the Dock, a kept app
// goes up in a puff and a running one goes back. Finder's applications
// dragged over the Dock (HTML drag and drop) open the same gap.

/** How far outside the Dock a pointer still counts as over it. */
const DROP_MARGIN = 48;
/** The Dock's flex gap between icons, which a new icon brings with it. */
const ITEM_GAP = 4;
/** How long a dropped icon takes to glide into its place. */
const GLIDE_MS = 190;

interface Ghost {
  app: AppId;
  x: number;
  y: number;
  size: number;
  /** Off the Dock: a kept app would go. */
  leaving: boolean;
  /** Gliding into the gap after a drop. */
  gliding: boolean;
}

const useOverlay = create<{ ghost: Ghost | null; poof: { x: number; y: number; key: number; reduced: boolean } | null }>(() => ({
  ghost: null,
  poof: null
}));

const dock = () => document.querySelector<HTMLElement>('.os-dock');

/** The kept apps' icons in Dock order, leaving out `moving` and any on its way out. */
const keptSlots = (moving?: AppId) =>
  [...(dock()?.querySelectorAll<HTMLElement>('[data-dock-kept]') ?? [])].filter((el) => el.dataset.dockKept !== moving && el.dataset.leaving === undefined);

/** Where a drop at `x` would land: its place among the kept apps (0 is Finder's) and what it lands in front of. */
function placeAt(x: number, moving?: AppId) {
  const slots = keptSlots(moving);
  const before = slots.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2 < x;
  }).length;
  const index = Math.max(1, before);
  return { index, before: (slots[index]?.dataset.dockKept as AppId | undefined) ?? ('end' as const), slots };
}

function overDock(x: number, y: number) {
  const r = dock()?.getBoundingClientRect();
  return !!r && y >= r.top - DROP_MARGIN && x >= r.left - DROP_MARGIN && x <= r.right + DROP_MARGIN;
}

/**
 * Where a dropped icon of `size` will sit once the gap in front of `before`
 * has fully opened: the gap may still be opening, and the Dock, centred on
 * the screen, grows by what's left of it on both sides.
 */
function landingSpot(slots: HTMLElement[], index: number, size: number) {
  const prev = slots[index - 1];
  const next = slots[index] ?? dock()?.querySelector<HTMLElement>('[data-dock-end]');
  if (!prev || !next) return null;
  const p = prev.getBoundingClientRect();
  const open = next.getBoundingClientRect().left - p.right - ITEM_GAP;
  const growth = size + ITEM_GAP - open;
  return { x: p.right - growth / 2 + ITEM_GAP + size / 2, y: p.bottom - size / 2 };
}

/** A release is followed by a click on whatever's under the pointer; only that click is ignored. */
function endDrag() {
  useDockDrag.setState({ justDragged: true });
  setTimeout(() => useDockDrag.setState({ justDragged: false }), 0);
}

/**
 * Puts `app` at `index` in one step, with the gap and the collapsed slot
 * settling at once. Motion draws the slot a frame or two later, so the
 * dragged icon stays over its place until the slot shows, or there'd be a
 * blink with neither.
 */
function commit(app: AppId, index: number) {
  useDockDrag.setState({ instant: true, app: null, from: null, gapBefore: null });
  keepInDock(app, index);
  const settle = (frames: number) =>
    requestAnimationFrame(() => {
      const slot = dock()?.querySelector(`[data-dock-kept="${app}"]`);
      if (frames > 0 && (!slot || slot.getBoundingClientRect().width < 1)) return settle(frames - 1);
      useOverlay.setState({ ghost: null });
      useDockDrag.setState({ instant: false });
    });
  settle(6);
}

function clear() {
  useDockDrag.setState({ app: null, from: null, gapBefore: null });
  useOverlay.setState({ ghost: null });
}

/**
 * A press on a Dock icon that may become a drag. The listeners go on here,
 * possibly after the press (when this module had to be fetched first); a
 * pointer already released by then moves with no buttons down, which ends it.
 */
export function beginDrag(app: AppId, from: 'kept' | 'running', start: { x: number; y: number }, opts: { size: number; reduced: boolean }) {
  if (useOverlay.getState().ghost) return;
  let moving = false;
  const stop = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  const onMove = (e: PointerEvent) => {
    if (e.buttons === 0) {
      stop();
      if (moving) clear();
      return;
    }
    if (!moving && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
    if (!moving) {
      moving = true;
      useDockDrag.setState({ app, from });
    }
    const over = overDock(e.clientX, e.clientY);
    useDockDrag.setState({ gapBefore: over ? placeAt(e.clientX, app).before : null });
    useOverlay.setState({ ghost: { app, x: e.clientX, y: e.clientY, size: opts.size, leaving: !over && from === 'kept', gliding: false } });
  };
  const onUp = (e: PointerEvent) => {
    stop();
    if (!moving) return;
    endDrag();
    if (e.type === 'pointercancel') return clear();
    if (overDock(e.clientX, e.clientY)) {
      const { index, slots } = placeAt(e.clientX, app);
      const spot = opts.reduced ? null : landingSpot(slots, index, opts.size);
      if (!spot) return commit(app, index);
      // Glide into the gap, then take the place for good.
      useOverlay.setState((s) => ({ ghost: s.ghost && { ...s.ghost, ...spot, leaving: false, gliding: true } }));
      setTimeout(() => commit(app, index), GLIDE_MS);
      return;
    }
    if (from === 'kept') {
      removeFromDock(app);
      useOverlay.setState({ poof: { x: e.clientX, y: e.clientY, key: Date.now(), reduced: opts.reduced } });
      play('pop');
    }
    clear();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** An application from Finder over the Dock: a gap opens where it would land. */
export function finderOver(x: number) {
  useDockDrag.setState({ gapBefore: placeAt(x).before });
}

/** An application from Finder dropped on the Dock: it takes the gap at once. */
export function finderDrop(app: string, x: number) {
  if (!dockable(app)) return useDockDrag.setState({ gapBefore: null });
  commit(app, placeAt(x, app).index);
}

/** The dragged icon and the puff, on the desktop itself: the Dock's own translate would pin them to it. */
export function DockOverlay() {
  const { ghost, poof } = useOverlay();
  const root = document.querySelector('.os-root') ?? document.body;
  const Icon = ghost ? apps[ghost.app].Icon : null;
  return createPortal(
    <>
      {ghost && Icon && (
        <div
          className="os-dock-ghost"
          style={{ left: ghost.x, top: ghost.y, width: ghost.size, height: ghost.size }}
          data-leaving={ghost.leaving || undefined}
          data-gliding={ghost.gliding || undefined}
          aria-hidden="true"
        >
          <Icon size={ghost.size} />
        </div>
      )}
      {poof && (
        <span
          key={poof.key}
          className="os-dock-poof"
          style={{ left: poof.x, top: poof.y }}
          data-reduced={poof.reduced || undefined}
          onAnimationEnd={(e) => e.target === e.currentTarget && useOverlay.setState({ poof: null })}
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
    </>,
    root
  );
}
