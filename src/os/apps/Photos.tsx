import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useOSData } from '../context';
import type { AppProps } from '../registry';
import { DOCK_CLEARANCE, MENU_BAR_HEIGHT, MOBILE_BREAKPOINT, useWindows } from '../store';
import type { OSPhoto, WindowState } from '../types';

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

/** iPhoto-style library of the Unsplash photos fetched at build time. */
export default function Photos({ win }: AppProps) {
  const { photos, links } = useOSData();
  const [row, setRow] = useState(180);
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const saved = useRef<Pick<WindowState, 'x' | 'y' | 'width' | 'height'> | null>(null);
  const groups = useMemo(() => byYear(photos), [photos]);
  const current = open === null ? null : photos[open];

  /** Resize the window with a short transition (skipped on phones and when maximized). */
  const resize = (bounds: Pick<WindowState, 'x' | 'y' | 'width' | 'height'>) => {
    const w = useWindows.getState().windows[win.id];
    if (!w || w.maximized || window.innerWidth < MOBILE_BREAKPOINT) return;
    const el = root.current?.closest('.os-window');
    el?.classList.add('os-window-fitting');
    setTimeout(() => el?.classList.remove('os-window-fitting'), 400);
    useWindows.getState().setBounds(win.id, bounds);
  };

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
          <a className="os-button" href={current.page} target="_blank" rel="noopener">
            Unsplash ↗
          </a>
        </div>
        <div className="os-photo-stage">
          {/* object-fit: contain shows the whole photo at its own proportions. */}
          <img key={current.id} src={current.full} alt={current.alt} style={{ backgroundColor: current.color }} />
        </div>
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
