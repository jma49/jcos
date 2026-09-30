import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { skyDimming, type SkyState } from '../ambient/Sky';
import { useWindows } from '../core/store';
import type { OSData } from '../core/types';
import { coverOf, SONGS } from '../media/library';
import { useMusic } from '../media/music';
import { ACCENTS, accentFromPicture, cachedAccent, cachedTopBrightness, DEFAULT_ACCENT, topBrightness } from './accent';
import { accentForGenerated, backgroundFor, COVER, isPicture, isPixelTile, SKY, topBrightnessOfGenerated } from './wallpapers';

/**
 * Everything the desktop picture decides: what's shown (and how, for a
 * blurred cover or a pixel-art tile), the accent colour it gives the
 * interface (set on `root`), whether the see-through menu bar sits on a
 * light or dark backdrop, and a new picture each time the visitor comes
 * back to the tab.
 */
export function useDesktopPicture(data: OSData, sky: SkyState, root: RefObject<HTMLDivElement | null>) {
  // What's stored: a photo's URL, a generated picture (wallpapers.ts), or null for the default.
  const chosen = useWindows((s) => s.wallpaper);
  // "Now Playing" shows the cover of the song that's on, blurred.
  const cover = useMusic((s) => {
    const song = s.owner ? SONGS[s.index] : undefined;
    return song ? coverOf(song) : null;
  });
  const showsCover = chosen === COVER && !!cover;
  const wallpaper = chosen === COVER ? (cover ?? data.wallpaper) : (chosen ?? data.wallpaper);
  // Photos and covers are sampled for their colours; generated pictures know theirs.
  const sampled = isPicture(chosen) || chosen === COVER;
  // The sky's light tints photos, but not the sky itself or a cover.
  const tinted = chosen !== SKY && chosen !== COVER;

  // The accent colour follows the desktop picture unless a fixed one was chosen.
  const accentChoice = useWindows((s) => s.accent);
  // The dynamic sky's accent follows the hour, so it depends on the sky too;
  // other pictures don't change with it.
  const skyKey = chosen === SKY ? `${sky.minutes},${sky.condition}` : '';
  const generatedAccent = useEffectEvent(() => accentForGenerated(wallpaper, sky));
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const apply = (color: string) => el.style.setProperty('--os-accent', color);
    if (accentChoice !== 'auto') return apply(ACCENTS[accentChoice].color);
    if (!sampled) return apply(generatedAccent() ?? DEFAULT_ACCENT);
    let live = true;
    const known = cachedAccent(wallpaper);
    if (known) return apply(known);
    accentFromPicture(wallpaper).then(
      (color) => live && apply(color),
      () => live && apply(DEFAULT_ACCENT)
    );
    return () => {
      live = false;
    };
  }, [root, accentChoice, wallpaper, sampled, skyKey]);

  // The menu bar is see-through, so its text follows what's behind it: how
  // bright the top of the picture is, darkened by the sky's tint and gloom.
  const generatedTop = sampled ? null : topBrightnessOfGenerated(wallpaper, sky);
  const [pictureTop, setPictureTop] = useState<number | null>(() => cachedTopBrightness(wallpaper));
  useEffect(() => {
    if (!sampled) return;
    let live = true;
    const known = cachedTopBrightness(wallpaper);
    if (known !== null) return setPictureTop(known);
    topBrightness(wallpaper).then(
      (value) => live && setPictureTop(value),
      () => live && setPictureTop(null)
    );
    return () => {
      live = false;
    };
  }, [wallpaper, sampled]);
  const top = (generatedTop ?? pictureTop ?? 0.4) * skyDimming(sky, tinted);
  const backdrop = top < 0.6 ? 'dark' : 'light';

  // Leave the tab and come back to a new desktop picture. The next one is
  // chosen and loaded (and its accent sampled) while the tab is hidden, so
  // it's ready to fade in on return. The collections it's chosen from are
  // fetched then, the first time, rather than with the desktop.
  const rotate = useWindows((s) => s.rotateWallpaper);
  useEffect(() => {
    if (!rotate) return;
    let next: string | null = null;
    let live = true;
    const onVisibility = () => {
      if (!document.hidden) {
        if (next) useWindows.getState().setWallpaper(next);
        next = null;
        return;
      }
      void import('./pictureSets').then(({ nextPicture }) => {
        // Back already, or no longer changing: the picture stays.
        if (!live || !document.hidden) return;
        next = nextPicture(useWindows.getState().wallpaper);
        if (next && isPicture(next)) {
          new Image().src = next;
          accentFromPicture(next).catch(() => {});
          topBrightness(next).catch(() => {});
        }
      }, () => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [rotate, data]);

  return {
    /** Changes whenever the picture does, to cross-fade between them. */
    key: wallpaper,
    background: backgroundFor(chosen, data.wallpaper, sky, cover),
    blurred: showsCover,
    pixelated: isPixelTile(chosen),
    /** Whether the sky's light and weather tint it. */
    tinted,
    backdrop
  };
}
