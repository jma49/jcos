import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackGlyph, ForwardGlyph } from '../../core/glyphs';
import { find, type FileNode } from '../../core/files';
import { DiskIcon, FinderIcon } from '../../core/icons';
import { ancestry, formatDate, parentOf, Thumb } from '../../files/parts';
import { QuickLook } from '../../files/QuickLook';
import { Alert } from '../../shell/Alert';

// A Finder window in Time Machine: Macintosh HD as it was on one day,
// looked through but not changed. The places down the side, back and
// forward, icons or a list, and Quick Look; opening a folder goes into
// it, opening anything else looks at it, and bringing it back to now is
// Time Machine's Restore. The folder shown, the selection and the view
// belong to Time Machine, so they stay put as the days go by.

export type View = 'icons' | 'list';

export interface Place {
  /** The folder shown, or where it would be: a day without it shows the nearest folder it had. */
  path: string;
  selected: string | null;
  view: View;
  looking: boolean;
}

/** The folder a day shows for `path`: the path itself, or the nearest folder above it that the day had. */
export function folderOn(disk: FileNode, path: string): FileNode {
  return (
    ancestry(path)
      .reverse()
      .map((p) => find(disk, p))
      .find((node): node is FileNode => !!node?.children) ?? disk
  );
}

/** Whether a key press belongs to a text field. */
const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]');

