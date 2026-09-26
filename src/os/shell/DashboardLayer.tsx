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
    const onOver = (e: PointerEvent) => (e.target as Element).closest?.('.os-menubar, .os-dock') && load();
    document.addEventListener('pointerover', onOver);
    const cancel = afterSettled(load);
    return () => {
      document.removeEventListener('pointerover', onOver);
      cancel();
    };
  }, [module]);
  useEffect(() => {
    if (open && !module) void loadDashboard().then(setModule);
  }, [open, module]);

  return module ? <module.Dashboard /> : null;
}
