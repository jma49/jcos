import { useEffect, useMemo, useRef, useState } from 'react';
import { useOSData } from '../../core/context';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { useFocusedId, useWindows } from '../../core/store';
import { useInstalledApplets } from '../../core/applets';
import { buildDisk, find, type FileNode } from '../../core/files';
import { AirDropIcon, DiskIcon } from '../../core/icons';
import { Drawer } from '../../shell/drawer';
import { ContextMenu, type ContextMenuItem } from '../../shell/ContextMenu';
import { load, loadSettings, saveJSON } from '../../core/storage';
import { PATH_MIME, shareViaAirDrop } from '../../social/airdrop';
import { ActionMenu, ARRANGERS, ancestry, everything, FileInfo, formatDate, parentOf, Thumb, type Arrange, type View } from './parts';
import { ColumnView } from './ColumnView';
import { QuickLook } from './QuickLook';

// Finder over Macintosh HD (files.ts): a sidebar of places, back and
// forward, icon, list or column views, a search field that looks through
// the whole disk, and an action (gear) menu for arranging. Double-click
// (or Enter) opens; the arrow keys move the selection, typing a name
// jumps to it, Space shows Quick Look, and a right-click or a drag onto
// AirDrop shares.

interface Prefs {
  view: View;
  arrange: Arrange;
  /** Icon size in icon view. */
  size: 48 | 64 | 80;
}

const PREFS_KEY = 'os-finder';
const DEFAULT_PREFS: Prefs = { view: 'icons', arrange: 'none', size: 64 };
const VIEWS: View[] = ['icons', 'list', 'columns'];

function savedPrefs(): Prefs {
  // Earlier versions kept only the view, under its own key.
  const view = load('os-finder-view') === 'list' ? 'list' : DEFAULT_PREFS.view;
  const prefs = loadSettings(PREFS_KEY, { ...DEFAULT_PREFS, view });
  return VIEWS.includes(prefs.view) ? prefs : { ...prefs, view: 'icons' };
}

