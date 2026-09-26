import { useEffect, useRef, useState } from 'react';
import { find, type FileNode } from '../../core/files';
import type { ContextMenuItem } from '../../shell/ContextMenu';

// Pieces Finder's views share: thumbnails, the gear menu, Get Info and the
// helpers for paths, sorting and search.

export type View = 'icons' | 'list' | 'columns';
export type Arrange = 'none' | 'name' | 'date' | 'kind';

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '--';

export const ARRANGERS: Record<Arrange, ((a: FileNode, b: FileNode) => number) | null> = {
  none: null,
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  date: (a, b) => (b.date ?? '').localeCompare(a.date ?? ''),
  kind: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
};

/** Every file and folder on the disk, for search. */
export function everything(node: FileNode): FileNode[] {
  return (node.children ?? []).flatMap((c) => [c, ...everything(c)]);
}

export const parentOf = (path: string) => path.split('/').slice(0, -1).join('/') || '/';

/** "/", "/Music", "/Music/Album": each folder from the disk down to `path`. */
export const ancestry = (path: string) => [
  '/',
  ...path
    .split('/')
    .filter(Boolean)
    .map((_, i, parts) => `/${parts.slice(0, i + 1).join('/')}`)
];

export function Thumb({ node, size }: { node: FileNode; size: number }) {
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

/** The toolbar's action menu: a gear button with a popup of commands. */
export function ActionMenu({ items }: { items: ContextMenuItem[] }) {
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
                  {item.shortcut && <kbd>{item.shortcut}</kbd>}
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
export function FileInfo({ node, disk }: { node: FileNode; disk: FileNode }) {
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
