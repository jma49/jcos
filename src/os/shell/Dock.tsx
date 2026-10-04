import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { m, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { apps, dockApps, launch, mobileDockApps, rectOf } from '../core/registry';
import { APP_MIME, canRemoveFromDock, dockable, keepInDock, removeFromDock, useDock } from '../core/dock';
import { DashboardIcon, TrashIcon } from '../core/icons';
import { report } from '../core/report';
import { isPhone, useWindowList, useWindows } from '../core/store';
import { DOCK_MAGNIFY, DOCK_SIZES, useReduceMotion, useSystem } from '../core/system';
import { play } from '../core/sound';
import type { AppId } from '../core/types';
import { afterSettled } from '../core/warmUp';
import { useChatBadge } from '../social/chatState';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useDockDrag } from './dockDragState';

/** How far from the pointer icons start to grow. */
const REACH = 150;
/** The Dock's flex gap between icons, which a slot takes back as it closes. */
const ITEM_GAP = 4;
/** How slots open and close (a gap for a drop, an app arriving or leaving): one spring, so a slot closing as a gap opens keeps the Dock still. */
const SLIDE = { stiffness: 300, damping: 30, mass: 0.7 };
/** How long a leaving slot is kept while it closes. */
const LEAVE_MS = 450;

// Moving apps in and out (dockDrag.tsx) isn't needed for the first paint:
// it's fetched once the desktop has settled, or on the first press.
type DragModule = typeof import('./dockDrag');
let dragModule: DragModule | null = null;
const loadDrag = () => import('./dockDrag').then((mod) => (dragModule = mod));

/** The Dock's resting and magnified icon sizes, from System Preferences. */
function useDockSizes() {
  const base = DOCK_SIZES[useSystem((s) => s.dockSize)];
  const magnify = useSystem((s) => s.magnify);
  return { base, peak: magnify ? base + DOCK_MAGNIFY : base };
}

/**
 * `items` plus the ones that have just left, kept for a moment where they
 * were (marked leaving) so their slots can close rather than vanish.
 */
function useLeaving<T>(items: T[], keyOf: (item: T) => string) {
  const shown = useRef<{ item: T; leaving: boolean }[]>([]);
  const since = useRef(new Map<string, number>());
  const [, expire] = useState(0);
  const now = performance.now();
  const keys = new Set(items.map(keyOf));
  const merged = items.map((item) => ({ item, leaving: false }));
  for (const key of keys) since.current.delete(key);
  shown.current.forEach((s, i) => {
    const key = keyOf(s.item);
    if (keys.has(key)) return;
    const left = since.current.get(key) ?? now;
    since.current.set(key, left);
    if (now - left < LEAVE_MS) merged.splice(Math.min(i, merged.length), 0, { item: s.item, leaving: true });
    else since.current.delete(key);
  });
  const anyLeaving = merged.some((s) => s.leaving);
  useEffect(() => {
    shown.current = merged;
    if (!anyLeaving) return;
    const timer = setTimeout(() => expire((n) => n + 1), LEAVE_MS);
    return () => clearTimeout(timer);
  });
  return merged;
}

/**
 * One Dock slot that grows as the pointer gets closer (macOS-style
 * magnification). It also opens and closes on a spring: `collapsed` while
 * its icon is dragged or it's leaving, `gap` when a drop would land in
 * front of it, and from nothing when it arrives after the Dock is drawn.
 */
