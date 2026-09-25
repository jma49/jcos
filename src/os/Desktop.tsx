import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dock } from './Dock';
import { MenuBar } from './MenuBar';
import { Spotlight } from './Spotlight';
import { Dashboard } from './Dashboard';
import { Window } from './Window';
import { Expose, exposeLayout } from './Expose';
import { Screensaver } from './Screensaver';
import { Sky, useSky } from './Sky';
import { Presence } from './Presence';
import { AppSwitcher } from './AppSwitcher';
import { OSDataContext } from './context';
import { apps, launch, rectOf } from './registry';
import { DiskIcon, DocumentIcon, PhotosIcon } from './icons';
import { MOBILE_BREAKPOINT, useFocusedId, useWindows } from './store';
import type { AppId, OSData } from './types';
import './os.css';

interface Shortcut {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  open: (el: HTMLElement) => void;
}

function DesktopIcons({ data }: { data: OSData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const openApp = (app: AppId, el: HTMLElement, extra: Parameters<typeof launch>[1] = {}) =>
    launch(app, { origin: rectOf(el), ...extra });

  const shortcuts: Shortcut[] = [
    { id: 'hd', label: 'Macintosh HD', Icon: DiskIcon, open: (el) => openApp('projects', el) },
    { id: 'about', label: 'About Me', Icon: apps.about.Icon, open: (el) => openApp('about', el) },
    {
      id: 'resume',
      label: 'Résumé',
      Icon: DocumentIcon,
      open: (el) => openApp('resume', el)
    },
    { id: 'projects', label: 'Projects', Icon: apps.projects.Icon, open: (el) => openApp('projects', el) },
    { id: 'photos', label: 'Photos', Icon: PhotosIcon, open: (el) => openApp('photos', el) },
    { id: 'stickies', label: 'Stickies', Icon: apps.stickies.Icon, open: (el) => openApp('stickies', el) },
    { id: 'soapbox', label: 'Soapbox', Icon: apps.soapbox.Icon, open: (el) => openApp('soapbox', el) },
    { id: 'terminal', label: 'Terminal', Icon: apps.terminal.Icon, open: (el) => openApp('terminal', el) }
  ];

  return (
    <ul className="os-desktop-icons" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
      {shortcuts.map(({ id, label, Icon, open }) => (
        <li key={id}>
          <button
            type="button"
            data-selected={selected === id}
            onClick={(e) => {
              // Touch has no double-click, so a tap opens right away.
              if ((e.nativeEvent as PointerEvent).pointerType === 'touch') open(e.currentTarget);
              else setSelected(id);
            }}
            onDoubleClick={(e) => open(e.currentTarget)}
            onKeyDown={(e) => e.key === 'Enter' && open(e.currentTarget)}
          >
            <Icon size={56} />
            <span>{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface ContextMenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

/** The menu a right-click on the empty desktop opens. */
function DesktopMenu({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const custom = useWindows((s) => s.wallpaper);
  const s = useWindows.getState();
  const items: ContextMenuItem[] = [
    { label: 'Change Desktop Background…', action: () => launch('preferences', { props: { pane: 'desktop' } }) },
    { label: 'Use Default Desktop Picture', disabled: !custom, action: () => s.setWallpaper(null) },
    { divider: true, label: '' },
    { label: 'Exposé', shortcut: 'F9', action: () => s.setExpose(true) },
    { label: 'Start Screen Saver', action: () => s.setScreensaver(true) }
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onClose);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onClose);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <ul
      className="os-menu-list os-context-menu"
      role="menu"
      style={{ left: Math.min(at.x, window.innerWidth - 240), top: Math.min(at.y, window.innerHeight - 140) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.divider ? (
          <li key={i} className="os-menu-divider" role="separator" />
        ) : (
          <li key={i} role="none">
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.action?.();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          </li>
        )
      )}
    </ul>
  );
}

function Boot({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <motion.div className="os-boot" exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
      <motion.div
        className="os-boot-mark"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        JM
      </motion.div>
      <div className="os-boot-bar">
        <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1] }} />
      </div>
    </motion.div>
  );
}

export default function Desktop({ data }: { data: OSData }) {
  const windows = useWindows((s) => s.windows);
  const order = useWindows((s) => s.order);
  const theme = useWindows((s) => s.theme);
  const exposeOpen = useWindows((s) => s.exposeOpen);
  const wallpaper = useWindows((s) => s.wallpaper) ?? data.wallpaper;
  const focusedId = useFocusedId();
  const sky = useSky();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenuAt(null), []);
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [booting, setBooting] = useState(() => {
    try {
      return !sessionStorage.getItem('os-booted');
    } catch {
      return true;
    }
  });

  // Light or dark as the visitor chose; `system` follows the OS, `sun` the daylight where they are.
  const appearance = useWindows((s) => s.appearance);
  useEffect(() => {
    const { applyTheme } = useWindows.getState();
    if (appearance === 'sun') {
      applyTheme(sky.daylight ? 'light' : 'dark');
    } else if (appearance === 'system') {
      const query = matchMedia('(prefers-color-scheme: dark)');
      const follow = () => applyTheme(query.matches ? 'dark' : 'light');
      follow();
      query.addEventListener('change', follow);
      return () => query.removeEventListener('change', follow);
    } else {
      applyTheme(appearance);
    }
  }, [appearance, sky.daylight]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Exposé only has something to show while a window is open.
  const layout = exposeOpen ? exposeLayout(Object.values(windows)) : null;
  const exposeEmpty = layout !== null && Object.keys(layout).length === 0;
  useEffect(() => {
    if (exposeEmpty) useWindows.getState().setExpose(false);
  }, [exposeEmpty]);

  const finishBoot = () => {
    try {
      sessionStorage.setItem('os-booted', '1');
    } catch {}
    setBooting(false);
  };

  // Once the desktop is up, open whatever ?open= names (an app or a project
  // slug), or greet with About.
  useEffect(() => {
    if (booting || Object.keys(useWindows.getState().windows).length > 0) return;
    const t = setTimeout(() => openFromUrl(data) || launch('about'), reduced ? 0 : 250);
    return () => clearTimeout(t);
  }, [booting, reduced, data]);

  // Keyboard: F9 Exposé; ⌘K search; ⌥W / ⌥M / ⌥T for windows (the browser keeps ⌘W/⌘T).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWindows.getState();
      const top = [...s.order].reverse().find((id) => !s.windows[id]?.minimized);
      if (e.key === 'F9' && window.innerWidth >= MOBILE_BREAKPOINT) {
        e.preventDefault();
        s.setExpose(!s.exposeOpen);
      } else if (e.key === 'Escape' && s.exposeOpen) {
        s.setExpose(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setSpotlight(!s.spotlightOpen);
      } else if (e.altKey && e.code === 'KeyW' && top) {
        e.preventDefault();
        s.close(top);
      } else if (e.altKey && e.code === 'KeyM' && top) {
        e.preventDefault();
        s.minimize(top);
      } else if (e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        launch('terminal', { key: `terminal-${Date.now()}` });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <OSDataContext.Provider value={data}>
      <div
        ref={root}
        className="os-root"
        data-app-open={Object.values(windows).some((w) => !w.minimized) || undefined}
        onContextMenu={(e) => {
          // Only the empty desktop has this menu; windows keep the browser's.
          const target = e.target as HTMLElement;
          if (target !== e.currentTarget && !target.matches('.os-wallpaper, .os-desktop-icons')) return;
          if (window.innerWidth < MOBILE_BREAKPOINT) return;
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={wallpaper}
            className="os-wallpaper"
            aria-hidden="true"
            style={{ '--os-wallpaper': `url(${wallpaper})` } as React.CSSProperties}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { delay: 0.8 } }}
            transition={{ duration: 0.8 }}
          />
        </AnimatePresence>
        <Sky sky={sky} />
        <MenuBar sky={sky} />
        <DesktopIcons data={data} />
        <Expose layout={layout} />

        {/* Render in opening order and stack with z-index: reordering DOM nodes
            would reload any iframe inside a window. */}
        <AnimatePresence>
          {Object.values(windows).map((win) => (
            <Window
              key={win.id}
              win={win}
              focused={win.id === focusedId}
              z={10 + order.indexOf(win.id)}
              exposed={layout?.[win.id]}
            />
          ))}
        </AnimatePresence>

        <Dock />
        <Dashboard />
        <Spotlight />
        <AppSwitcher />
        <Screensaver />
        {!booting && <Presence />}
        {menuAt && <DesktopMenu at={menuAt} onClose={closeMenu} />}

        <AnimatePresence>{booting && !reduced && <Boot onDone={finishBoot} />}</AnimatePresence>
        {booting && reduced && <BootSkip onDone={finishBoot} />}
      </div>
    </OSDataContext.Provider>
  );
}

const DEEP_LINK_APPS: AppId[] = ['about', 'resume', 'projects', 'photos', 'stickies', 'soapbox', 'terminal', 'preferences'];

/** Handles links like /?open=resume or /?open=ocra. Returns whether it opened anything. */
function openFromUrl(data: OSData): boolean {
  const target = new URLSearchParams(window.location.search).get('open')?.toLowerCase();
  if (!target) return false;
  if (target === 'dashboard') {
    useWindows.getState().setDashboard(true);
    return true;
  }
  if (target === 'screensaver') {
    useWindows.getState().setScreensaver(true);
    return true;
  }
  if ((DEEP_LINK_APPS as string[]).includes(target)) {
    launch(target as AppId);
    return true;
  }
  const project = data.projects.find((p) => p.slug === target);
  if (project) {
    launch('project', { key: `project:${project.slug}`, title: project.title, props: { slug: project.slug } });
    return true;
  }
  return false;
}

function BootSkip({ onDone }: { onDone: () => void }) {
  useEffect(onDone, [onDone]);
  return null;
}
