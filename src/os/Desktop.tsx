import { useEffect, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dock } from './Dock';
import { MenuBar } from './MenuBar';
import { Spotlight } from './Spotlight';
import { Window } from './Window';
import { OSDataContext } from './context';
import { apps, launch, rectOf } from './registry';
import { DiskIcon, PdfIcon } from './icons';
import { useFocusedId, useWindows } from './store';
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
      label: 'Résumé.pdf',
      Icon: PdfIcon,
      open: (el) => openApp('pdf', el, { title: 'Résumé.pdf', props: { src: data.links.resume } })
    },
    { id: 'projects', label: 'Projects', Icon: apps.projects.Icon, open: (el) => openApp('projects', el) },
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
  const focusedId = useFocusedId();
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [booting, setBooting] = useState(() => {
    try {
      return !sessionStorage.getItem('os-booted');
    } catch {
      return true;
    }
  });

  // Follow the saved site theme, then the system setting.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('theme');
    } catch {}
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    useWindows.getState().setTheme(dark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const finishBoot = () => {
    try {
      sessionStorage.setItem('os-booted', '1');
    } catch {}
    setBooting(false);
  };

  // Greet with the About window once the desktop is up.
  useEffect(() => {
    if (!booting && Object.keys(useWindows.getState().windows).length === 0) {
      const t = setTimeout(() => launch('about'), reduced ? 0 : 250);
      return () => clearTimeout(t);
    }
  }, [booting, reduced]);

  // Keyboard: ⌘K search; ⌥W / ⌥M / ⌥T for windows (the browser keeps ⌘W/⌘T).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWindows.getState();
      const top = [...s.order].reverse().find((id) => !s.windows[id]?.minimized);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
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
      <div ref={root} className="os-root" style={{ '--os-wallpaper': `url(${data.wallpaper})` } as React.CSSProperties}>
        <div className="os-wallpaper" aria-hidden="true" />
        <MenuBar />
        <DesktopIcons data={data} />

        {/* Render in opening order and stack with z-index: reordering DOM nodes
            would reload any iframe inside a window. */}
        <AnimatePresence>
          {Object.values(windows).map((win) => (
            <Window key={win.id} win={win} focused={win.id === focusedId} z={10 + order.indexOf(win.id)} />
          ))}
        </AnimatePresence>

        <Dock />
        <Spotlight />

        <AnimatePresence>{booting && !reduced && <Boot onDone={finishBoot} />}</AnimatePresence>
        {booting && reduced && <BootSkip onDone={finishBoot} />}
      </div>
    </OSDataContext.Provider>
  );
}

function BootSkip({ onDone }: { onDone: () => void }) {
  useEffect(onDone, [onDone]);
  return null;
}
