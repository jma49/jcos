import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { FileNode } from './disk';
import { Thumb } from './parts';

/**
 * Quick Look, as Leopard's dark HUD panel over the Finder window: the
 * picture (or a large icon, or a view of its own, as a disc's case),
 * what it is, and buttons to open it and to AirDrop it (or to throw it
 * away, for a disc), or the `actions` a view gives it instead (Time
 * Machine's Restore). Space or Escape closes it; the arrow keys keep
 * moving the selection underneath, and the panel follows.
 */
export function QuickLook({
  node,
  onOpen,
  onShare,
  onClose,
  actions
}: {
  node: FileNode;
  onOpen?: () => void;
  onShare?: () => void;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const lines = node.look?.lines?.filter(Boolean) ?? [];
  const count = node.children?.length;
  const View = node.look?.View;
  return (
    <div className="os-quicklook" role="dialog" aria-label={`Quick Look: ${node.name}`}>
      <div className="os-quicklook-bar">
        <button type="button" className="os-quicklook-close" aria-label="Close Quick Look" onClick={onClose}>
          ×
        </button>
        <span>{node.name}</span>
      </div>
      <div className="os-quicklook-view">
        {View ? (
          <Fit key={node.path}>
            <View />
          </Fit>
        ) : node.look?.image ? (
          <img key={node.path} src={node.look.image} alt="" draggable={false} />
        ) : (
          <Thumb node={node} size={128} />
        )}
      </div>
      <div className="os-quicklook-about">
        <p className="os-quicklook-kind">
          {node.kind}
          {count !== undefined ? ` · ${count} item${count === 1 ? '' : 's'}` : ''}
        </p>
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      <div className="os-quicklook-actions">
        {actions ?? (
          <>
            {node.trash ? (
              <button type="button" className="os-button" onClick={node.trash}>
                Move to Trash
              </button>
            ) : (
              node.share !== false && (
                <button type="button" className="os-button" onClick={onShare} title="Share with AirDrop">
                  AirDrop…
                </button>
              )
            )}
            <button type="button" className="os-button os-button-primary" onClick={onOpen}>
              {node.openLabel ?? (node.children ? 'Open Folder' : 'Open')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** A view drawn at its own size, scaled down to fit the panel when the window is smaller. */
function Fit({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const box = outer.current;
    const view = inner.current;
    if (!box || !view) return;
    const fit = () => setScale(Math.min(1, box.clientWidth / view.offsetWidth, box.clientHeight / view.offsetHeight));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    return () => watch.disconnect();
  }, []);
  return (
    <div ref={outer} className="os-quicklook-fit">
      <div ref={inner} style={{ scale }}>
        {children}
      </div>
    </div>
  );
}
