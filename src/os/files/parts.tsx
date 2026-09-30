import { useId } from 'react';
import type { FileNode } from '../core/files';

// Pieces of Macintosh HD's views that Finder and Time Machine share: a
// file's picture, with the badge on a folder this visitor may not open,
// and the helpers for dates and paths.

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '--';

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
  const { Icon } = node;
  const picture = node.thumb ? (
    <span className="os-file-thumb" style={{ width: size, height: size }}>
      <img src={node.thumb} alt="" loading="lazy" draggable={false} />
    </span>
  ) : (
    <Icon size={size} />
  );
  if (!node.locked) return picture;
  // Mac OS X's badge for a folder you may not open: a red "no entry" sign in its corner.
  return (
    <span className="os-thumb-locked" style={{ width: size, height: size }}>
      {picture}
      <NoAccessBadge />
    </span>
  );
}

function NoAccessBadge() {
  const id = `noaccess${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="os-no-access" viewBox="0 0 20 20" role="img" aria-label="No access">
      <defs>
        <radialGradient id={id} cx="50%" cy="35%" r="65%">
          <stop offset="0" stopColor="#ff7a6e" />
          <stop offset="0.55" stopColor="#e5261a" />
          <stop offset="1" stopColor="#a80f07" />
        </radialGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill={`url(#${id})`} stroke="#fff" strokeWidth="1.6" />
      <rect x="4.6" y="8.4" width="10.8" height="3.2" rx="0.8" fill="#fff" />
    </svg>
  );
}
