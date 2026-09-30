import { useEffect, useState } from 'react';
import { useWindows } from '../core/store';
import { afterSettled } from '../core/warmUp';

// Spotlight only shows when asked for (⌘K, or the magnifier in the menu
// bar), so its code isn't part of the first load: it's fetched once the
// desktop has settled, or as it opens if that's sooner. It renders
// directly once the module is in, without lazy() and Suspense, as the
// Dashboard does (DashboardLayer.tsx).

type SpotlightModule = typeof import('./Spotlight');
let loaded: SpotlightModule | null = null;
const loadSpotlight = () => import('./Spotlight').then((module) => (loaded = module));

export function SpotlightLayer() {
  const open = useWindows((s) => s.spotlightOpen);
  const [module, setModule] = useState(loaded);

  useEffect(() => {
    if (module) return;
    if (open) return void loadSpotlight().then(setModule);
    return afterSettled(() => loadSpotlight().then(setModule));
  }, [open, module]);

  return module ? <module.Spotlight /> : null;
}
