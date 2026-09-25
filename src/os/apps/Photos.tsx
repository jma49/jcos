import { useEffect, useState } from 'react';
import { useOSData } from '../context';

/** iPhoto-style library of the Unsplash photos fetched at build time. */
export default function Photos() {
  const { photos, links } = useOSData();
  const [size, setSize] = useState(170);
  const [open, setOpen] = useState<number | null>(null);

  const current = open === null ? null : photos[open];
  const step = (delta: number) =>
    setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length));

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') setOpen(null);
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
      <div className="os-app os-photo-viewer">
        <div className="os-toolbar">
          <button type="button" className="os-button" onClick={() => setOpen(null)}>
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
            View on Unsplash ↗
          </a>
        </div>
        <div className="os-photo-stage">
          <img
            key={current.id}
            src={current.full}
            alt={current.alt}
            style={{ backgroundColor: current.color, aspectRatio: `${current.width} / ${current.height}` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="os-app os-finder">
      <aside className="os-sidebar">
        <p className="os-sidebar-heading">Source</p>
        <button type="button" aria-pressed="true">
          Library
          <span>{photos.length}</span>
        </button>
        <a className="os-sidebar-link" href={links.photography} target="_blank" rel="noopener">
          Unsplash ↗
        </a>
      </aside>

      <div className="os-finder-main">
        <ul className="os-scroll os-photo-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
                <img
                  src={p.thumb}
                  alt={p.alt}
                  loading="lazy"
                  style={{ backgroundColor: p.color, aspectRatio: `${p.width} / ${p.height}` }}
                />
              </button>
            </li>
          ))}
        </ul>
        <div className="os-photo-bar">
          <span>
            {photos.length} photos · by Jincheng Ma on Unsplash
          </span>
          <input
            type="range"
            min={110}
            max={320}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Thumbnail size"
          />
        </div>
      </div>
    </div>
  );
}
