import type { ComponentType } from 'react';

// Aqua icons from ryOS (public/os/icons); see NOTICE for their origin.

export type IconComponent = ComponentType<{ size?: number }>;

function pngIcon(name: string): IconComponent {
  const Icon = ({ size = 64 }: { size?: number }) => (
    <img
      src={`/os/icons/${name}.png`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="os-icon"
    />
  );
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

export const AboutIcon = pngIcon('textedit');
export const ResumeIcon = pngIcon('preview');
export const DocumentIcon = pngIcon('file-text');
export const FolderIcon = pngIcon('folder');
export const TerminalIcon = pngIcon('terminal');
export const BrowserIcon = pngIcon('ie');
export const ProjectIcon = pngIcon('app');
export const TrashIcon = pngIcon('trash-empty');
export const DiskIcon = pngIcon('disk');
export const PhotosIcon = pngIcon('images');
export const DashboardIcon = pngIcon('dashboard');

/** Stickies: a stack of notes. Drawn here; ryOS has no Stickies icon. */
export function StickiesIcon({ size = 64 }: { size?: number }) {
  return (
    <svg className="os-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="stickies-yellow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7a8" />
          <stop offset="1" stopColor="#f5dc4a" />
        </linearGradient>
        <filter id="stickies-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#stickies-shadow)">
        <rect x="14" y="8" width="40" height="40" rx="1.5" fill="#9fd0ff" transform="rotate(8 34 28)" />
        <rect x="11" y="12" width="40" height="40" rx="1.5" fill="#b8f0a0" transform="rotate(-6 31 32)" />
        <path d="M9 14h42v30l-8 8H9z" fill="url(#stickies-yellow)" />
        <path d="M43 52v-8h8z" fill="#d9bd2c" />
      </g>
      <g stroke="#b59a1a" strokeWidth="1.4" strokeLinecap="round" opacity="0.7">
        <path d="M15 24h28M15 31h28M15 38h20" />
      </g>
    </svg>
  );
}
