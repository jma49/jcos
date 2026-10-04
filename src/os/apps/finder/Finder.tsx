import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { BackGlyph, ForwardGlyph } from '../../core/glyphs';
import { useOSData } from '../../core/context';
import type { AppProps } from '../../core/registry';
import { launch } from '../../core/registry';
import { useFocusedId, useWindows } from '../../core/store';
import { ownsKey, typing } from '../../core/useKeys';
import { useInstalledApplets } from '../../core/applets';
import { buildDisk, find, type FileNode } from '../../files/disk';
import { ALBUMS, SONGS, useLibraryVersion } from '../../media/library';
import { useLibraryRefresh } from '../../media/refresh';
import { useShelf, useShelfRefresh } from '../../media/discs';
import { formatTime } from '../../media/music';
import { useOwnerAnswer } from '../../social/owner';
import { AirDropIcon, DiskIcon, FinderIcon } from '../../core/icons';
import { Drawer } from '../../shell/drawer';
import { ContextMenu, type ContextMenuItem } from '../../shell/ContextMenu';
import { load, loadSettings, updateJSON } from '../../core/storage';
import { PATH_MIME, shareViaAirDrop } from '../../social/airdrop';
import { APP_MIME } from '../../core/dock';
import { ActionMenu, ARRANGERS, everything, FileInfo, type Arrange, type View } from './parts';
import { ancestry, formatDate, lockedOn, parentOf, Thumb } from '../../files/parts';
import { ColumnView } from './ColumnView';
import { CoverFlowView } from './CoverFlowView';
import { ShelfView } from './ShelfView';
import { QuickLook } from '../../files/QuickLook';
import { BurnSheet } from './BurnSheet';
import { discPath, moviesFolder } from '../../files/movies';
import { Alert } from '../../shell/Alert';
import { HOME, usersFolder } from '../../files/home';
import { deleteDocument, useHome, useHomeRefresh, type HomeDocument } from '../../files/documents';
import { notify } from '../../core/notices';

// Finder over Macintosh HD (files/disk.ts): a sidebar of places, back and
// forward, icon, list or column views, a search field that looks through
// the whole disk, and an action (gear) menu for arranging. Double-click
// (or Enter) opens; the arrow keys move the selection, typing a name
// jumps to it, Space shows Quick Look, and a right-click or a drag onto
// AirDrop shares. The Movies folder is DVD Player's shelf (movies.tsx),
// with Burn in the toolbar to make a disc from a YouTube link. Users ›
// jincheng is Jincheng's home (home.tsx): locked to anyone else but for
// Public and Sites, and opening a locked folder brings up Finder's alert.
//
// The views are icons, a list, columns and Cover Flow (⌥1–⌥4). Cover Flow
// (CoverFlowView.tsx) is Leopard's, drawn only near the middle; its classes
// are os-finder-cf-*, apart from the iPod's os-cf-*. Movies has a fifth,
// the wooden shelf (ShelfView.tsx, ⌥5), the one thing on the desktop that
// isn't Apple's look, kept on purpose; its button shows only in Movies, and
// anywhere else that choice shows icons. In Movies the list shows Date
// Added, Length and Kind.
//
// The Burn sheet (BurnSheet.tsx) and Finder's alerts are modal: while one
// is up, Finder's own keys are off, and the sheet takes Escape (stop, or
// close) and Return (Burn) wherever in the window the focus is (a control
// outside it, a Dock icon, keeps its own: `ownsKey`). On a phone the
// toolbar's buttons keep their size and what doesn't fit goes to a second
// row, where the search field takes the rest of the width.

interface Prefs {
  view: View;
  arrange: Arrange;
  /** Icon size in icon view. */
  size: 48 | 64 | 80;
}

const PREFS_KEY = 'os-finder';
const DEFAULT_PREFS: Prefs = { view: 'icons', arrange: 'none', size: 64 };
/** Finder's views, ⌥1 to ⌥5; the shelf is the Movies folder's alone. */
const VIEWS: View[] = ['icons', 'list', 'columns', 'coverflow', 'shelf'];

