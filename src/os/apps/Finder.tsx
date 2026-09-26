import { useEffect, useMemo, useRef, useState } from 'react';
import { useOSData } from '../core/context';
import type { AppProps } from '../core/registry';
import { useFocusedId, useWindows } from '../core/store';
import { useInstalledApplets } from '../core/applets';
import { buildDisk, find, type FileNode } from '../core/files';
import { DiskIcon } from '../core/icons';
import { Drawer } from '../shell/drawer';

// Finder over Macintosh HD (files.ts): a sidebar of places, back and
// forward, icon or list views, a search field that looks through the
// whole disk, and an action (gear) menu for arranging. Double-click (or
// Enter) opens.

type View = 'icons' | 'list';
type Arrange = 'none' | 'name' | 'date' | 'kind';
interface Prefs {
  view: View;
  arrange: Arrange;
  /** Icon size in icon view. */
  size: 48 | 64 | 80;
}

const PREFS_KEY = 'os-finder';
const DEFAULT_PREFS: Prefs = { view: 'icons', arrange: 'none', size: 64 };

function savedPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    // Earlier versions kept only the view, under its own key.
    const view = localStorage.getItem('os-finder-view') === 'list' ? 'list' : DEFAULT_PREFS.view;
    return { ...DEFAULT_PREFS, view, ...saved };
  } catch {
    return DEFAULT_PREFS;
  }
}

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '--';

const ARRANGERS: Record<Arrange, ((a: FileNode, b: FileNode) => number) | null> = {
  none: null,
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  date: (a, b) => (b.date ?? '').localeCompare(a.date ?? ''),
  kind: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
};

/** Every file and folder on the disk, for search. */
function everything(node: FileNode): FileNode[] {
  return (node.children ?? []).flatMap((c) => [c, ...everything(c)]);
}

const parentOf = (path: string) => path.split('/').slice(0, -1).join('/') || '/';

function Thumb({ node, size }: { node: FileNode; size: number }) {
  if (node.thumb) {
    return (
      <span className="os-file-thumb" style={{ width: size, height: size }}>
        <img src={node.thumb} alt="" loading="lazy" draggable={false} />
      </span>
    );
  }
  const { Icon } = node;
  return <Icon size={size} />;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.7 1h2.6l.4 1.9 1.3.6 1.7-1 1.8 1.8-1 1.7.6 1.3 1.9.4v2.6l-1.9.4-.6 1.3 1 1.7-1.8 1.8-1.7-1-1.3.6-.4 1.9H6.7l-.4-1.9-1.3-.6-1.7 1-1.8-1.8 1-1.7-.6-1.3L0 9.3V6.7l1.9-.4.6-1.3-1-1.7 1.8-1.8 1.7 1 1.3-.6zM8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z"
      />
    </svg>
  );
}

interface MenuItem {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  action?: () => void;
  divider?: boolean;
}

