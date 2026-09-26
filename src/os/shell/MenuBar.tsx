import { useEffect, useRef, useState } from 'react';
import { apps, launch } from '../core/registry';
import { isPhone, useFocusedId, useWindowList, useWindows } from '../core/store';
import { useOSData } from '../core/context';
import { SkyStatus, type SkyState } from '../ambient/Sky';
import { OnlineStatus } from '../social/Presence';
import { NowPlaying } from './NowPlaying';
import { clockTimeZone, HOME, sameTime } from '../ambient/place';
import { play } from '../core/sound';
import { useMusic } from '../media/music';
import { useAccount } from '../social/account';
import { getSocial } from '../social/social';
import { useSystem } from '../core/system';

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
  const windows = useWindowList();
  const theme = useWindows((s) => s.theme);
  const { close, minimize, toggleMaximize, focus, setTheme, setSpotlight } = useWindows.getState();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const now = useClock();
  const clock24 = useSystem((s) => s.clock24);
  const clockDate = useSystem((s) => s.clockDate);

  const focused = focusedId ? (windows.find((w) => w.id === focusedId) ?? null) : null;
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

  const accounts = useAccount();

  // The iPod and Karaoke add a Controls menu while they're in front.
  const music = useMusic();
  const player = focused?.app === 'ipod' || focused?.app === 'karaoke' ? focused.app : null;
  const controls: MenuItem[] | null = player
    ? [
        { label: music.owner === player && music.playing ? 'Pause' : 'Play', shortcut: 'Space', action: () => music.toggle(player) },
        { label: 'Next Song', shortcut: player === 'ipod' ? '→' : '↓', action: () => music.next(player) },
        { label: 'Previous Song', shortcut: player === 'ipod' ? '←' : '↑', action: () => music.previous(player) },
        { divider: true, label: '' },
        { label: `${music.shuffle ? '✓ ' : ''}Shuffle`, action: () => music.setShuffle(!music.shuffle) },
        ...(['off', 'one', 'all'] as const).map((r) => ({
          label: `${music.repeat === r ? '✓ ' : ''}Repeat ${r === 'off' ? 'Off' : r === 'one' ? 'One' : 'All'}`,
          action: () => music.setRepeat(r)
        })),
        { divider: true, label: '' },
        player === 'ipod'
          ? { label: 'Open Karaoke', action: () => launch('karaoke') }
          : { label: 'Open iPod', action: () => launch('ipod') }
      ]
    : null;

  const menus: Record<string, MenuItem[]> = {
    '◐': [
      { label: 'About This Mac', action: () => launch('aboutmac') },
      { label: `About ${data.name}`, action: () => launch('about') },
      { divider: true, label: '' },
      { label: 'System Preferences…', action: () => launch('preferences') },
      { label: 'Applet Store…', action: () => launch('appstore') },
      ...(accounts.available
        ? [
            { divider: true, label: '' },
            accounts.account
              ? { label: `Sign Out ${accounts.account.username}…`, action: () => getSocial().then((s) => s?.signOut()) }
              : { label: 'Sign In…', action: () => launch('account') }
          ]
        : []),
      { divider: true, label: '' },
      { label: 'Source on GitHub', action: () => window.open('https://github.com/jma49/jmos', '_blank') }
    ],
    File: [
      { label: 'New Terminal', shortcut: '⌥T', action: () => launch('terminal', { key: `terminal-${Date.now()}` }) },
      { label: 'Search…', shortcut: '⌘K', action: () => setSpotlight(true) },
      { divider: true, label: '' },
      { label: 'Close Window', shortcut: '⌥W', disabled: !focused, action: () => focused && close(focused.id) }
    ],
    ...(controls ? { Controls: controls } : {}),
    View: [
      { label: 'Exposé', shortcut: 'F9', disabled: !focused, action: () => useWindows.getState().setExpose(true) },
      { label: 'Show Dashboard', action: () => useWindows.getState().setDashboard(true) },
      { label: 'Start Screen Saver', action: () => useWindows.getState().setScreensaver(true) },
      { divider: true, label: '' },
      { label: theme === 'dark' ? 'Light Appearance' : 'Dark Appearance', action: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
    ],
    Window: [
      { label: 'Minimize', shortcut: '⌥M', disabled: !focused, action: () => focused && minimize(focused.id) },
      { label: 'Zoom', disabled: !focused, action: () => focused && toggleMaximize(focused.id) },
      ...(windows.length ? [{ divider: true, label: '' }] : []),
      ...windows.map((w) => ({ label: `${w.id === focusedId ? '✓ ' : ''}${w.title}`, action: () => focus(w.id) }))
    ]
  };

  const timeZone = clockTimeZone(sky.place);
  // Phones have room for the time only. Date & Time in System Preferences
  // picks a 24-hour clock and whether the date shows.
  const phone = isPhone();
  const clock = now.toLocaleString('en-US', {
    timeZone,
    ...(phone || !clockDate ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
    hour: clock24 ? '2-digit' : 'numeric',
    minute: '2-digit',
    hourCycle: clock24 ? 'h23' : 'h12'
  });
  const homeClock = sameTime(timeZone, HOME.timeZone, now)
    ? undefined
    : `${now.toLocaleTimeString('en-US', { timeZone: HOME.timeZone, hour: 'numeric', minute: '2-digit', hourCycle: clock24 ? 'h23' : 'h12' })} for Jincheng in ${HOME.city}`;

  // See-through over the desktop; solid when a window runs up under it: a
  // zoomed one, or any app on a phone, where apps are full screen.
  const solid = windows.some((w) => !w.minimized && (w.maximized || phone));

  return (
    <header ref={barRef} className="os-menubar" data-solid={solid || undefined}>
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
              {i === 0 ? <span className="os-logo" role="img" aria-label="Menu" /> : title}
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
                          play('click');
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
        {accounts.account && (
          // Tiger's fast user switching: who's signed in, at the right of the bar.
          <button type="button" className="os-account-status" onClick={() => launch('account')} title="Your account">
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <circle cx="6" cy="3.6" r="2.6" fill="currentColor" />
              <path d="M1 11.5c0-2.9 2.2-4.6 5-4.6s5 1.7 5 4.6z" fill="currentColor" />
            </svg>
            <span>{accounts.account.username}</span>
          </button>
        )}
        <NowPlaying />
        <SoundToggle />
        <OnlineStatus />
        <SkyStatus sky={sky} onOpen={() => useWindows.getState().setDashboard(true)} />
        <button
          type="button"
          className="os-theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle appearance"
        >
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

/** Menu bar speaker: turns interface sounds on and off. */
function SoundToggle() {
  const on = useWindows((s) => s.soundOn);
  const label = on ? 'Turn sounds off' : 'Turn sounds on';
  return (
    <button
      type="button"
      className="os-sound-toggle"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => {
        useWindows.getState().setSound(!on);
        if (!on) play('chime', { force: true });
      }}
    >
      <svg viewBox="0 0 16 14" width="15" height="13" aria-hidden="true">
        <path d="M1 5h3l4-3.5v11L4 9H1z" fill="currentColor" />
        {on ? (
          <path d="M10.5 4.5c1.2 1.3 1.2 3.7 0 5M12.6 2.6c2.2 2.4 2.2 6.4 0 8.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        ) : (
          <path d="M10.5 5l4 4M14.5 5l-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
