import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { apps, dockApps, launch, mobileDockApps, rectOf } from '../core/registry';
import { DashboardIcon, TrashIcon } from '../core/icons';
import { useWindows } from '../core/store';
import { play } from '../core/sound';
import type { AppId } from '../core/types';
import { useChatBadge } from '../social/chatState';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

const BASE = 50;
const PEAK = 78;
const REACH = 150;

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
  /** Whether the slot stays in the compact phone Dock. */
  mobile?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const target = useTransform(distance, [-REACH, 0, REACH], [BASE, PEAK, BASE], { clamp: true });
  const size = useSpring(target, { stiffness: 380, damping: 28, mass: 0.4 });

  return (
    <motion.button
      ref={ref}
      type="button"
      className="os-dock-item"
      style={{ width: size, height: size }}
      onClick={() => ref.current && onActivate(ref.current)}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY - 8 });
      }}
      aria-label={badge ? `${label}, ${badge} new` : label}
      data-dock-app={dataApp}
      data-mobile={mobile || undefined}
    >
      <span className="os-dock-label">{label}</span>
      <motion.span className="os-dock-icon" style={{ width: size, height: size }}>
        {children(PEAK)}
      </motion.span>
      {running && <span className="os-dock-dot" />}
      {badge ? (
        <span className="os-dock-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </motion.button>
  );
}

export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const windows = useWindows((s) => s.windows);
  const running = new Set(Object.values(windows).map((w) => w.app));
  const chatBadge = useChatBadge();
  const badgeOf = (app: AppId) => (app === 'chat' ? chatBadge : 0);
  // Open apps that aren't kept in the Dock get a slot on the right while they
  // run, as on a Mac: one per app, or one per window for project pages.
  const visiting: { key: string; app: AppId; label: string; id?: string }[] = [];
  for (const w of Object.values(windows)) {
    if (dockApps.includes(w.app) || apps[w.app].noDock) continue;
    if (w.app === 'project') visiting.push({ key: w.id, app: w.app, label: w.title, id: w.id });
    else if (!visiting.some((v) => v.app === w.app)) visiting.push({ key: w.app, app: w.app, label: apps[w.app].name });
  }

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  /** The Dock menu for an app: its windows, then what can be done with it. */
  const menuFor = (app: AppId): ContextMenuItem[] => {
    const { windows: all, order, focus, minimize, close } = useWindows.getState();
    const mine = order.map((id) => all[id]).filter((w) => w && w.app === app);
    const def = apps[app];
    return [
      ...mine.map((w) => ({ label: `${w.minimized ? '◇ ' : ''}${w.title}`, action: () => focus(w.id) })),
      ...(mine.length ? [{ label: '', divider: true }] : []),
      ...(mine.length ? [] : [{ label: 'Open', action: () => launch(app) }]),
      ...(def.inApplications || def.applet
        ? [{ label: 'Show in Finder', action: () => launch('finder', { props: { path: def.applet ? '/Applets' : '/Applications' } }) }]
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

  return (
    <nav className="os-dock-wrap" aria-label="Dock">
      <motion.div
        className="os-dock"
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
      >
        {dockApps.map((app) => {
          const { Icon, name } = apps[app];
          return (
            <Magnified
              key={app}
              mouseX={mouseX}
              label={name}
              running={running.has(app)}
              badge={badgeOf(app)}
              onMenu={(at) => openMenu(menuFor(app))(at)}
              dataApp={app}
              mobile={mobileDockApps.includes(app)}
              onActivate={(el) => activate(app, el)}
            >
              {(s) => <Icon size={s} />}
            </Magnified>
          );
        })}

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
      </motion.div>
      {menu && <ContextMenu at={menu} items={menu.items} onClose={() => setMenu(null)} label="Dock" />}
    </nav>
  );
}