/** The toolbar's action menu: a gear button with a popup of commands. */
function ActionMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="os-finder-action">
      <button
        type="button"
        className="os-button os-finder-gear"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Action"
        title="Action"
        onClick={() => setOpen((o) => !o)}
      >
        <GearIcon />
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="os-menu-list os-finder-action-menu" role="menu">
          {items.map((item, i) =>
            item.divider ? (
              <li key={i} className="os-menu-divider" role="separator" />
            ) : (
              <li key={i} role="none">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={item.checked ?? false}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.action?.();
                  }}
                >
                  <span>
                    <span className="os-menu-check" aria-hidden="true">
                      {item.checked ? '✓' : ''}
                    </span>
                    {item.label}
                  </span>
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

/** What Get Info shows for a file or folder. */
function FileInfo({ node, disk }: { node: FileNode; disk: FileNode }) {
  const where = node.path === '/' ? '—' : find(disk, parentOf(node.path))?.name;
  return (
    <div className="os-info os-file-info">
      <div className="os-file-info-icon">
        <Thumb node={node} size={96} />
      </div>
      <h3>{node.name}</h3>
      <dl>
        <dt>Kind</dt>
        <dd>{node.kind}</dd>
        <dt>Where</dt>
        <dd>{where}</dd>
        {node.children && (
          <>
            <dt>Contains</dt>
            <dd>
              {node.children.length} item{node.children.length === 1 ? '' : 's'}
            </dd>
          </>
        )}
        {node.date && (
          <>
            <dt>Modified</dt>
            <dd>{formatDate(node.date)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default function Finder({ win }: AppProps) {
  const data = useOSData();
  const applets = useInstalledApplets();
  const disk = useMemo(() => buildDisk(data, applets), [data, applets]);
  const all = useMemo(() => everything(disk), [disk]);
  const [history, setHistory] = useState<string[]>(() => [win.props?.path ?? '/']);
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(savedPrefs);
  const [query, setQuery] = useState('');
  const [info, setInfo] = useState(false);

  const path = history[at];
  const folder = find(disk, path) ?? disk;
  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();
  const found = searching ? all.filter((n) => n.name.toLowerCase().includes(q) || n.kind.toLowerCase().includes(q)) : null;
  const unsorted = found ?? folder.children ?? [];
  const sorter = ARRANGERS[prefs.arrange];
  const items = sorter ? [...unsorted].sort(sorter) : unsorted;
  const title = searching ? `Searching “${query.trim()}”` : folder.name;

  // Keep the window's title on the folder it shows.
  useEffect(() => {
    useWindows.getState().setTitle(win.id, title);
  }, [win.id, title]);

  // Opening Finder again at another place (e.g. from the desktop) goes there.
  const asked = win.props?.path;
  useEffect(() => {
    if (asked && asked !== history[at]) go(asked);
  }, [asked]);

  const go = (next: string) => {
    setQuery('');
    if (next === history[at]) return;
    setHistory([...history.slice(0, at + 1), next]);
    setAt(at + 1);
    setSelected(null);
  };

  const open = (node: FileNode, el: Element | null) => {
    if (node.children) go(node.path);
    else node.open?.(el);
  };

  const update = (next: Partial<Prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
    } catch {}
  };

  const parent = path === '/' ? null : parentOf(path);

  // Keyboard shortcuts work whenever this is the front window. (Clicking a
  // button doesn't focus it in Safari or Chrome on a Mac, so a handler on
  // the window's own element would miss them.) e.code, because ⌥ changes
  // e.key on a Mac.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (!(e.metaKey || e.altKey)) return;
    if (e.code === 'ArrowUp' && parent) {
      e.preventDefault();
      go(parent);
    } else if (e.altKey && e.code === 'KeyI') {
      e.preventDefault();
      setInfo((i) => !i);
    } else if (e.code === 'BracketLeft' && at > 0) {
      e.preventDefault();
      setAt(at - 1);
    } else if (e.code === 'BracketRight' && at < history.length - 1) {
      e.preventDefault();
      setAt(at + 1);
    }
  };
  const front = useFocusedId() === win.id;
  useEffect(() => {
    if (!front) return;
    const handler = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [front]);

  const [disk0, ...folders] = [{ ...disk, Icon: DiskIcon }, ...(disk.children ?? [])];
  const selectedNode = selected ? all.find((n) => n.path === selected) : undefined;

  const actions: MenuItem[] = [
    { label: 'Open', disabled: !selectedNode, action: () => selectedNode && open(selectedNode, null) },
    { label: info ? 'Hide Info (⌥I)' : 'Get Info (⌥I)', action: () => setInfo((i) => !i) },
    ...(searching
      ? [{ label: 'Show in Enclosing Folder', disabled: !selectedNode, action: () => selectedNode && go(parentOf(selectedNode.path)) }]
      : []),
    { label: '', divider: true },
    ...(['none', 'name', 'date', 'kind'] as const).map((a) => ({
      label: a === 'none' ? 'Keep Arranged: Off' : `Arrange by ${a[0].toUpperCase()}${a.slice(1)}`,
      checked: prefs.arrange === a,
      action: () => update({ arrange: a })
    })),
    { label: '', divider: true },
    {
      label: 'Larger Icons',
      disabled: prefs.view !== 'icons' || prefs.size === 80,
      action: () => update({ size: prefs.size === 48 ? 64 : 80 })
    },
    {
      label: 'Smaller Icons',
      disabled: prefs.view !== 'icons' || prefs.size === 48,
      action: () => update({ size: prefs.size === 80 ? 64 : 48 })
    }
  ];

  const itemProps = (node: FileNode) => ({
    'data-selected': selected === node.path,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      // Touch has no double-click, so a tap opens right away.
      if ((e.nativeEvent as PointerEvent).pointerType === 'touch') open(node, e.currentTarget);
      else setSelected(node.path);
    },
    onDoubleClick: (e: React.MouseEvent<HTMLElement>) => open(node, e.currentTarget),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => e.key === 'Enter' && open(node, e.currentTarget)
  });

  const placeButton = (node: FileNode) => (
    <button
      key={node.path}
      type="button"
      className="os-sidebar-place"
      aria-pressed={!searching && (path === node.path || (node.path !== '/' && path.startsWith(`${node.path}/`)))}
      onClick={() => go(node.path)}
    >
      <span className="os-sidebar-icon">
        <node.Icon size={22} />
      </span>
      {node.name}
    </button>
  );

  const crumbs = [
    '/',
    ...path
      .split('/')
      .filter(Boolean)
      .map((_, i, parts) => `/${parts.slice(0, i + 1).join('/')}`)
  ];

  return (
    <div className="os-app os-finder-app">
      <div className="os-toolbar">
        <div className="os-segmented" role="group" aria-label="Navigate">
          <button type="button" disabled={at === 0} onClick={() => setAt(at - 1)} aria-label="Back" title="Back (⌥[)">
            ◀
          </button>
          <button type="button" disabled={at >= history.length - 1} onClick={() => setAt(at + 1)} aria-label="Forward" title="Forward (⌥])">
            ▶
          </button>
        </div>
        <div className="os-segmented" role="group" aria-label="View">
          <button
            type="button"
            aria-pressed={prefs.view === 'icons'}
            onClick={() => update({ view: 'icons' })}
            aria-label="Icons"
            title="As Icons"
          >
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            aria-pressed={prefs.view === 'list'}
            onClick={() => update({ view: 'list' })}
            aria-label="List"
            title="As List"
          >
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 2h12v2H1zM1 6h12v2H1zM1 10h12v2H1z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <ActionMenu items={actions} />
        <label className="os-search-field">
          <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search"
            aria-label="Search Macintosh HD"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
        </label>
      </div>
      <div className="os-finder">
        <aside className="os-sidebar" aria-label="Places">
          {placeButton(disk0)}
          <hr className="os-sidebar-divider" />
          {folders.map(placeButton)}
        </aside>

        <div className="os-finder-main">
          {prefs.view === 'icons' ? (
            <ul
              className="os-scroll os-files-grid"
              style={{ '--icon': `${prefs.size}px` } as React.CSSProperties}
              onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
            >
              {items.map((node) => (
                <li key={node.path}>
                  <button type="button" {...itemProps(node)} title={searching ? node.path : undefined}>
                    <Thumb node={node} size={prefs.size} />
                    <span className="os-finder-name">{node.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="os-scroll os-files-list" role="table" aria-label={title} data-searching={searching || undefined}>
              <div role="row" className="os-files-head">
                <span role="columnheader">Name</span>
                <span role="columnheader">{searching ? 'Where' : 'Date Modified'}</span>
                <span role="columnheader">Kind</span>
              </div>
              {items.map((node) => (
                <button key={node.path} type="button" role="row" {...itemProps(node)}>
                  <span role="cell" className="os-files-name">
                    <Thumb node={node} size={16} />
                    {node.name}
                  </span>
                  <span role="cell">{searching ? find(disk, parentOf(node.path))?.name : formatDate(node.date)}</span>
                  <span role="cell">{node.kind}</span>
                </button>
              ))}
            </div>
          )}
          {searching && items.length === 0 && <p className="os-finder-empty">Nothing on Macintosh HD matches “{query.trim()}”.</p>}

          <div className="os-finder-status">
            {searching ? (
              <span>
                {items.length} result{items.length === 1 ? '' : 's'} on Macintosh HD
              </span>
            ) : (
              <>
                <nav className="os-finder-path" aria-label="Path">
                  {crumbs.map((p, i) => (
                    <span key={p}>
                      {i > 0 && <span aria-hidden="true"> ▸ </span>}
                      <button type="button" onClick={() => go(p)}>
                        {find(disk, p)?.name}
                      </button>
                    </span>
                  ))}
                </nav>
                <span>
                  {items.length} item{items.length === 1 ? '' : 's'}
                  {folder.path === '/Applets' ? ' · get more in the Applet Store' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <Drawer open={info} label="Info" width={220}>
        <FileInfo node={selectedNode ?? folder} disk={disk} />
      </Drawer>
    </div>
  );
}
