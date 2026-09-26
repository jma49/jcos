import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useOSData } from '../core/context';
import type { AppProps } from '../core/registry';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, isPhone, useWindows } from '../core/store';
import type { OSPhoto, WindowState } from '../core/types';
import { Drawer } from '../shell/drawer';

/** Title bar + toolbar height, and the dark margin around a photo in the viewer. */
const CHROME = 23 + 36;
const MARGIN = 16;

/** Photos grouped by the year they were uploaded, newest first. */
function byYear(photos: OSPhoto[]) {
  const groups = new Map<string, { index: number; photo: OSPhoto }[]>();
  photos.forEach((photo, index) => {
    const label = String(new Date(photo.taken).getFullYear());
    groups.set(label, [...(groups.get(label) ?? []), { index, photo }]);
  });
  return [...groups];
}

/** Window bounds that fit a photo's aspect ratio inside the desktop, centred. */
function fitTo(photo: OSPhoto) {
  const ratio = photo.width / photo.height;
  const maxW = window.innerWidth * 0.86 - MARGIN * 2;
  const maxH = window.innerHeight - MENU_BAR_HEIGHT - DOCK_CLEARANCE - 24 - CHROME - MARGIN * 2;
  const w = Math.min(maxW, maxH * ratio);
  const h = w / ratio;
  const width = Math.round(Math.max(560, w + MARGIN * 2));
  const height = Math.round(h + MARGIN * 2 + CHROME);
  return {
    width,
    height,
    x: Math.round((window.innerWidth - width) / 2),
    y: Math.round(MENU_BAR_HEIGHT + (window.innerHeight - MENU_BAR_HEIGHT - DOCK_CLEARANCE - height) / 2)
  };
}

