import { useEffect, useState } from 'react';
import { report } from '../core/report';
import { isPhone } from '../core/store';
import { useAccount } from '../social/account';

// A member's own stickies on their desktop (stickies/). Their code isn't
// part of the first load: it's fetched the first time someone is signed
// in. Phones have no desktop to put them on: Stickies › Yours has them.

type StickiesModule = typeof import('../stickies/DesktopStickies');
let loaded: StickiesModule | null = null;
const load = () => import('../stickies/DesktopStickies');

/** The desktop menu's New Sticky Note, where it was asked for (the code comes now if it hasn't yet). */
export const newStickyAt = (at: { x: number; y: number }) => void load().then((m) => m.newStickyAt(at), (error) => report(error, 'stickies.load'));

export function DesktopStickiesLayer() {
  const account = useAccount((s) => s.account?.id ?? null);
  const [module, setModule] = useState(loaded);
  const show = !!account && !isPhone();

  useEffect(() => {
    if (!show || module) return;
    let live = true;
    // Offline, they stay away; signing in again tries again.
    load().then(
      (m) => {
        loaded = m;
        if (live) setModule(m);
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [show, module]);

  if (!show || !module || !account) return null;
  return <module.DesktopStickies account={account} />;
}
