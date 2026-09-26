import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dock } from './shell/Dock';
import { MenuBar } from './shell/MenuBar';
import { Spotlight } from './shell/Spotlight';
import { Dashboard } from './shell/Dashboard';
import { Window } from './shell/Window';
import { Expose, exposeLayout } from './shell/Expose';
import { Screensaver } from './shell/Screensaver';
import { AppSwitcher } from './shell/AppSwitcher';
import { DesktopIcons } from './shell/DesktopIcons';
import { DesktopMenu } from './shell/DesktopMenu';
import { Boot, BootSkip } from './shell/Boot';
import { useShortcuts } from './shell/useShortcuts';
import { Sky, useSky } from './ambient/Sky';
import { Presence } from './social/Presence';
import { startAccount } from './social/account';
import { startChatWatch } from './social/chatState';
import { startAirDrop } from './social/airdrop';
import { Notices } from './shell/Notices';
import { useDesktopPicture } from './look/useDesktopPicture';
import { useAppearance } from './look/useAppearance';
import { watchWindows } from './core/sound';
import { OSDataContext } from './core/context';
import { launch } from './core/registry';
import { openFromUrl } from './core/deepLink';
import { restoreWindows, saveWindowsAsTheyChange } from './core/windowSession';
import { load, save } from './core/storage';
import { isPhone, useFocusedId, useWindows } from './core/store';
import type { OSData } from './core/types';
import './os.css';

/** Set once the first visit's welcome has been shown. */
const WELCOMED_KEY = 'os-welcomed';

export default function Desktop({ data }: { data: OSData }) {
  const windows = useWindows((s) => s.windows);
  const order = useWindows((s) => s.order);
  const exposeOpen = useWindows((s) => s.exposeOpen);
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

  useEffect(watchWindows, []);
  useEffect(saveWindowsAsTheyChange, []);
  // Whether someone's signed in (the social backend loads on its own, after the desktop).
  useEffect(startAccount, []);
  // Unread counts, and alerts for private messages and @mentions.
  useEffect(startChatWatch, []);
  useEffect(() => startAirDrop(data), [data]);

  const glass = useWindows((s) => s.glass);
  const picture = useDesktopPicture(data, sky, root);

  useAppearance(sky.daylight);

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
  // slug), or put back the windows of the last visit, or greet with About.
  // The very first time, the welcome comes alone, in the middle, and About
  // follows once it's closed (Welcome.tsx).
  useEffect(() => {
    if (booting || Object.keys(useWindows.getState().windows).length > 0) return;
    const greet = () => {
      if (load(WELCOMED_KEY)) return launch('about');
      save(WELCOMED_KEY, '1');
      launch('welcome', { center: true });
    };
    const t = setTimeout(() => openFromUrl(data) || restoreWindows() || greet(), reduced ? 0 : 250);
    return () => clearTimeout(t);
  }, [booting, reduced, data]);

  useShortcuts();

  return (
    <OSDataContext.Provider value={data}>
      <div
        ref={root}
        className="os-root"
        data-glass={glass || undefined}
        data-backdrop={picture.backdrop}
        data-app-open={Object.values(windows).some((w) => !w.minimized) || undefined}
        onContextMenu={(e) => {
          // Only the empty desktop has this menu; windows keep the browser's.
          const target = e.target as HTMLElement;
          if (target !== e.currentTarget && !target.matches('.os-wallpaper, .os-desktop-icons')) return;
          if (isPhone()) return;
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={picture.key}
            className="os-wallpaper"
            aria-hidden="true"
            data-blur={picture.blurred || undefined}
            data-pixel={picture.pixelated || undefined}
            style={{ background: picture.background }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { delay: 0.8 } }}
            transition={{ duration: 0.8 }}
          />
        </AnimatePresence>
        <Sky sky={sky} tinted={picture.tinted} />
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
        <Notices />
        {menuAt && <DesktopMenu at={menuAt} onClose={closeMenu} />}

        <AnimatePresence>{booting && !reduced && <Boot onDone={finishBoot} />}</AnimatePresence>
        {booting && reduced && <BootSkip onDone={finishBoot} />}
      </div>
    </OSDataContext.Provider>
  );
}