function Magnified({
  mouseX,
  layout,
  label,
  running,
  badge,
  onActivate,
  onMenu,
  children,
  dataApp,
  onPress,
  kept,
  end,
  collapsed = false,
  leaving = false,
  gap = false,
  arrive = false,
  instant = false,
  reduced = false,
  mobile = false
}: {
  mouseX: MotionValue<number>;
  /** Bumped when icons move without the pointer moving (a drop), so magnification catches up. */
  layout: MotionValue<number>;
  label: string;
  running?: boolean;
  /** A red count on the icon, like Mail's. */
  badge?: number;
  /** A right-click (or long press) on the icon. */
  onMenu?: (at: { x: number; y: number }) => void;
  onActivate: (el: HTMLElement) => void;
  children: (size: number) => React.ReactNode;
  dataApp?: string;
  /** A press that may become a drag (moving it within, into or out of the Dock). */
  onPress?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** For an app kept in the Dock: its id, which drops are placed around. */
  kept?: AppId;
  /** The slot after the kept apps, where a gap at the end opens. */
  end?: boolean;
  collapsed?: boolean;
  leaving?: boolean;
  gap?: boolean;
  /** Opens from nothing when it first appears. */
  arrive?: boolean;
  /** Settles at once instead of on the spring. */
  instant?: boolean;
  reduced?: boolean;
  /** Whether the slot stays in the compact phone Dock. */
  mobile?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { base, peak } = useDockSizes();
  const distance = useTransform([mouseX, layout], ([x]: number[]) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const target = useTransform(distance, [-REACH, 0, REACH], [base, peak, base], { clamp: true });
  const size = useSpring(target, { stiffness: 380, damping: 28, mass: 0.4 });

  const closed = collapsed || leaving;
  // Decided when the slot first renders: whether it opens from nothing. It
  // starts closed then, since motion writes styles a frame later and a slot
  // drawn open first would flash.
  const growIn = useRef(arrive && !instant && !reduced);
  const presence = useSpring(closed || growIn.current ? 0 : 1, SLIDE);
  const opening = useSpring(gap ? 1 : 0, SLIDE);

  const width = useTransform([size, presence], ([s, p]: number[]) => s * p);
  // A closed slot gives back the flex gap next to it, so it takes no room at all.
  const marginRight = useTransform(presence, [0, 1], [-ITEM_GAP, 0]);
  const marginLeft = useTransform(opening, [0, 1], [0, base + ITEM_GAP]);

  // After the transforms above: they subscribe again on every render, and a
  // jump made before they have would go unnoticed until the next render.
  const wasClosed = useRef(closed);
  useLayoutEffect(() => {
    const settle = instant || reduced;
    // A dropped icon lands at the size of the gap it fills, whatever its
    // magnification was where it came from; it then grows with the rest.
    if (instant && wasClosed.current && !closed) size.jump(base);
    wasClosed.current = closed;
    if (settle) presence.jump(closed ? 0 : 1);
    else presence.set(closed ? 0 : 1);
    if (settle) opening.jump(gap ? 1 : 0);
    else opening.set(gap ? 1 : 0);
  }, [closed, gap, instant, reduced, presence, opening, size, base]);

  return (
    <m.button
      ref={ref}
      type="button"
      className="os-dock-item"
      style={{ width, height: size, marginLeft, marginRight }}
      onClick={() => ref.current && onActivate(ref.current)}
      onPointerDown={onPress}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY - 8 });
      }}
      aria-label={badge ? `${label}, ${badge} new` : label}
      aria-hidden={leaving || undefined}
      tabIndex={leaving ? -1 : undefined}
      data-dock-app={dataApp}
      data-mobile={mobile || undefined}
      data-collapsed={closed || undefined}
      data-leaving={leaving || undefined}
      data-dock-kept={kept}
      data-dock-end={end || undefined}
    >
      <span className="os-dock-label">{label}</span>
      <m.span className="os-dock-icon" style={{ width, height: width, opacity: presence }}>
        {children(peak)}
      </m.span>
      {running && <span className="os-dock-dot" />}
      {badge ? (
        <span className="os-dock-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </m.button>
  );
}

