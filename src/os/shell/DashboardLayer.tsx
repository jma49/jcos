import { useEffect, useState } from 'react';
import { useWindows } from '../core/store';
import { afterSettled } from '../core/warmUp';

// The Dashboard only shows when asked for, so its code (the widgets) isn't
// part of the first load: it's fetched once the desktop has settled, as
// soon as the pointer reaches the menu bar or the Dock (where it's opened
// from) if that's sooner, or when it opens.
//
// No lazy() and Suspense here: React holds back content that suspended for
// about 300 ms, which made the Dashboard slow to appear even when its code
// was already loaded. It renders directly once the module is in.

type DashboardModule = typeof import('./Dashboard');
let loaded: DashboardModule | null = null;
const loadDashboard = () => import('./Dashboard').then((module) => (loaded = module));

export function DashboardLayer() {
  const open = useWindows((s) => s.dashboardOpen);
  const [module, setModule] = useState(loaded);

  useEffect(() => {
    if (module) return;
    const load = () => void loadDashboard().then(setModule);
    // A pointer moving onto the menu bar or the Dock is on its way to the
    // Dashboard: fetch it ahead. Only real movement counts. A browser
    // reports a resting pointer as over whatever the page paints under it
    // (the menu bar, when the pointer is at the top as the page loads),
    // which is nobody reaching for anything; that fetched 4.2 KB on first
    // loads.
    const onMove = (e: PointerEvent) => (e.movementX !== 0 || e.movementY !== 0) && (e.target as Element).closest?.('.os-menubar, .os-dock') && load();
    document.addEventListener('pointermove', onMove);
    const cancel = afterSettled(load);
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancel();
    };
  }, [module]);
  useEffect(() => {
    if (open && !module) void loadDashboard().then(setModule);
  }, [open, module]);

  return module ? <module.Dashboard /> : null;
}
