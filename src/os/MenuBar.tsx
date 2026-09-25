import { useEffect, useRef, useState } from 'react';
import { apps, launch } from './registry';
import { useFocusedId, useWindows } from './store';
import { useOSData } from './context';
import { SkyStatus, type SkyState } from './Sky';
import { OnlineStatus } from './Presence';
import { clockTimeZone, HOME, sameTime } from './place';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function MenuBar({ sky }: { sky: SkyState }) {
  const data = useOSData();
  const focusedId = useFocusedId();
  const windows = useWindows((s) => s.windows);
  const theme = useWindows((s) => s.theme);
  const { close, minimize, toggleMaximize, focus, setTheme, setSpotlight } = useWindows.getState();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const now = useClock();

  const focused = focusedId ? windows[focusedId] : null;
  const appName = focused ? apps[focused.app].name : 'Finder';

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenMenu(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const menus: Record<string, MenuItem[]> = {
    '◐': [
      { label: `About ${data.name}`, action: () => launch('about') },
      { divider: true, label: '' },
      { label: 'System Preferences…', action: () => launch('preferences') },
      { divider: true, label: '' },
      { label: 'Source on GitHub', action: () => window.open('https://github.com/jma49/Jincheng-Protafolio', '_blank') }
    ],
    File: [
      { label: 'New Terminal', shortcut: '⌥T', action: () => launch('terminal', { key: `terminal-${Date.now()}` }) },
      { label: 'Search…', shortcut: '⌘K', action: () => setSpotlight(true) },
      { divider: true, label: '' },
      { label: 'Close Window', shortcut: '⌥W', disabled: !focused, action: () => focused && close(focused.id) }
    ],
    View: [
      { label: 'Exposé', shortcut: 'F9', disabled: !focused, action: () => useWindows.getState().setExpose(true) },
      { label: 'Show Dashboard', action: () => useWindows.getState().setDashboard(true) },
      { label: 'Start Screen Saver', disabled: data.photos.length === 0, action: () => useWindows.getState().setScreensaver(true) },
      { divider: true, label: '' },
      { label: theme === 'dark' ? 'Light Appearance' : 'Dark Appearance', action: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
    ],
    Window: [
      { label: 'Minimize', shortcut: '⌥M', disabled: !focused, action: () => focused && minimize(focused.id) },
      { label: 'Zoom', disabled: !focused, action: () => focused && toggleMaximize(focused.id) },
      ...(Object.values(windows).length ? [{ divider: true, label: '' }] : []),
      ...Object.values(windows).map((w) => ({ label: `${w.id === focusedId ? '✓ ' : ''}${w.title}`, action: () => focus(w.id) }))
    ]
  };

  const timeZone = clockTimeZone(sky.place);
  const clock = now.toLocaleString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  const homeClock = sameTime(timeZone, HOME.timeZone, now)
    ? undefined
    : `${now.toLocaleTimeString('en-US', { timeZone: HOME.timeZone, hour: 'numeric', minute: '2-digit' })} for Jincheng in ${HOME.city}`;

  return (
    <header ref={barRef} className="os-menubar">
      <nav className="os-menus" aria-label="Menu bar">
        {Object.entries(menus).map(([title, items], i) => (
          <div key={title} className="os-menu">
            <button
              type="button"
              className="os-menu-title"
              data-open={openMenu === title}
              onPointerDown={() => setOpenMenu(openMenu === title ? null : title)}
              onPointerEnter={() => openMenu && setOpenMenu(title)}
              aria-haspopup="menu"
              aria-expanded={openMenu === title}
            >
              {i === 0 ? <img className="os-logo" src="/os/icons/apple.png" alt="Menu" width={16} height={16} /> : title}
            </button>
            {i === 0 && <span className="os-menu-appname">{appName}</span>}
            {openMenu === title && (
              <ul className="os-menu-list" role="menu">
                {items.map((item, j) =>
                  item.divider ? (
                    <li key={j} className="os-menu-divider" role="separator" />
                  ) : (
                    <li key={j} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => {
                          setOpenMenu(null);
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
            )}
          </div>
        ))}
      </nav>

      <div className="os-status">
        <OnlineStatus />
        <SkyStatus sky={sky} onOpen={() => useWindows.getState().setDashboard(true)} />
        <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle appearance">
          {theme === 'dark' ? '☀︎' : '☾'}
        </button>
        <button type="button" onClick={() => setSpotlight(true)} aria-label="Search">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <time dateTime={now.toISOString()} title={homeClock}>
          {clock}
        </time>
      </div>
    </header>
  );
}