export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const layout = useMotionValue(0);
  const { base } = useDockSizes();
  const reduced = useReduceMotion();
  const windows = useWindowList();
  const running = new Set(windows.map((w) => w.app));
  const chatBadge = useChatBadge();
  const badgeOf = (app: AppId) => (app === 'chat' ? chatBadge : 0);
  const stored = useDock((s) => s.apps);
  // Phones keep their own short Dock; the visitor's arrangement is for desktops.
  const phone = isPhone();
  const kept = phone ? dockApps : stored;
  const dragging = useDockDrag((s) => s.app);
  const draggingFrom = useDockDrag((s) => s.from);
  const gapBefore = useDockDrag((s) => s.gapBefore);
  const instant = useDockDrag((s) => s.instant);

  // Open apps that aren't kept in the Dock get a slot on the right while they
  // run, as on a Mac: one per app, or one per window for project pages.
  const visiting: { key: string; app: AppId; label: string; id?: string }[] = [];
  for (const w of windows) {
    if (kept.includes(w.app) || apps[w.app].noDock) continue;
    if (w.app === 'project') visiting.push({ key: w.id, app: w.app, label: w.title, id: w.id });
    else if (!visiting.some((v) => v.app === w.app)) visiting.push({ key: w.app, app: w.app, label: apps[w.app].name });
  }
  const keptShown = useLeaving(kept, (app) => app);
  const visitingShown = useLeaving(visiting, (v) => v.key);

  // Slots that appear once the Dock is drawn (kept, or an app opened) open
  // from nothing; the ones there at first just are.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const [drag, setDrag] = useState(dragModule);
  const withDrag = (run: (mod: DragModule) => void) => {
    if (dragModule) return run(dragModule);
    loadDrag().then((mod) => {
      setDrag(mod);
      run(mod);
    }, (error) => report(error, 'dock.drag'));
  };
  useEffect(() => {
    if (phone || dragModule) return;
    return afterSettled(() => loadDrag().then(setDrag));
  }, [phone]);

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const dock = useRef<HTMLDivElement>(null);

  /** A press on a kept or running app's icon, which becomes a drag past a few pixels. */
  const press = (app: AppId, from: 'kept' | 'running') => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch' || phone) return;
    if (from === 'kept' ? !canRemoveFromDock(app) : !dockable(app)) return;
    const start = { x: e.clientX, y: e.clientY };
    withDrag((mod) => {
      setMenu(null);
      mod.beginDrag(app, from, start, { size: base, reduced });
    });
  };

  /** The Dock menu for an app: its windows, then what can be done with it. */
  const menuFor = (app: AppId): ContextMenuItem[] => {
    const { windows: all, order, focus, minimize, close } = useWindows.getState();
    const mine = order.map((id) => all[id]).filter((w) => w && w.app === app);
    const def = apps[app];
    const inDock = kept.includes(app);
    return [
      ...mine.map((w) => ({ label: `${w.minimized ? '◇ ' : ''}${w.title}`, action: () => focus(w.id) })),
      ...(mine.length ? [{ label: '', divider: true }] : []),
      ...(mine.length ? [] : [{ label: 'Open', action: () => launch(app) }]),
      ...(def.inApplications || def.applet
        ? [{ label: 'Show in Finder', action: () => launch('finder', { props: { path: def.applet ? '/Applets' : '/Applications' } }) }]
        : []),
      ...(phone
        ? []
        : inDock
          ? canRemoveFromDock(app)
            ? [{ label: 'Remove from Dock', action: () => removeFromDock(app) }]
            : []
          : dockable(app)
            ? [{ label: 'Keep in Dock', action: () => keepInDock(app, kept.length) }]
            : []),
      ...(mine.length
        ? [
            { label: 'Hide', disabled: mine.every((w) => w.minimized), action: () => mine.forEach((w) => !w.minimized && minimize(w.id)) },
            { label: 'Quit', action: () => mine.forEach((w) => close(w.id)) }
          ]
        : [])
    ];
  };
  const openMenu = (items: ContextMenuItem[]) => (at: { x: number; y: number }) => setMenu({ ...at, items });

  const activate = (app: AppId, el: HTMLElement) => {
    const open = Object.values(useWindows.getState().windows).filter((w) => w.app === app);
    if (open.length) {
      // Bring the app's most recent window forward (restoring it if minimized).
      const { order, focus } = useWindows.getState();
      const latest = [...order].reverse().find((id) => open.some((w) => w.id === id));
      if (latest) focus(latest);
      return;
    }
    launch(app, { origin: rectOf(el) });
  };

  // Once a drop has settled, the icons measure where they now are, so the
  // magnification around the pointer follows (on its spring) without a move.
  useEffect(() => {
    if (!instant) layout.set(layout.get() + 1);
  }, [instant, layout]);

  const motion = { instant, reduced, arrive: ready };

  return (
    <nav className="os-dock-wrap" aria-label="Dock">
      <m.div
        ref={dock}
        className="os-dock"
        style={{ '--dock-icon': `${base}px` } as React.CSSProperties}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        onClickCapture={(e) => {
          if (!useDockDrag.getState().justDragged) return;
          e.stopPropagation();
          e.preventDefault();
        }}
        onDragOver={(e) => {
          if (phone || !e.dataTransfer.types.includes(APP_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          const x = e.clientX;
          withDrag((mod) => mod.finderOver(x));
        }}
        onDragLeave={(e) => {
          if (!dock.current?.contains(e.relatedTarget as Node)) useDockDrag.setState({ gapBefore: null });
        }}
        onDrop={(e) => {
          const app = e.dataTransfer.getData(APP_MIME);
          if (!app) return;
          e.preventDefault();
          const x = e.clientX;
          withDrag((mod) => mod.finderDrop(app, x));
        }}
      >
        {keptShown.map(({ item: app, leaving }) => {
          const { Icon, name } = apps[app];
          return (
            <Magnified
              key={app}
              mouseX={mouseX}
              layout={layout}
              label={name}
              running={running.has(app)}
              badge={badgeOf(app)}
              onMenu={(at) => openMenu(menuFor(app))(at)}
              dataApp={app}
              kept={app}
              mobile={mobileDockApps.includes(app)}
              collapsed={dragging === app && draggingFrom === 'kept'}
              leaving={leaving}
              gap={gapBefore === app}
              {...motion}
              onActivate={(el) => activate(app, el)}
              onPress={press(app, 'kept')}
            >
              {(s) => <Icon size={s} />}
            </Magnified>
          );
        })}

        <Magnified
          mouseX={mouseX}
          layout={layout}
          label="Dashboard"
          mobile
          end
          gap={gapBefore === 'end'}
          {...motion}
          arrive={false}
          onActivate={() => {
            const { dashboardOpen, setDashboard } = useWindows.getState();
            setDashboard(!dashboardOpen);
          }}
        >
          {(s) => <DashboardIcon size={s} />}
        </Magnified>

        <span className="os-dock-divider" aria-hidden="true" data-dock-minimized />

        {visitingShown.map(({ item: v, leaving }) => {
          const { Icon } = apps[v.app];
          return (
            <Magnified
              key={v.key}
              mouseX={mouseX}
              layout={layout}
              label={v.label}
              running
              badge={v.id ? 0 : badgeOf(v.app)}
              collapsed={!v.id && dragging === v.app && draggingFrom === 'running'}
              leaving={leaving}
              {...motion}
              onMenu={(at) =>
                openMenu(
                  v.id
                    ? [
                        { label: 'Show', action: () => useWindows.getState().focus(v.id!) },
                        { label: 'Close', action: () => useWindows.getState().close(v.id!) }
                      ]
                    : menuFor(v.app)
                )(at)
              }
              dataApp={v.id ? undefined : v.app}
              onActivate={(el) => (v.id ? useWindows.getState().focus(v.id) : activate(v.app, el))}
              onPress={v.id ? undefined : press(v.app, 'running')}
            >
              {(s) => <Icon size={s} />}
            </Magnified>
          );
        })}

        <Magnified
          mouseX={mouseX}
          layout={layout}
          label="Trash"
          onActivate={() => play('trash')}
          onMenu={openMenu([{ label: 'Empty Trash', action: () => play('trash') }])}
        >
          {(s) => <TrashIcon size={s} />}
        </Magnified>
      </m.div>
      {drag && <drag.DockOverlay />}
      {menu && <ContextMenu at={menu} items={menu.items} onClose={() => setMenu(null)} label="Dock" />}
    </nav>
  );
}