/** Whether a key press belongs to a text field rather than to Finder. */
const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]');

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
  const [looking, setLooking] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
  const [dropping, setDropping] = useState(false);
  const main = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const path = history[at];
  const folder = find(disk, path) ?? disk;
  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();
  const found = searching ? all.filter((n) => n.name.toLowerCase().includes(q) || n.kind.toLowerCase().includes(q)) : null;
  const sorter = ARRANGERS[prefs.arrange];
  const sort = (nodes: FileNode[]) => (sorter ? [...nodes].sort(sorter) : nodes);
  const items = sort(found ?? folder.children ?? []);
  const view: View = searching && prefs.view === 'columns' ? 'list' : prefs.view;
  const selectedNode = selected ? (all.find((n) => n.path === selected) ?? null) : null;
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

  /** Shows a folder; `replace` doesn't add a step to Back (column view's clicks). */
  const go = (next: string, { replace = false, select = null as string | null } = {}) => {
    setQuery('');
    setSelected(select);
    if (next === history[at]) return;
    if (replace) {
      setHistory([...history.slice(0, at), next]);
    } else {
      setHistory([...history.slice(0, at + 1), next]);
      setAt(at + 1);
    }
  };

  const open = (node: FileNode, el: Element | null) => {
    setLooking(false);
    if (node.children) go(node.path);
    else node.open?.(el);
  };

  const update = (next: Partial<Prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveJSON(PREFS_KEY, merged);
  };

  /** Selects a node; in column view that also opens the folder it's in. */
  const choose = (node: FileNode) => {
    if (view === 'columns') go(parentOf(node.path), { replace: true, select: node.path });
    else setSelected(node.path);
  };

  const parent = path === '/' ? null : parentOf(path);

  // The items the arrow keys move through: the open folder (or the results),
  // or in column view the selection's own column.
  const siblings = () => {
    if (view !== 'columns' || !selectedNode) return items;
    return sort(find(disk, parentOf(selectedNode.path))?.children ?? []);
  };

  /** How many icons fit on a row of the icon grid. */
  const perRow = () => {
    const grid = main.current?.querySelector('.os-files-grid');
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1;
  };

  const move = (key: string) => {
    const list = siblings();
    if (!list.length) return;
    const i = selectedNode ? list.findIndex((n) => n.path === selectedNode.path) : -1;
    if (i < 0) return choose(list[0]);
    if (view === 'columns' && key === 'ArrowLeft') {
      const up = parentOf(selectedNode!.path);
      if (up !== '/') go(parentOf(up), { replace: true, select: up });
      return;
    }
    if (view === 'columns' && key === 'ArrowRight') {
      const first = selectedNode?.children && sort(selectedNode.children)[0];
      if (first) go(selectedNode!.path, { replace: true, select: first.path });
      return;
    }
    const step = { ArrowUp: view === 'icons' ? -perRow() : -1, ArrowDown: view === 'icons' ? perRow() : 1, ArrowLeft: -1, ArrowRight: 1 }[key] ?? 0;
    if (view !== 'icons' && (key === 'ArrowLeft' || key === 'ArrowRight')) return;
    choose(list[Math.max(0, Math.min(list.length - 1, i + step))]);
  };

  /** Jumps to the first item whose name starts with what's been typed in the last second. */
  const jump = (char: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at < 1000 ? typed.current.text + char : char, at: now };
    const prefix = typed.current.text.toLowerCase();
    const list = siblings();
    const hit = list.find((n) => n.name.toLowerCase().startsWith(prefix));
    if (hit) choose(hit);
  };

  // Keyboard shortcuts work whenever this is the front window. (Clicking a
  // button doesn't focus it in Safari or Chrome on a Mac, so a handler on
  // the window's own element would miss them.) e.code, because ⌥ changes
  // e.key on a Mac.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (e.metaKey || e.altKey) {
      if (e.code === 'ArrowUp' && parent) {
        e.preventDefault();
        go(parent);
      } else if (e.code === 'ArrowDown' && selectedNode) {
        e.preventDefault();
        open(selectedNode, null);
      } else if (e.altKey && e.code === 'KeyI') {
        e.preventDefault();
        setInfo((i) => !i);
      } else if (e.altKey && /^Digit[123]$/.test(e.code)) {
        e.preventDefault();
        update({ view: VIEWS[Number(e.code.slice(-1)) - 1] });
      } else if (e.code === 'BracketLeft' && at > 0) {
        e.preventDefault();
        setAt(at - 1);
      } else if (e.code === 'BracketRight' && at < history.length - 1) {
        e.preventDefault();
        setAt(at + 1);
      }
      return;
    }
    if (typing(e) || e.ctrlKey) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      move(e.key);
    } else if (e.key === 'Enter' && selectedNode) {
      e.preventDefault();
      open(selectedNode, main.current?.querySelector('[data-selected="true"]') ?? null);
    } else if (e.key === ' ' && (selectedNode || looking)) {
      e.preventDefault();
      setLooking((l) => !l);
    } else if (e.key === 'Escape' && looking) {
      e.preventDefault();
      setLooking(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      jump(e.key);
    }
  };
  const front = useFocusedId() === win.id;
  useEffect(() => {
    if (!front) return;
    const handler = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [front]);

  // Keep the selection in sight as the keys move it.
  useEffect(() => {
    if (!selected) return;
    main.current?.querySelector(`[data-path="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected, view]);

  // Quick Look closes with nothing to show.
  useEffect(() => {
    if (!selectedNode) setLooking(false);
  }, [selectedNode]);

  const [disk0, ...folders] = [{ ...disk, Icon: DiskIcon }, ...(disk.children ?? [])];

  const viewItems: ContextMenuItem[] = [
    { label: 'as Icons', shortcut: '⌥1', checked: view === 'icons', action: () => update({ view: 'icons' }) },
    { label: 'as List', shortcut: '⌥2', checked: view === 'list', action: () => update({ view: 'list' }) },
    { label: 'as Columns', shortcut: '⌥3', checked: view === 'columns', disabled: searching, action: () => update({ view: 'columns' }) }
  ];
  const arrangeItems: ContextMenuItem[] = (['none', 'name', 'date', 'kind'] as const).map((a) => ({
    label: a === 'none' ? 'Keep Arranged: Off' : `Arrange by ${a[0].toUpperCase()}${a.slice(1)}`,
    checked: prefs.arrange === a,
    action: () => update({ arrange: a })
  }));

  /** What a right-click on a file (or on nothing) offers. */
  const menuFor = (node: FileNode | null): ContextMenuItem[] =>
    node
      ? [
          { label: 'Open', action: () => open(node, null) },
          { label: `Quick Look “${node.name}”`, shortcut: 'Space', action: () => (choose(node), setLooking(true)) },
          { label: 'Get Info', shortcut: '⌥I', action: () => (choose(node), setInfo(true)) },
          ...(searching ? [{ label: 'Show in Enclosing Folder', action: () => go(parentOf(node.path), { select: node.path }) }] : []),
          { label: '', divider: true },
          { label: 'Share with AirDrop…', action: () => shareViaAirDrop(node.path) }
        ]
      : [
          ...viewItems,
          { label: '', divider: true },
          ...arrangeItems,
          { label: '', divider: true },
          { label: info ? 'Hide Info' : 'Get Info', shortcut: '⌥I', action: () => setInfo((i) => !i) }
        ];

  const actions: ContextMenuItem[] = [
    { label: 'Open', disabled: !selectedNode, action: () => selectedNode && open(selectedNode, null) },
    { label: 'Quick Look', shortcut: 'Space', disabled: !selectedNode, action: () => setLooking(true) },
    { label: info ? 'Hide Info' : 'Get Info', shortcut: '⌥I', action: () => setInfo((i) => !i) },
    { label: 'Share with AirDrop…', disabled: !selectedNode, action: () => selectedNode && shareViaAirDrop(selectedNode.path) },
    ...(searching
      ? [{ label: 'Show in Enclosing Folder', disabled: !selectedNode, action: () => selectedNode && go(parentOf(selectedNode.path), { select: selectedNode.path }) }]
      : []),
    { label: '', divider: true },
    ...arrangeItems,
    { label: '', divider: true },
    {
      label: 'Larger Icons',
      disabled: view !== 'icons' || prefs.size === 80,
      action: () => update({ size: prefs.size === 48 ? 64 : 80 })
    },
    {
      label: 'Smaller Icons',
      disabled: view !== 'icons' || prefs.size === 48,
      action: () => update({ size: prefs.size === 80 ? 64 : 48 })
    }
  ];

  const itemProps = (node: FileNode) => ({
    'data-selected': selected === node.path,
    'data-path': node.path,
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(PATH_MIME, node.path);
      e.dataTransfer.setData('text/plain', node.name);
      e.dataTransfer.effectAllowed = 'copy';
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      // Touch has no double-click, so a tap opens right away (column view just goes deeper).
      if ((e.nativeEvent as PointerEvent).pointerType === 'touch' && !(view === 'columns' && node.children)) open(node, e.currentTarget);
      else choose(node);
    },
    onDoubleClick: (e: React.MouseEvent<HTMLElement>) => open(node, e.currentTarget),
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      choose(node);
      setMenu({ x: e.clientX, y: e.clientY, node });
    }
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

  const header = (label: string, arrange: Arrange) => (
    <span role="columnheader" aria-sort={prefs.arrange === arrange ? 'ascending' : undefined}>
      <button type="button" onClick={() => update({ arrange: prefs.arrange === arrange ? 'none' : arrange })} title={`Arrange by ${label}`}>
        {label}
        {prefs.arrange === arrange && <span aria-hidden="true"> ▾</span>}
      </button>
    </span>
  );

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
          <button type="button" aria-pressed={view === 'icons'} onClick={() => update({ view: 'icons' })} aria-label="Icons" title="As Icons (⌥1)">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" fill="currentColor" />
            </svg>
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => update({ view: 'list' })} aria-label="List" title="As List (⌥2)">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 2h12v2H1zM1 6h12v2H1zM1 10h12v2H1z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            aria-pressed={view === 'columns'}
            disabled={searching}
            onClick={() => update({ view: 'columns' })}
            aria-label="Columns"
            title="As Columns (⌥3)"
          >
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1 1h3.3v12H1zM5.35 1h3.3v12h-3.3zM9.7 1H13v12H9.7z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <ActionMenu items={actions} />
        <button
          type="button"
          className="os-button os-finder-look"
          aria-pressed={looking}
          disabled={!selectedNode}
          onClick={() => setLooking((l) => !l)}
          aria-label="Quick Look"
          title="Quick Look (Space)"
        >
          <svg viewBox="0 0 18 12" width="16" height="11" aria-hidden="true">
            <path d="M9 1C5 1 2 4 1 6c1 2 4 5 8 5s7-3 8-5c-1-2-4-5-8-5z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="6" r="2.6" fill="currentColor" />
          </svg>
        </button>
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
          <p className="os-sidebar-heading">Devices</p>
          {placeButton(disk0)}
          <p className="os-sidebar-heading">Shared</p>
          <button
            type="button"
            className="os-sidebar-place"
            data-drop={dropping || undefined}
            title="Drop a file here to share it with someone on the desktop"
            onClick={() => launch('airdrop')}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(PATH_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropping(false);
              const dropped = e.dataTransfer.getData(PATH_MIME);
              if (dropped) shareViaAirDrop(dropped);
            }}
          >
            <span className="os-sidebar-icon">
              <AirDropIcon size={22} />
            </span>
            AirDrop
          </button>
          <p className="os-sidebar-heading">Places</p>
          {folders.map(placeButton)}
        </aside>

        <div ref={main} className="os-finder-main">
          {view === 'icons' && (
            <ul
              className="os-scroll os-files-grid"
              style={{ '--icon': `${prefs.size}px` } as React.CSSProperties}
              onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, node: null });
              }}
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
          )}
          {view === 'list' && (
            <div
              className="os-scroll os-files-list"
              role="table"
              aria-label={title}
              data-searching={searching || undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, node: null });
              }}
            >
              <div role="row" className="os-files-head">
                {header('Name', 'name')}
                {searching ? <span role="columnheader">Where</span> : header('Date Modified', 'date')}
                {header('Kind', 'kind')}
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
          {view === 'columns' && <ColumnView disk={disk} path={path} selected={selected} sort={sort} itemProps={itemProps} />}
          {searching && items.length === 0 && <p className="os-finder-empty">Nothing on Macintosh HD matches “{query.trim()}”.</p>}

          <div className="os-finder-status">
            {searching ? (
              <span>
                {items.length} result{items.length === 1 ? '' : 's'} on Macintosh HD
              </span>
            ) : (
              <>
                <nav className="os-finder-path" aria-label="Path">
                  {ancestry(path).map((p, i) => (
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

          {looking && selectedNode && (
            <QuickLook
              node={selectedNode}
              onOpen={() => open(selectedNode, null)}
              onShare={() => shareViaAirDrop(selectedNode.path)}
              onClose={() => setLooking(false)}
            />
          )}
        </div>
      </div>
      <Drawer open={info} label="Info" width={220}>
        <FileInfo node={selectedNode ?? folder} disk={disk} />
      </Drawer>
      {menu && <ContextMenu at={menu} items={menuFor(menu.node)} onClose={() => setMenu(null)} label={menu.node?.name ?? folder.name} />}
    </div>
  );
}
