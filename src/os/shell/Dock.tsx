import { Fragment, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { apps, dockApps, launch, mobileDockApps, rectOf } from '../core/registry';
import { APP_MIME, canRemoveFromDock, dockable, keepInDock, removeFromDock, useDock } from '../core/dock';
import { DashboardIcon, TrashIcon } from '../core/icons';
import { isPhone, useWindowList, useWindows } from '../core/store';
import { DOCK_MAGNIFY, DOCK_SIZES, useSystem } from '../core/system';
import { play } from '../core/sound';
import type { AppId } from '../core/types';
import { useChatBadge } from '../social/chatState';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

/** How far from the pointer icons start to grow. */
const REACH = 150;

/** The Dock's resting and magnified icon sizes, from System Preferences. */
function useDockSizes() {
  const base = DOCK_SIZES[useSystem((s) => s.dockSize)];
  const magnify = useSystem((s) => s.magnify);
  return { base, peak: magnify ? base + DOCK_MAGNIFY : base };
}

/** One Dock slot that grows as the pointer gets closer (macOS-style magnification). */
function Magnified({
  mouseX,
  label,
  running,
  badge,
  onActivate,
  onMenu,
  children,
  dataApp,
  onDragStart,
  kept,
  hidden = false,
  mobile = false
}: {
  mouseX: MotionValue<number>;
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
  onDragStart?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** For an app kept in the Dock: its id, which drops are placed around. */
  kept?: AppId;
  /** While it's being dragged: the slot stays for the magnification but shows nothing. */
  hidden?: boolean;
  /** Whether the slot stays in the compact phone Dock. */
  mobile?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { base, peak } = useDockSizes();
  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const target = useTransform(distance, [-REACH, 0, REACH], [base, peak, base], { clamp: true });
  const size = useSpring(target, { stiffness: 380, damping: 28, mass: 0.4 });

  return (
    <m.button
      ref={ref}
      type="button"
      className="os-dock-item"
      style={{ width: size, height: size }}
      onClick={() => ref.current && onActivate(ref.current)}
      onPointerDown={onDragStart}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY - 8 });
      }}
      aria-label={badge ? `${label}, ${badge} new` : label}
      data-dock-app={dataApp}
      data-mobile={mobile || undefined}
      data-dragging={hidden || undefined}
      data-dock-kept={kept}
    >
      <span className="os-dock-label">{label}</span>
      <m.span className="os-dock-icon" style={{ width: size, height: size }}>
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

/** A drag of a Dock icon: which app, from where, and where it would land. */
interface Drag {
  app: AppId;
  from: 'kept' | 'running';
  x: number;
  y: number;
  /** Over the Dock (it would stay or be kept) rather than off it (it would go). */
  over: boolean;
  /** Where among the kept apps it would land (0 is Finder's place). */
  index: number;
}

/** Renders on the desktop itself, where the OS's styles still apply. */
const overlay = (node: React.ReactNode) => createPortal(node, document.querySelector('.os-root') ?? document.body);

/** How far above the Dock a released icon still counts as dropped on it. */
const DROP_MARGIN = 48;

