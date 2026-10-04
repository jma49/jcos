import { Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { appComponent, apps } from '../core/registry';
import { releaseFocus, useWindows } from '../core/store';
import { inertAround } from '../core/focus';
import type { AppId, WindowState } from '../core/types';
import { AppBoundary } from './AppBoundary';

// An app that takes the whole screen (a manifest's `fullScreen`: Time
// Machine) rather than a window. It fades in over the windows, the menu
// bar and the Dock, which wait under it as they were, out of reach of the
// pointer, the keyboard and a screen reader until it's gone. Its code
// loads as it opens, as a window's does; what moves inside it is its own.

export function FullScreenLayer() {
  const open = useWindows((s) => s.fullScreen);
  return (
    <AnimatePresence>
      {open && (
        <m.div
          key={open.app}
          className="os-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label={apps[open.app].name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <FullScreenApp app={open.app} props={open.props} />
        </m.div>
      )}
    </AnimatePresence>
  );
}

function FullScreenApp({ app, props }: { app: AppId; props?: Record<string, string> }) {
  const [App] = useState(() => appComponent(app));
  // A window the size of the screen, for what the app was opened with.
  const [win] = useState<WindowState>(() => ({
    id: `fullscreen-${app}`,
    app,
    title: apps[app].name,
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    minimized: false,
    maximized: true,
    props
  }));
  const anchor = useRef<HTMLSpanElement>(null);

  // What's under it can't be reached meanwhile; the focus comes back where
  // it was. What had it is noted by openFullScreen, not here: once the
  // app's code is cached, the app focuses itself before this effect runs.
  useEffect(() => {
    const layer = anchor.current?.parentElement;
    if (!layer) return;
    const undo = inertAround(layer);
    return () => {
      undo();
      releaseFocus('fullScreen', layer);
    };
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      <AppBoundary name={apps[app].name} onClose={() => useWindows.getState().closeFullScreen()}>
        <Suspense fallback={null}>
          <App win={win} />
        </Suspense>
      </AppBoundary>
    </>
  );
}
