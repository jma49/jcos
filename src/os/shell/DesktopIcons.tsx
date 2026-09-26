import { useEffect, useRef, useState, type ComponentType } from 'react';
import { apps, launch, rectOf } from '../core/registry';
import { DiskIcon, DocumentIcon, PhotosIcon } from '../core/icons';
import { MENU_BAR_HEIGHT, isPhone, useWindows, type IconPositions } from '../core/store';
import type { AppId, OSData } from '../core/types';

// The icons down the right of the desktop: a double-click (a tap on a
// phone) opens them, and they can be dragged anywhere.

interface Shortcut {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  open: (el: HTMLElement) => void;
}

export function DesktopIcons({ data }: { data: OSData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const openApp = (app: AppId, el: HTMLElement, extra: Parameters<typeof launch>[1] = {}) =>
    launch(app, { origin: rectOf(el), ...extra });

  const shortcuts: Shortcut[] = [
    { id: 'hd', label: 'Macintosh HD', Icon: DiskIcon, open: (el) => openApp('finder', el, { props: { path: '/' } }) },
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

  const positions = useWindows((s) => s.iconPositions);
  const items = useRef(new Map<string, HTMLLIElement>());
  // Set while an icon is being dragged, so the click that ends the drag is ignored.
  const dragged = useRef(false);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** Where every icon is right now, so the whole layout can go free-form at once. */
  const snapshot = () => {
    const all: IconPositions = {};
    for (const [id, el] of items.current) {
      const r = el.getBoundingClientRect();
      all[id] = { top: r.top, right: window.innerWidth - r.right };
    }
    return all;
  };

  const startDrag = (id: string, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch' || isPhone()) return;
    const el = items.current.get(id);
    if (!el) return;
    const start = { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    let layout: IconPositions | null = null;
    dragged.current = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!layout && Math.hypot(dx, dy) < 4) return;
      layout ??= { ...snapshot(), ...useWindows.getState().iconPositions };
      dragged.current = true;
      // Keep the icon on the desktop: below the menu bar, above the Dock.
      const top = Math.min(window.innerHeight - rect.height - 80, Math.max(MENU_BAR_HEIGHT + 4, rect.top + dy));
      const right = Math.min(window.innerWidth - rect.width, Math.max(0, window.innerWidth - rect.right - dx));
      layout = { ...layout, [id]: { top, right } };
      useWindows.getState().setIconPositions(layout);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Free-form positions only apply on desktops; phones keep the grid.
  const free = positions && !isPhone() ? positions : null;

  return (
    <ul className="os-desktop-icons" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
      {shortcuts.map(({ id, label, Icon, open }) => {
        const at = free?.[id];
        return (
          <li
            key={id}
            ref={(el) => {
              if (el) items.current.set(id, el);
              else items.current.delete(id);
            }}
            className={at ? 'os-desktop-icon-free' : undefined}
            style={
              at
                ? {
                    // Pulled back on screen if the window has shrunk since.
                    top: Math.min(at.top, viewport.h - 170),
                    right: Math.min(at.right, viewport.w - 100)
                  }
                : undefined
            }
          >
            <button
              type="button"
              data-selected={selected === id}
              onPointerDown={(e) => {
                setSelected(id);
                startDrag(id, e);
              }}
              onClick={(e) => {
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
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
        );
      })}
    </ul>
  );
}