export function Browser({
  disk,
  place,
  front,
  canBack,
  canForward,
  onBack,
  onForward,
  onGo,
  onChange,
  restore
}: {
  disk: FileNode;
  place: Place;
  /** The window in front, whose the keys and the pointer are. */
  front: boolean;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  /** Goes into a folder. */
  onGo: (path: string) => void;
  onChange: (change: Partial<Place>) => void;
  /** Quick Look's Restore button, when what it shows can be brought back to now. */
  restore: ReactNode;
}) {
  const folder = folderOn(disk, place.path);
  const items = folder.children ?? [];
  const selected = items.find((n) => n.path === place.selected) ?? null;
  const [locked, setLocked] = useState<FileNode | null>(null);
  const main = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const go = (node: FileNode) => {
    const shut = ancestry(node.path)
      .map((p) => find(disk, p))
      .find((n) => n?.locked);
    if (shut) setLocked(shut);
    else onGo(node.path);
  };
  const open = (node: FileNode) => {
    if (node.children || node.locked) go(node);
    else onChange({ selected: node.path, looking: true });
  };
  const select = (node: FileNode | null) => onChange({ selected: node?.path ?? null });

  /** How many icons fit on a row of the grid. */
  const perRow = () => {
    const grid = main.current?.querySelector('.os-files-grid');
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1;
  };

  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (locked || typing(e)) return;
    if (e.metaKey || e.altKey) {
      const parent = folder.path === '/' ? null : parentOf(folder.path);
      if (e.code === 'ArrowUp' && parent) {
        e.preventDefault();
        onGo(parent);
      } else if (e.code === 'ArrowDown' && selected) {
        e.preventDefault();
        open(selected);
      } else if (e.code === 'BracketLeft' && canBack) {
        e.preventDefault();
        onBack();
      } else if (e.code === 'BracketRight' && canForward) {
        e.preventDefault();
        onForward();
      } else if (e.altKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
        e.preventDefault();
        onChange({ view: e.code === 'Digit1' ? 'icons' : 'list' });
      }
      return;
    }
    if (e.ctrlKey) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (!items.length) return;
      const i = selected ? items.indexOf(selected) : -1;
      if (i < 0) return select(items[0]);
      if (place.view === 'list' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      const icons = place.view === 'icons';
      const step = { ArrowUp: icons ? -perRow() : -1, ArrowDown: icons ? perRow() : 1, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
      select(items[Math.max(0, Math.min(items.length - 1, i + step))]);
    } else if (e.key === 'Enter' && selected) {
      e.preventDefault();
      open(selected);
    } else if (e.key === ' ' && (selected || place.looking)) {
      e.preventDefault();
      onChange({ looking: !place.looking });
    } else if (e.key === 'Escape' && place.looking) {
      // Time Machine's own Escape (Cancel) waits for Quick Look to close.
      e.preventDefault();
      onChange({ looking: false });
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 1000 ? typed.current.text + e.key : e.key, at: now };
      const hit = items.find((n) => n.name.toLowerCase().startsWith(typed.current.text.toLowerCase()));
      if (hit) select(hit);
    }
  };
  // Before Time Machine's own keys, whenever this window came to the front:
  // an Escape that closes Quick Look mustn't leave Time Machine as well.
  useEffect(() => {
    if (!front) return;
    const handler = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [front]);

  // Keep the selection in sight as the keys move it.
  useEffect(() => {
    if (!front || !place.selected) return;
    main.current?.querySelector(`[data-path="${CSS.escape(place.selected)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [front, place.selected, place.view]);

  const itemProps = (node: FileNode) => ({
    'data-selected': place.selected === node.path,
    'data-path': node.path,
    onClick: (e: React.MouseEvent) => {
      // Touch has no double-click, so a tap opens right away.
      if ((e.nativeEvent as PointerEvent).pointerType === 'touch') open(node);
      else select(node);
    },
    onDoubleClick: () => open(node)
  });

  // The places: the disk, then the home first, as on a Mac, then the disk's folders.
  const home = find(disk, '/Users/jincheng');
  const places = [...(home ? [home] : []), ...(disk.children ?? []).filter((n) => n.path !== '/Users')];
  const placeButton = (node: FileNode, Icon = node.Icon) => (
    <button
      key={node.path}
      type="button"
      className="os-sidebar-place"
      aria-pressed={folder.path === node.path || (node.path !== '/' && folder.path.startsWith(`${node.path}/`))}
      onClick={() => go(node)}
    >
      <span className="os-sidebar-icon">
        <Icon size={22} />
      </span>
      {node.name}
    </button>
  );

  return (
    <div className="os-app os-tm-finder">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Navigate">
          <button type="button" disabled={!canBack} onClick={onBack} aria-label="Back" title="Back (⌘[)">
            <BackGlyph />
          </button>
          <button type="button" disabled={!canForward} onClick={onForward} aria-label="Forward" title="Forward (⌘])">
            <ForwardGlyph />
          </button>
        </div>
        <div className="os-segmented" role="group" aria-label="View">
          <button type="button" aria-pressed={place.view === 'icons'} onClick={() => onChange({ view: 'icons' })} aria-label="Icons" title="As Icons (⌥1)">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" fill="currentColor" />
            </svg>
          </button>
          <button type="button" aria-pressed={place.view === 'list'} onClick={() => onChange({ view: 'list' })} aria-label="List" title="As List (⌥2)">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 2h12v2H1zM1 6h12v2H1zM1 10h12v2H1z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="os-button os-tm-look"
          aria-pressed={place.looking}
          disabled={!selected}
          onClick={() => onChange({ looking: !place.looking })}
          aria-label="Quick Look"
          title="Quick Look (Space)"
        >
          <svg viewBox="0 0 18 12" width="16" height="11" aria-hidden="true">
            <path d="M9 1C5 1 2 4 1 6c1 2 4 5 8 5s7-3 8-5c-1-2-4-5-8-5z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="6" r="2.6" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div className="os-finder">
        <aside className="os-sidebar" aria-label="Places">
          <p className="os-sidebar-heading">Devices</p>
          {placeButton(disk, DiskIcon)}
          <p className="os-sidebar-heading">Places</p>
          {places.map((node) => placeButton(node))}
        </aside>

        <div ref={main} className="os-finder-main">
          {place.view === 'icons' ? (
            <ul className="os-scroll os-files-grid" onPointerDown={(e) => e.target === e.currentTarget && select(null)}>
              {items.map((node) => (
                <li key={node.path}>
                  <button type="button" {...itemProps(node)}>
                    <Thumb node={node} size={64} />
                    <span className="os-finder-name">{node.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="os-scroll os-files-list" role="table" aria-label={folder.name}>
              <div role="row" className="os-files-head">
                <span role="columnheader">Name</span>
                <span role="columnheader">{folder.path === '/Movies' ? 'Date Added' : 'Date Modified'}</span>
                <span role="columnheader">Kind</span>
              </div>
              {items.map((node) => (
                <button key={node.path} type="button" role="row" {...itemProps(node)}>
                  <span role="cell" className="os-files-name">
                    <Thumb node={node} size={16} />
                    {node.name}
                  </span>
                  <span role="cell">{formatDate(node.date)}</span>
                  <span role="cell">{node.kind}</span>
                </button>
              ))}
            </div>
          )}
          {items.length === 0 && <p className="os-finder-empty">Nothing was here yet.</p>}

          <div className="os-finder-status">
            <span className="os-tm-path">{ancestry(folder.path).map((p) => find(disk, p)?.name).join(' ▸ ')}</span>
            <span>
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
          </div>

          {front && place.looking && selected && (
            <QuickLook node={selected} onClose={() => onChange({ looking: false })} actions={restore} />
          )}
        </div>
      </div>
      {locked && (
        <Alert
          Icon={FinderIcon}
          message={`The folder “${locked.name}” could not be opened because you do not have sufficient access privileges.`}
          onConfirm={() => setLocked(null)}
        />
      )}
    </div>
  );
}
