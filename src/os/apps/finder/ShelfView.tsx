import { useLayoutEffect, useRef, useState } from 'react';
import type { FileNode } from '../../files/disk';
import { Thumb } from '../../files/parts';

// The wooden shelf, for the Movies folder: the discs' cases standing face
// out on wooden boards, as Delicious Library (2005) kept a collection. Not
// Apple's own look, kept on purpose. As many cases stand on a board as
// fit; a click picks one out, a double-click puts it in the drive.

/** A case's height on the shelf; its width follows (135:190). */
const CASE = 146;
/** A case's width and the gap after it, for counting how many fit a board. */
const PITCH = Math.round((CASE * 135) / 190) + 22;

export function ShelfView({
  items,
  itemProps
}: {
  items: FileNode[];
  /** Finder's own props for an item: selection, opening, dragging, the right-click menu. */
  itemProps: (node: FileNode) => Record<string, unknown>;
}) {
  const shelf = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(6);

  useLayoutEffect(() => {
    const el = shelf.current;
    if (!el) return;
    const fit = () => setPerRow(Math.max(1, Math.floor((el.clientWidth - 52) / PITCH)));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const rows: FileNode[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));

  return (
    <div ref={shelf} className="os-scroll os-shelf" data-per-row={perRow}>
      {(rows.length ? rows : [[]]).map((row, r) => (
        <div key={r} className="os-shelf-row">
          {row.map((node) => (
            <button key={node.path} type="button" className="os-shelf-item" title={node.name} {...itemProps(node)}>
              <Thumb node={node} size={CASE} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
