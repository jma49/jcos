import type { FileNode } from '../../core/files';
import { Thumb } from './parts';

/**
 * Quick Look, as Leopard's dark HUD panel over the Finder window: the
 * picture (or a large icon), what it is, and buttons to open or AirDrop
 * it. Space or Escape closes it; the arrow keys keep moving the selection
 * underneath, and the panel follows.
 */
export function QuickLook({
  node,
  onOpen,
  onShare,
  onClose
}: {
  node: FileNode;
  onOpen: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const lines = node.look?.lines?.filter(Boolean) ?? [];
  const count = node.children?.length;
  return (
    <div className="os-quicklook" role="dialog" aria-label={`Quick Look: ${node.name}`}>
      <div className="os-quicklook-bar">
        <button type="button" className="os-quicklook-close" aria-label="Close Quick Look" onClick={onClose}>
          ×
        </button>
        <span>{node.name}</span>
      </div>
      <div className="os-quicklook-view">
        {node.look?.image ? (
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
        <button type="button" className="os-button" onClick={onShare} title="Share with AirDrop">
          AirDrop…
        </button>
        <button type="button" className="os-button os-button-primary" onClick={onOpen}>
          {node.children ? 'Open Folder' : 'Open'}
        </button>
      </div>
    </div>
  );
}
