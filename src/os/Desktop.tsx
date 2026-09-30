import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';
import { Dock } from './shell/Dock';
import { MenuBar } from './shell/MenuBar';
import { SpotlightLayer } from './shell/SpotlightLayer';
import { DashboardLayer } from './shell/DashboardLayer';
import { DesktopLyricsLayer } from './shell/DesktopLyricsLayer';
import { DesktopStickiesLayer } from './shell/DesktopStickiesLayer';
import { Window } from './shell/Window';
import { Expose, exposeLayout } from './shell/Expose';
import { Screensaver } from './shell/Screensaver';
import { FullScreenLayer } from './shell/FullScreenLayer';
import { AppSwitcher } from './shell/AppSwitcher';
import { DesktopIcons } from './shell/DesktopIcons';
import { DesktopMenu } from './shell/DesktopMenu';
import { Boot, BootSkip } from './shell/Boot';
import { useShortcuts } from './shell/useShortcuts';
import { Sky, useSky } from './ambient/Sky';
import { startAccount } from './social/account';
import { afterSettled } from './core/warmUp';
import { Notices } from './shell/Notices';
import { Contained } from './shell/Contained';
import { useDesktopPicture } from './look/useDesktopPicture';
import { useAppearance } from './look/useAppearance';
import { watchWindows } from './core/sound';
import { OSDataContext } from './core/context';
import { openSession, saveWindowsAsTheyChange } from './core/windowSession';
import { loadForTab, saveForTab } from './core/storage';
import { isPhone, useFocusedId, useWindows } from './core/store';
import type { OSData } from './core/types';
import { useReduceMotion, useSystem } from './core/system';
import { NightShift } from './shell/NightShift';
import './os.css';

export default function Desktop({ data }: { data: OSData }) {
  // Animations follow Displays in System Preferences, or the device's own setting.
  const motionChoice = useSystem((s) => s.motion);
  return (
    <MotionConfig reducedMotion={motionChoice === 'system' ? 'user' : motionChoice === 'reduce' ? 'always' : 'never'}>
      <LazyMotion features={domAnimation} strict>
        <Shell data={data} />
      </LazyMotion>
    </MotionConfig>
  );
}

function Shell({ data }: { data: OSData }) {
  // Only whether an app is open, not where: the windows themselves are
  // <WindowLayer>'s, so dragging one doesn't re-render the whole desktop.
  const appOpen = useWindows((s) => Object.values(s.windows).some((w) => !w.minimized));
  const sky = useSky();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenuAt(null), []);
  const reduced = useReduceMotion();
  const root = useRef<HTMLDivElement>(null);
  // The boot screen runs once a tab (a reload skips it; a new tab gets it).
  const [booting, setBooting] = useState(() => !loadForTab('os-booted'));

  useEffect(watchWindows, []);
  useEffect(saveWindowsAsTheyChange, []);
  // Whether someone's signed in (the social backend loads on its own, after the desktop).
  useEffect(startAccount, []);
  // What isn't on the first screen waits until the desktop has settled
  // (core/warmUp.ts), so none of it is in the first load: chat's unread
  // counts and alerts for private messages and @mentions, songs Jincheng
  // plays for everyone to listen along to, AirDrop, and the discs Jincheng
  // burns. Who else is here is Presence's (below).
  useEffect(() => {
    let dead = false;
    const stops: (() => void)[] = [];
    // Each on its own, so one that fails to load doesn't hold back the rest.
    const start = (begin: () => (() => void) | void) => {
      if (dead) return;
      const stop = begin();
      if (stop) stops.push(stop);
    };
    const cancel = afterSettled(() =>
      Promise.allSettled([
        import('./social/chatState').then((chat) => start(chat.startChatWatch)),
        import('./media/together').then((together) => start(together.startListeningAlong)),
        import('./social/airdrop').then((airdrop) => start(() => airdrop.startAirDrop(data))),
        import('./media/discWatch').then((discs) => start(discs.watchDiscs))
      ])
    );
    return () => {
      dead = true;
      cancel();
      stops.forEach((stop) => stop());
    };
  }, [data]);
  // The page's plain-text copy (index.astro) is for screen readers, which
  // still read it; with the desktop running, its links would only be
  // invisible stops for someone moving through the page with Tab.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.os-text-copy a').forEach((a) => (a.tabIndex = -1));
  }, []);

  const glass = useWindows((s) => s.glass);
  const picture = useDesktopPicture(data, sky, root);

  useAppearance(sky.daylight);


  const finishBoot = () => {
    saveForTab('os-booted', '1');
    setBooting(false);
  };

  // Once the desktop is up, the windows of the last visit come back, with
  // whatever ?open= names on top of them (core/windowSession.ts).
  useEffect(() => {
    if (booting || Object.keys(useWindows.getState().windows).length > 0) return;
    const t = setTimeout(() => openSession(data), reduced ? 0 : 250);
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
        data-app-open={appOpen || undefined}
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
          <m.div
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
        <DesktopIcons />
        <Contained name="Stickies">
          <DesktopStickiesLayer />
        </Contained>
        <WindowLayer />
        <Contained name="Desktop lyrics">
          <DesktopLyricsLayer />
        </Contained>

        <Dock />
        <Contained name="Dashboard">
          <DashboardLayer />
        </Contained>
        <SpotlightLayer />
        <AppSwitcher />
        <Contained name="The screen saver">
          <Screensaver />
        </Contained>
        {!booting && (
          <Contained name="Presence">
            <PresenceLayer />
          </Contained>
        )}
        <Contained name="Notifications">
          <Notices />
        </Contained>
        <Contained name="A full-screen app">
          <FullScreenLayer />
        </Contained>
        {menuAt && <DesktopMenu at={menuAt} onClose={closeMenu} />}

        <AnimatePresence>{booting && !reduced && <Boot onDone={finishBoot} />}</AnimatePresence>
        {booting && reduced && <BootSkip onDone={finishBoot} />}
        <NightShift sky={sky} />
      </div>
    </OSDataContext.Provider>
  );
}

/**
 * Who else is here, and their pointers: Presence joins the desktop's
 * channel once the desktop has settled, as it isn't on the first screen
 * (the menu bar's count is social/online.tsx, and shows once it has).
 */
function PresenceLayer() {
  const [presence, setPresence] = useState<typeof import('./social/Presence') | null>(null);
  useEffect(() => {
    let live = true;
    const cancel = afterSettled(() => import('./social/Presence').then((m) => live && setPresence(m)));
    return () => {
      live = false;
      cancel();
    };
  }, []);
  return presence ? <presence.Presence /> : null;
}

/** The open windows and Exposé: the one part of the desktop that follows every move of a window. */
function WindowLayer() {
  const windows = useWindows((s) => s.windows);
  const order = useWindows((s) => s.order);
  const exposeOpen = useWindows((s) => s.exposeOpen);
  const focusedId = useFocusedId();

  // Exposé only has something to show while a window is open.
  const layout = exposeOpen ? exposeLayout(Object.values(windows)) : null;
  const exposeEmpty = layout !== null && Object.keys(layout).length === 0;
  useEffect(() => {
    if (exposeEmpty) useWindows.getState().setExpose(false);
  }, [exposeEmpty]);

  return (
    <>
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
    </>
  );
}
