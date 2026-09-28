import { useEffect, useState } from 'react';
import { isPhone, useWindows } from '../core/store';
import { useMusic } from '../media/music';

// Desktop lyrics are off until the visitor turns them on (the iPod's
// Settings, or the ♫ card), so their code isn't part of the first load:
// it's fetched the first time they're on while a song is playing. They
// step aside while Karaoke, which shows the same lyrics larger, is playing
// in a window that's showing. Phones have no room for them.

type LyricsModule = typeof import('./DesktopLyrics');
let loaded: LyricsModule | null = null;

export function DesktopLyricsLayer() {
  const wanted = useMusic((s) => s.desktopLyrics && s.owner !== null);
  const karaokeSings = useMusic((s) => s.owner === 'karaoke');
  const karaokeShown = useWindows((s) => Object.values(s.windows).some((w) => w.app === 'karaoke' && !w.minimized));
  const [module, setModule] = useState(loaded);
  const show = wanted && !(karaokeSings && karaokeShown) && !isPhone();

  useEffect(() => {
    if (!show || module) return;
    let live = true;
    // Offline, it stays hidden; turning it on again tries again.
    import('./DesktopLyrics').then(
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

  if (!show || !module) return null;
  return <module.DesktopLyrics />;
}
