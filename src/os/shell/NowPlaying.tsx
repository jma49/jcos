import { useEffect, useRef, useState } from 'react';
import { NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '../core/glyphs';
import { launch } from '../core/registry';
import { isPhone } from '../core/store';
import { albumOf, coverOf, SONGS } from '../media/library';
import { useMusic } from '../media/music';
import { watchMediaSession } from '../media/session';

// ♫ in the menu bar while a song is on: the song, its cover and ⏮ ⏯ ⏭,
// without going back to the iPod or Karaoke. It drives whichever app is
// playing. It also hands the song to the browser's media controls.

export function NowPlaying() {
  const { owner, index, playing, toggle, next, previous, desktopLyrics, setDesktopLyrics } = useMusic();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(watchMediaSession, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const song = owner ? SONGS[index] : undefined;
  if (!owner || !song) return null;
  const album = albumOf(song) ?? (song.album ? { title: song.album } : null);
  const label = `${playing ? 'Playing' : 'Paused'}: ${song.title} by ${song.artist}`;

  return (
    <div ref={ref} className="os-nowplaying-wrap">
      <button
        type="button"
        className="os-nowplaying"
        title={label}
        aria-label={label}
        aria-expanded={open}
        data-playing={playing || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Three bars that bounce while it plays. */}
        <span className="os-nowplaying-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      {open && (
        <div className="os-nowplaying-card os-menu-list" role="dialog" aria-label="Now playing">
          <div className="os-nowplaying-song">
            <img src={coverOf(song)} alt="" />
            <span>
              <strong>{song.title}</strong>
              <small>{song.artist}</small>
              {album && <small>{album.title}</small>}
            </span>
          </div>
          <div className="os-nowplaying-controls">
            <button type="button" onClick={() => previous(owner)} aria-label="Previous">
              <PreviousGlyph />
            </button>
            <button type="button" onClick={() => toggle(owner)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            <button type="button" onClick={() => next(owner)} aria-label="Next">
              <NextGlyph />
            </button>
          </div>
          {!isPhone() && (
            <label className="os-nowplaying-lyrics">
              <input type="checkbox" checked={desktopLyrics} onChange={(e) => setDesktopLyrics(e.target.checked)} />
              Lyrics on the desktop
            </label>
          )}
          <button
            type="button"
            className="os-nowplaying-open"
            onClick={() => {
              setOpen(false);
              launch(owner);
            }}
          >
            Show in {owner === 'ipod' ? 'iPod' : 'Karaoke'}
          </button>
        </div>
      )}
    </div>
  );
}