export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const { base } = useDockSizes();
  const windows = useWindowList();
  const running = new Set(windows.map((w) => w.app));
  const chatBadge = useChatBadge();
  const badgeOf = (app: AppId) => (app === 'chat' ? chatBadge : 0);
  const stored = useDock((s) => s.apps);
  // Phones keep their own short Dock; the visitor's arrangement is for desktops.
  const phone = isPhone();
  const kept = phone ? dockApps : stored;
  // Open apps that aren't kept in the Dock get a slot on the right while they
  // run, as on a Mac: one per app, or one per window for project pages.
  const visiting: { key: string; app: AppId; label: string; id?: string }[] = [];
  for (const w of windows) {
    if (kept.includes(w.app) || apps[w.app].noDock) continue;
    if (w.app === 'project') visiting.push({ key: w.id, app: w.app, label: w.title, id: w.id });
    else if (!visiting.some((v) => v.app === w.app)) visiting.push({ key: w.app, app: w.app, label: apps[w.app].name });
  }

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Where a dragged icon went up in smoke. */
  const [poof, setPoof] = useState<{ x: number; y: number; key: number } | null>(null);
  /** Where an application dragged in from Finder would land. */
  const [incoming, setIncoming] = useState<number | null>(null);
  const dock = useRef<HTMLDivElement>(null);
  /** Set when a drag ends, so the click that follows doesn't open the app. */
  const dragged = useRef(false);

  /** Where among the kept apps a pointer at `x` would drop, not counting `moving`. */
  const indexAt = (x: number, moving?: AppId) => {
    const slots = [...(dock.current?.querySelectorAll<HTMLElement>('[data-dock-kept]') ?? [])].filter(
      (el) => el.dataset.dockKept !== moving
    );
    const before = slots.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2 < x;
    }).length;
    return Math.max(1, before);
  };
  const overDock = (x: number, y: number) => {
    const r = dock.current?.getBoundingClientRect();
    return !!r && y >= r.top - DROP_MARGIN && x >= r.left - DROP_MARGIN && x <= r.right + DROP_MARGIN;
  };

  /** A press on a kept or running app's icon: past a few pixels it's a drag. */
  const startDrag = (app: AppId, from: Drag['from']) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch' || phone) return;
    if (from === 'kept' && !canRemoveFromDock(app)) return;
    if (from === 'running' && !dockable(app)) return;
    const start = { x: e.clientX, y: e.clientY };
    let moving = false;
    const onMove = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moving = true;
      setMenu(null);
      setDrag({ app, from, x: ev.clientX, y: ev.clientY, over: overDock(ev.clientX, ev.clientY), index: indexAt(ev.clientX, app) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!moving) return;
      dragged.current = true;
      setDrag(null);
      if (ev.type === 'pointercancel') return;
      if (overDock(ev.clientX, ev.clientY)) keepInDock(app, indexAt(ev.clientX, app));
      else if (from === 'kept') {
        removeFromDock(app);
        setPoof({ x: ev.clientX, y: ev.clientY, key: Date.now() });
        play('pop');
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
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

  // While something is dragged over the Dock, a gap opens where it would land.
  const gapAt = drag?.over ? drag.index : incoming;
  const gap = <span className="os-dock-gap" style={{ width: base }} aria-hidden="true" />;
  // The dragged app's own slot closes up while its icon is elsewhere.
  const shown = drag?.from === 'kept' ? kept.filter((a) => a !== drag.app) : kept;
  const DragIcon = drag ? apps[drag.app].Icon : null;

  return (
    <nav className="os-dock-wrap" aria-label="Dock">
      <m.div
        ref={dock}
        className="os-dock"
        style={{ '--dock-icon': `${base}px` } as React.CSSProperties}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        onClickCapture={(e) => {
          if (!dragged.current) return;
          dragged.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
        onDragOver={(e) => {
          if (phone || !e.dataTransfer.types.includes(APP_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setIncoming(indexAt(e.clientX));
        }}
        onDragLeave={(e) => {
          if (!dock.current?.contains(e.relatedTarget as Node)) setIncoming(null);
        }}
        onDrop={(e) => {
          const app = e.dataTransfer.getData(APP_MIME);
          setIncoming(null);
          if (!app || !dockable(app)) return;
          e.preventDefault();
          keepInDock(app, indexAt(e.clientX, app));
        }}
      >
        {shown.map((app, i) => {
          const { Icon, name } = apps[app];
          return (
            <Fragment key={app}>
              {gapAt === i && i > 0 && gap}
              <Magnified
                mouseX={mouseX}
                label={name}
                running={running.has(app)}
                badge={badgeOf(app)}
                onMenu={(at) => openMenu(menuFor(app))(at)}
                dataApp={app}
                kept={app}
                mobile={mobileDockApps.includes(app)}
                onActivate={(el) => activate(app, el)}
                onDragStart={startDrag(app, 'kept')}
              >
                {(s) => <Icon size={s} />}
              </Magnified>
            </Fragment>
          );
        })}
        {gapAt !== null && gapAt >= shown.length && gap}

        <Magnified
          mouseX={mouseX}
          label="Dashboard"
          mobile
          onActivate={() => {
            const { dashboardOpen, setDashboard } = useWindows.getState();
            setDashboard(!dashboardOpen);
          }}
        >
          {(s) => <DashboardIcon size={s} />}
        </Magnified>

        <span className="os-dock-divider" aria-hidden="true" data-dock-minimized />

        {visiting.map((v) => {
          const { Icon } = apps[v.app];
          return (
            <Magnified
              key={v.key}
              mouseX={mouseX}
              label={v.label}
              running
              badge={v.id ? 0 : badgeOf(v.app)}
              hidden={drag?.from === 'running' && drag.app === v.app && !v.id}
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
              onDragStart={v.id ? undefined : startDrag(v.app, 'running')}
            >
              {(s) => <Icon size={s} />}
            </Magnified>
          );
        })}

        <Magnified
          mouseX={mouseX}
          label="Trash"
          onActivate={() => play('trash')}
          onMenu={openMenu([{ label: 'Empty Trash', action: () => play('trash') }])}
        >
          {(s) => <TrashIcon size={s} />}
        </Magnified>
      </m.div>

      {/* On the desktop rather than in the Dock, whose translate would make them fixed to it, not to the screen. */}
      {drag && DragIcon && overlay(
        <div
          className="os-dock-ghost"
          style={{ left: drag.x, top: drag.y, width: base, height: base }}
          data-leaving={(!drag.over && drag.from === 'kept') || undefined}
          aria-hidden="true"
        >
          <DragIcon size={base} />
        </div>
      )}
      {poof &&
        overlay(
          <span key={poof.key} className="os-dock-poof" style={{ left: poof.x, top: poof.y }} onAnimationEnd={() => setPoof(null)} aria-hidden="true" />
        )}
      {menu && <ContextMenu at={menu} items={menu.items} onClose={() => setMenu(null)} label="Dock" />}
    </nav>
  );
}
