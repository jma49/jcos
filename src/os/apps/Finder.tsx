import { useEffect, useMemo, useState } from 'react';
import { useOSData } from '../context';
import type { AppProps } from '../registry';
import { useWindows } from '../store';
import { useInstalledApplets } from '../applets';
import { buildDisk, find, type FileNode } from '../files';
import { DiskIcon } from '../icons';

// Finder over Macintosh HD (files.ts): a sidebar of places, back and
// forward, and icon or list views. Double-click (or Enter) opens.

type View = 'icons' | 'list';

const VIEW_KEY = 'os-finder-view';

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'icons';
  } catch {
    return 'icons';
  }
}

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '--';

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

export default function Finder({ win }: AppProps) {
  const data = useOSData();
  const applets = useInstalledApplets();
  const disk = useMemo(() => buildDisk(data, applets), [data, applets]);
  const [history, setHistory] = useState<string[]>(() => [win.props?.path ?? '/']);
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>(savedView);

  const path = history[at];
  const folder = find(disk, path) ?? disk;
  const items = folder.children ?? [];

  // Keep the window's title on the folder it shows.
  useEffect(() => {
    useWindows.getState().setTitle(win.id, folder.name);
  }, [win.id, folder.name]);

  // Opening Finder again at another place (e.g. from the desktop) goes there.
  const asked = win.props?.path;
  useEffect(() => {
    if (asked && asked !== history[at]) go(asked);
  }, [asked]);

  const go = (next: string) => {
    if (next === history[at]) return;
    setHistory([...history.slice(0, at + 1), next]);
    setAt(at + 1);
    setSelected(null);
  };

  const open = (node: FileNode, el: Element | null) => {
    if (node.children) go(node.path);
    else node.open?.(el);
  };

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };

  const parent = path === '/' ? null : path.split('/').slice(0, -1).join('/') || '/';

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.altKey) && e.key === 'ArrowUp' && parent) {
      e.preventDefault();
      go(parent);
    } else if ((e.metaKey || e.altKey) && e.key === '[' && at > 0) {
      setAt(at - 1);
    } else if ((e.metaKey || e.altKey) && e.key === ']' && at < history.length - 1) {
      setAt(at + 1);
    }
  };

  const places: { path: string; node: FileNode }[] = [
    { path: '/', node: { ...disk, Icon: DiskIcon } },
    ...(disk.children ?? []).map((c) => ({ path: c.path, node: c }))
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

  return (
    <div className="os-app os-finder-app" onKeyDown={onKey}>
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
          <button type="button" aria-pressed={view === 'icons'} onClick={() => changeView('icons')} aria-label="Icons" title="As Icons">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" fill="currentColor" />
            </svg>
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => changeView('list')} aria-label="List" title="As List">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 2h12v2H1zM1 6h12v2H1zM1 10h12v2H1z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <nav className="os-finder-path" aria-label="Path">
          {[
            '/',
            ...path
              .split('/')
              .filter(Boolean)
              .map((_, i, parts) => `/${parts.slice(0, i + 1).join('/')}`)
          ].map((p, i) => (
            <span key={p}>
              {i > 0 && <span aria-hidden="true"> ▸ </span>}
              <button type="button" onClick={() => go(p)}>
                {find(disk, p)?.name}
              </button>
            </span>
          ))}
        </nav>
      </div>

      <div className="os-finder">
        <aside className="os-sidebar" aria-label="Places">
          <p className="os-sidebar-heading">Places</p>
          {places.map(({ path: p, node }) => (
            <button
              key={p}
              type="button"
              className="os-sidebar-place"
              aria-pressed={path === p || (p !== '/' && path.startsWith(`${p}/`))}
              onClick={() => go(p)}
            >
              <span className="os-sidebar-icon">
                <node.Icon size={18} />
              </span>
              {node.name}
            </button>
          ))}
        </aside>

        <div className="os-finder-main">
          {view === 'icons' ? (
            <ul className="os-scroll os-files-grid" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
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
                <span role="columnheader">Date Modified</span>
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

          <p className="os-finder-status">
            {items.length} item{items.length === 1 ? '' : 's'}
            {folder.path === '/Applets' ? ' · get more in the Applet Store' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