function PhotoInfo({ photo, index, total }: { photo: OSPhoto; index: number; total: number }) {
  const taken = new Date(photo.taken);
  const megapixels = (photo.width * photo.height) / 1_000_000;
  return (
    <div className="os-info">
      <img className="os-info-preview" src={photo.thumb} alt="" style={{ backgroundColor: photo.color }} />
      <h3>
        Photo {index + 1} of {total}
      </h3>
      {photo.alt && <p className="os-info-description">{photo.alt[0].toUpperCase() + photo.alt.slice(1)}</p>}
      <dl>
        <dt>Uploaded</dt>
        <dd>{taken.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</dd>
        <dt>Size</dt>
        <dd>
          {photo.width.toLocaleString()} × {photo.height.toLocaleString()} ({megapixels.toFixed(1)} MP)
        </dd>
        <dt>Orientation</dt>
        <dd>{photo.width > photo.height * 1.05 ? 'Landscape' : photo.height > photo.width * 1.05 ? 'Portrait' : 'Square'}</dd>
        <dt>Color</dt>
        <dd>
          <span className="os-info-swatch" style={{ background: photo.color }} /> {photo.color}
        </dd>
      </dl>
      <a href={photo.page} target="_blank" rel="noopener">
        View on Unsplash ↗
      </a>
    </div>
  );
}

/** iPhoto-style library of the Unsplash photos fetched at build time. */
export default function Photos({ win }: AppProps) {
  const { photos, links } = useOSData();
  const wallpaper = useWindows((s) => s.wallpaper);
  const [row, setRow] = useState(180);
  const [open, setOpen] = useState<number | null>(null);
  // The Info drawer stays open from photo to photo.
  const [info, setInfo] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const saved = useRef<Pick<WindowState, 'x' | 'y' | 'width' | 'height'> | null>(null);
  const groups = useMemo(() => byYear(photos), [photos]);
  const current = open === null ? null : photos[open];

  /** Resize the window with a short transition (skipped on phones and when maximized). */
  const resize = (bounds: Pick<WindowState, 'x' | 'y' | 'width' | 'height'>) => {
    const w = useWindows.getState().windows[win.id];
    if (!w || w.maximized || isPhone()) return;
    const el = root.current?.closest('.os-window');
    el?.classList.add('os-window-fitting');
    setTimeout(() => el?.classList.remove('os-window-fitting'), 400);
    useWindows.getState().setBounds(win.id, bounds);
  };

  // Opened for a particular photo (from Finder): show it.
  const asked = win.props?.photo;
  useEffect(() => {
    const index = asked ? photos.findIndex((p) => p.id === asked) : -1;
    if (index >= 0) show(index);
  }, [asked]);

  // Fit the window to whichever photo is showing.
  useEffect(() => {
    if (current) resize(fitTo(current));
  }, [current?.id]);

  const show = (index: number) => {
    if (open === null) {
      const { x, y, width, height } = useWindows.getState().windows[win.id];
      saved.current = { x, y, width, height };
    }
    setOpen(index);
  };

  const backToLibrary = () => {
    setOpen(null);
    if (saved.current) resize(saved.current);
  };

  const step = (delta: number) => setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length));

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') backToLibrary();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (photos.length === 0) {
    return (
      <div className="os-app os-empty os-photos-empty">
        <p>Photos couldn’t be loaded right now.</p>
        <a className="os-button" href={links.photography} target="_blank" rel="noopener">
          View on Unsplash ↗
        </a>
      </div>
    );
  }

  if (current) {
    const date = new Date(current.taken).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return (
      <div ref={root} className="os-app os-photo-viewer">
        <div className="os-toolbar">
          <button type="button" className="os-button" onClick={backToLibrary}>
            ‹ Library
          </button>
          <div className="os-segmented" role="group" aria-label="Browse">
            <button type="button" aria-label="Previous photo" onClick={() => step(-1)}>
              ◀
            </button>
            <button type="button" aria-label="Next photo" onClick={() => step(1)}>
              ▶
            </button>
          </div>
          <span className="os-toolbar-meta">
            {open! + 1} of {photos.length} · {date}
          </span>
          <button
            type="button"
            className="os-button"
            disabled={wallpaper === current.full}
            onClick={() => useWindows.getState().setWallpaper(current.full)}
          >
            {wallpaper === current.full ? 'Desktop Picture ✓' : 'Set as Desktop'}
          </button>
          <a className="os-button" href={current.page} target="_blank" rel="noopener">
            Unsplash ↗
          </a>
          <button
            type="button"
            className="os-button"
            aria-pressed={info}
            onClick={() => setInfo((i) => !i)}
            title="Show or hide the Info drawer"
          >
            ⓘ Info
          </button>
        </div>
        <div className="os-photo-stage">
          {/* object-fit: contain shows the whole photo at its own proportions. */}
          <img key={current.id} src={current.full} alt={current.alt} style={{ backgroundColor: current.color }} />
        </div>
        <Drawer open={info} label="Photo info" width={230}>
          <PhotoInfo photo={current} index={open!} total={photos.length} />
        </Drawer>
      </div>
    );
  }

  return (
    <div ref={root} className="os-app os-finder">
      <aside className="os-sidebar">
        <p className="os-sidebar-heading">Library</p>
        <button type="button" aria-pressed="true">
          Photos
          <span>{photos.length}</span>
        </button>
        <p className="os-sidebar-heading">Events</p>
        {groups.map(([year, items]) => (
          <a key={year} className="os-sidebar-link" href={`#${win.id}-${year}`}>
            {year}
            <span>{items.length}</span>
          </a>
        ))}
        <p className="os-sidebar-heading">Shared</p>
        <a className="os-sidebar-link" href={links.photography} target="_blank" rel="noopener">
          Unsplash ↗
        </a>
      </aside>

      <div className="os-finder-main">
        <div className="os-scroll os-photo-library" style={{ '--row': `${row}px` } as CSSProperties}>
          {groups.map(([year, items]) => (
            <section key={year} id={`${win.id}-${year}`}>
              <h3>
                {year}{' '}
                <span>
                  {items.length} photo{items.length === 1 ? '' : 's'}
                </span>
              </h3>
              <ul className="os-photo-rows">
                {items.map(({ index, photo }) => (
                  <li key={photo.id} style={{ '--ar': photo.width / photo.height } as CSSProperties}>
                    <button type="button" onClick={() => show(index)} aria-label={`Open photo ${index + 1}`}>
                      <img src={photo.thumb} alt={photo.alt} loading="lazy" style={{ backgroundColor: photo.color }} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="os-photo-bar">
          <span>{photos.length} photos · by Jincheng Ma on Unsplash</span>
          <input
            type="range"
            min={110}
            max={320}
            value={row}
            onChange={(e) => setRow(Number(e.target.value))}
            aria-label="Thumbnail size"
          />
        </div>
      </div>
    </div>
  );
}
