import { useLayoutEffect, useRef } from 'react';
import { find, type FileNode } from '../../core/files';
import { ancestry, formatDate, Thumb } from './parts';

/**
 * Tiger's column view: one column per folder from the disk down to the
 * open one, a column for a selected folder's contents, and a preview of a
 * selected file at the end. It scrolls to keep the newest column in view.
 */
export function ColumnView({
  disk,
  path,
  selected,
  sort,
  itemProps
}: {
  disk: FileNode;
  path: string;
  selected: string | null;
  sort: (nodes: FileNode[]) => FileNode[];
  itemProps: (node: FileNode) => Record<string, unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chosen = selected ? find(disk, selected) : null;
  // The folders shown as columns: the open one and those above it, plus a selected folder.
  const folders = ancestry(path).flatMap((p) => {
    const node = find(disk, p);
    return node?.children ? [node] : [];
  });
  if (chosen?.children && !folders.includes(chosen)) folders.push(chosen);
  const preview = chosen && !chosen.children ? chosen : null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [path, selected]);

  return (
    <div ref={ref} className="os-columns" role="tree" aria-label="Columns">
      {folders.map((folder, i) => {
        const next = folders[i + 1]?.path ?? selected;
        return (
          <ul key={folder.path} className="os-column os-scroll" role="group" aria-label={folder.name}>
            {sort(folder.children ?? []).map((node) => (
              <li key={node.path} role="none">
                <button
                  type="button"
                  role="treeitem"
                  {...itemProps(node)}
                  data-selected={node.path === selected}
                  data-trail={node.path === next && node.path !== selected ? true : undefined}
                >
                  <Thumb node={node} size={16} />
                  <span className="os-column-name">{node.name}</span>
                  {node.children && (
                    <span className="os-column-arrow" aria-hidden="true">
                      ▸
                    </span>
                  )}
                </button>
              </li>
            ))}
            {folder.children?.length === 0 && <li className="os-column-empty">Empty</li>}
          </ul>
        );
      })}
      {preview && (
        <div className="os-column os-column-preview">
          <div className="os-column-preview-art">
            {preview.look?.image ? <img src={preview.look.image} alt="" draggable={false} /> : <Thumb node={preview} size={96} />}
          </div>
          <dl>
            <dt>Name</dt>
            <dd>{preview.name}</dd>
            <dt>Kind</dt>
            <dd>{preview.kind}</dd>
            {preview.date && (
              <>
                <dt>Modified</dt>
                <dd>{formatDate(preview.date)}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
