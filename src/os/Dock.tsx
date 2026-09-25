import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { apps, dockApps, launch, mobileDockApps, rectOf } from './registry';
import { DashboardIcon, TrashIcon } from './icons';
import { useWindows } from './store';
import type { AppId } from './types';

const BASE = 50;
const PEAK = 78;
const REACH = 150;

/** One Dock slot that grows as the pointer gets closer (macOS-style magnification). */
function Magnified({
  mouseX,
  label,
  running,
  onActivate,
  children,
  dataApp,
  mobile = false
}: {
  mouseX: MotionValue<number>;
  label: string;
  running?: boolean;
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
      aria-label={label}
      data-dock-app={dataApp}
      data-mobile={mobile || undefined}
    >
      <span className="os-dock-label">{label}</span>
      <motion.span className="os-dock-icon" style={{ width: size, height: size }}>
        {children(PEAK)}
      </motion.span>
      {running && <span className="os-dock-dot" />}
    </motion.button>
  );
}

export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const windows = useWindows((s) => s.windows);
  const running = new Set(Object.values(windows).map((w) => w.app));
  // Minimized windows of apps without their own Dock icon get a slot on the right.
  const parked = Object.values(windows).filter((w) => w.minimized && !dockApps.includes(w.app));

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

        {parked.map((w) => {
          const { Icon } = apps[w.app];
          return (
            <Magnified
              key={w.id}
              mouseX={mouseX}
              label={w.title}
              onActivate={() => useWindows.getState().focus(w.id)}
            >
              {(s) => <Icon size={s} />}
            </Magnified>
          );
        })}

        <Magnified mouseX={mouseX} label="Trash" onActivate={() => {}}>
          {(s) => <TrashIcon size={s} />}
        </Magnified>
      </motion.div>
    </nav>
  );
}