function savedPrefs(): Prefs {
  // Earlier versions kept only the view, under its own key.
  const view = load('os-finder-view') === 'list' ? 'list' : DEFAULT_PREFS.view;
  const prefs = loadSettings(PREFS_KEY, { ...DEFAULT_PREFS, view });
  return VIEWS.includes(prefs.view) ? prefs : { ...prefs, view: 'icons' };
}

export default function Finder({ win }: AppProps) {
  const data = useOSData();
  const applets = useInstalledApplets();
  // The Music folder follows songs added during the visit (media/library.ts).
  useLibraryVersion();
  useLibraryRefresh();
  const songs = SONGS;
  const albums = ALBUMS;
  // The Movies folder follows the shelf, and lets the owner throw the owner's discs away.
  const shelf = useShelf();
  const { owner, known: ownerKnown } = useOwnerAnswer();
  const movies = useMemo(() => moviesFolder(shelf, owner), [shelf, owner]);
  // Jincheng's home: what this visitor may see of it, and the owner's documents to throw away (after asking).
  const home = useHome();
  const [trashing, setTrashing] = useState<HomeDocument | null>(null);
  const users = useMemo(() => usersFolder(home, owner, data.projects, setTrashing), [home, owner, data.projects]);
  const disk = useMemo(() => buildDisk(data, applets, { songs, albums }, movies, users), [data, applets, songs, albums, movies, users]);
  const all = useMemo(() => everything(disk), [disk]);
  const [history, setHistory] = useState<string[]>(() => [win.props?.path ?? '/']);
  const [at, setAt] = useState(0);
  // A locked folder someone tried to open: Finder's alert says so.
  const [locked, setLocked] = useState<FileNode | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(savedPrefs);
  const [query, setQuery] = useState('');
  const [info, setInfo] = useState(false);
  const [looking, setLooking] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [burning, setBurning] = useState(false);
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
  const selectedNode = selected ? (all.find((n) => n.path === selected) ?? null) : null;
  const title = searching ? `Searching “${query.trim()}”` : folder.name;
  const atMovies = !searching && folder.path === '/Movies';
  // Columns don't search; the shelf is Movies' alone.
  const view: View = searching && prefs.view === 'columns' ? 'list' : prefs.view === 'shelf' && !atMovies ? 'icons' : prefs.view;
  // While Movies shows, the shelf is read fresh (the library's copy can be a minute old).
  useShelfRefresh(atMovies);
  // And the home folder while it shows, or a search might find something in it.
  useHomeRefresh(path.startsWith('/Users') || searching, owner);

  // Keep the window's title on the folder it shows.
  useEffect(() => {
    useWindows.getState().setTitle(win.id, title);
  }, [win.id, title]);

  // Opening Finder again at another place (e.g. from the desktop) goes there.
  const asked = win.props?.path;
  const goAsked = useEffectEvent((next: string) => next !== history[at] && go(next));
  useEffect(() => {
    if (asked) goAsked(asked);
  }, [asked]);

  // A place this visitor may not open, reached without go() (the window
  // restored or opened there, Back to where the owner was before signing
  // out), goes to the folder above the locked one, with the alert opening
  // it brings up. Only once it's known whether this is the owner, so the
  // owner is never sent away.
  const shutHere = ownerKnown ? lockedOn(disk, path) : null;
  const leaveShut = useEffectEvent((shut: FileNode) => {
    setHistory((h) => h.map((p, i) => (i === at ? parentOf(shut.path) : p)));
    setSelected(null);
    setLocked(shut);
  });
  useEffect(() => {
    if (shutHere) leaveShut(shutHere);
  }, [shutHere]);

  /** Shows a folder; `replace` doesn't add a step to Back (column view's clicks). A locked one, or one inside it, says so instead. */
  const go = (next: string, { replace = false, select = null as string | null } = {}) => {
    const shut = lockedOn(disk, next);
    if (shut) return setLocked(shut);
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
    if (node.locked) setLocked(node);
    else if (node.children) go(node.path);
    else node.open?.(el);
  };

  const update = (next: Partial<Prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    updateJSON(PREFS_KEY, prefs, (stored) => ({ ...stored, ...next }));
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
    const shelf = main.current?.querySelector<HTMLElement>('.os-shelf');
    if (shelf) return Number(shelf.dataset.perRow) || 1;
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
    const rows = view === 'icons' || view === 'shelf';
    const step = { ArrowUp: rows ? -perRow() : -1, ArrowDown: rows ? perRow() : 1, ArrowLeft: -1, ArrowRight: 1 }[key] ?? 0;
    // Left and right move through the icons and the covers; the list goes up and down only.
    if (view === 'list' && (key === 'ArrowLeft' || key === 'ArrowRight')) return;
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
    // A sheet or an alert is up: the window's keys are its, not Finder's under it.
    if (burning || locked || trashing) return;
    // A control outside the window (a Dock icon, the menu bar) keeps its keys,
    // and the search field its typing, ⌥ with a key included (core/useKeys.ts).
    if (!ownsKey(e)) return;
    if (e.metaKey || e.altKey) {
      if (e.metaKey && e.code === 'Backspace' && selectedNode?.trash && !typing(e)) {
        e.preventDefault();
        selectedNode.trash();
      } else if (e.code === 'ArrowUp' && parent) {
        e.preventDefault();
        go(parent);
      } else if (e.code === 'ArrowDown' && selectedNode) {
        e.preventDefault();
        open(selectedNode, null);
      } else if (e.altKey && e.code === 'KeyI') {
        e.preventDefault();
        setInfo((i) => !i);
      } else if (e.altKey && /^Digit[1-5]$/.test(e.code)) {
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
    if (e.ctrlKey) return;
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

  // The sidebar's places: the home first, as on a Mac, then the disk's folders (Users is reached through the home).
  const homePlace = find(disk, HOME);
  const [disk0, ...folders] = [
    { ...disk, Icon: DiskIcon },
    ...(homePlace ? [homePlace] : []),
    ...(disk.children ?? []).filter((n) => n.path !== '/Users')
  ];

  const viewItems: ContextMenuItem[] = [
    { label: 'as Icons', shortcut: '⌥1', checked: view === 'icons', action: () => update({ view: 'icons' }) },
    { label: 'as List', shortcut: '⌥2', checked: view === 'list', action: () => update({ view: 'list' }) },
    { label: 'as Columns', shortcut: '⌥3', checked: view === 'columns', disabled: searching, action: () => update({ view: 'columns' }) },
    { label: 'as Cover Flow', shortcut: '⌥4', checked: view === 'coverflow', action: () => update({ view: 'coverflow' }) },
    ...(atMovies ? [{ label: 'as Shelf', shortcut: '⌥5', checked: view === 'shelf', action: () => update({ view: 'shelf' }) }] : [])
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
          ...(node.share === false ? [] : [{ label: '', divider: true }, { label: 'Share with AirDrop…', action: () => shareViaAirDrop(node.path) }]),
          ...(node.trash ? [{ label: '', divider: true }, { label: 'Move to Trash', shortcut: '⌘⌫', action: node.trash }] : [])
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
    { label: 'Share with AirDrop…', disabled: !selectedNode || selectedNode.share === false, action: () => selectedNode && shareViaAirDrop(selectedNode.path) },
    ...(selectedNode?.trash ? [{ label: 'Move to Trash', shortcut: '⌘⌫', action: selectedNode.trash }] : []),
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
      if (node.share !== false) e.dataTransfer.setData(PATH_MIME, node.path);
      if (node.app) e.dataTransfer.setData(APP_MIME, node.app);
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

  /** The folder as a list (Name, Date Modified or Added, Length in Movies, Kind): the list view, and under Cover Flow. */
  const listView = () => (
    <div
      className="os-scroll os-files-list"
      role="table"
      aria-label={title}
      data-searching={searching || undefined}
      data-lengths={atMovies || undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, node: null });
      }}
    >
      <div role="row" className="os-files-head">
        {header('Name', 'name')}
        {searching ? <span role="columnheader">Where</span> : header(atMovies ? 'Date Added' : 'Date Modified', 'date')}
        {atMovies && <span role="columnheader">Length</span>}
        {header('Kind', 'kind')}
      </div>
      {items.map((node) => (
        <button key={node.path} type="button" role="row" {...itemProps(node)}>
          <span role="cell" className="os-files-name">
            <Thumb node={node} size={16} />
            {node.name}
          </span>
          <span role="cell">{searching ? find(disk, parentOf(node.path))?.name : formatDate(node.date)}</span>
          {atMovies && <span role="cell">{node.duration ? formatTime(node.duration / 1000) : '--'}</span>}
          <span role="cell">{node.kind}</span>
        </button>
      ))}
    </div>
  );

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
            <BackGlyph />
          </button>
          <button type="button" disabled={at >= history.length - 1} onClick={() => setAt(at + 1)} aria-label="Forward" title="Forward (⌥])">
            <ForwardGlyph />
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
          <button type="button" aria-pressed={view === 'coverflow'} onClick={() => update({ view: 'coverflow' })} aria-label="Cover Flow" title="As Cover Flow (⌥4)">
            <svg viewBox="0 0 16 14" width="14" height="12" aria-hidden="true">
              <path d="M5 2h6v8H5zM1 3.5l3 1.2v4.6l-3 1.2zM15 3.5l-3 1.2v4.6l3 1.2zM5 11.5h6v1H5z" fill="currentColor" />
            </svg>
          </button>
          {atMovies && (
            <button type="button" aria-pressed={view === 'shelf'} onClick={() => update({ view: 'shelf' })} aria-label="Shelf" title="As Shelf (⌥5)">
              <svg viewBox="0 0 16 14" width="14" height="12" aria-hidden="true">
                <path d="M2 1h2.4v4.6H2zM5 1h2.4v4.6H5zM8 1.6h2.4v4H8zM1 6.2h14v1.2H1zM3 8h2.4v4.4H3zM6 8.4h2.4v4H6zM9.4 8h2.4v4.4H9.4zM1 12.6h14v1.2H1z" fill="currentColor" />
              </svg>
            </button>
          )}
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
        {atMovies && (
          <button type="button" className="os-button os-finder-burn" onClick={() => setBurning(true)} title="Burn a DVD from a YouTube video">
            <BurnGlyph />
            Burn
          </button>
        )}
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
          {view === 'list' && listView()}
          {view === 'coverflow' && (
            <CoverFlowView items={items} selected={selected} onSelect={(node) => setSelected(node.path)} onOpen={open}>
              {listView()}
            </CoverFlowView>
          )}
          {view === 'shelf' && <ShelfView items={items} itemProps={itemProps} />}
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
      {/* A sheet hangs from the toolbar across the whole window, as Tiger's did. */}
      {burning && atMovies && (
        <BurnSheet
          owner={owner}
          onClose={() => setBurning(false)}
          onBurned={(disc) => {
            setBurning(false);
            setSelected(discPath(disc));
          }}
        />
      )}
      <Drawer open={info} label="Info" width={220}>
        <FileInfo node={selectedNode ?? folder} disk={disk} />
      </Drawer>
      {menu && <ContextMenu at={menu} items={menuFor(menu.node)} onClose={() => setMenu(null)} label={menu.node?.name ?? folder.name} />}
      {locked && (
        <Alert
          Icon={FinderIcon}
          message={`The folder “${locked.name}” could not be opened because you do not have sufficient access privileges.`}
          onConfirm={() => setLocked(null)}
        />
      )}
      {trashing && (
        <Alert
          Icon={FinderIcon}
          message={`The item “${trashing.name}” will be deleted immediately.`}
          detail="Are you sure you want to continue? You can’t undo this action."
          onCancel={() => setTrashing(null)}
          onConfirm={() => {
            const doc = trashing;
            setTrashing(null);
            void deleteDocument(doc.id).catch((error) =>
              notify({ id: `document-${doc.id}`, title: `“${doc.name}” is still there`, body: error instanceof Error ? error.message : String(error) })
            );
          }}
        />
      )}
    </div>
  );
}

/** Tiger's Burn button: the yellow radiation sign. */
function BurnGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="7.4" fill="#f4c000" stroke="#7a5d00" strokeWidth="0.8" />
      <path
        fill="#1b1b1b"
        d="M5 2.8A6 6 0 0 1 11 2.8L9.1 6.1A2.2 2.2 0 0 0 6.9 6.1ZM14 8A6 6 0 0 1 11 13.2L9.1 9.9A2.2 2.2 0 0 0 10.2 8ZM5 13.2A6 6 0 0 1 2 8L5.8 8A2.2 2.2 0 0 0 6.9 9.9Z"
      />
      <circle cx="8" cy="8" r="1.3" fill="#1b1b1b" />
    </svg>
  );
}
