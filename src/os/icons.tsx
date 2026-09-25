import { useId, type ComponentType } from 'react';

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
export const PreferencesIcon = pngIcon('preferences');
export const MinesweeperIcon = pngIcon('minesweeper');
export const CalculatorIcon = pngIcon('calculator');
export const ApplicationsFolderIcon = pngIcon('applications');
export const AppletsFolderIcon = pngIcon('applets');
export const DocumentsFolderIcon = pngIcon('documents');

/** Stickies: a stack of notes. Drawn here; ryOS has no Stickies icon. */
export function StickiesIcon({ size = 64 }: { size?: number }) {
  // Unique per instance: the icon shows in several places at once, and a
  // hidden copy's gradient can't be borrowed by the others.
  const id = `stickies${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="os-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7a8" />
          <stop offset="1" stopColor="#f5dc4a" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="14" y="8" width="40" height="40" rx="1.5" fill="#9fd0ff" transform="rotate(8 34 28)" />
        <rect x="11" y="12" width="40" height="40" rx="1.5" fill="#b8f0a0" transform="rotate(-6 31 32)" />
        <path d="M9 14h42v30l-8 8H9z" fill={`url(#${id}-paper)`} />
        <path d="M43 52v-8h8z" fill="#d9bd2c" />
      </g>
      <g stroke="#b59a1a" strokeWidth="1.4" strokeLinecap="round" opacity="0.7">
        <path d="M15 24h28M15 31h28M15 38h20" />
      </g>
    </svg>
  );
}

/** Soapbox: a spiral notepad with an Aqua speech bubble. Drawn here, like Stickies. */
export function SoapboxIcon({ size = 64 }: { size?: number }) {
  const id = `soapbox${useId().replace(/[^\w-]/g, '')}`;
  const rings = [13, 19, 25, 31, 37, 43];
  return (
    <svg className="os-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="1" stopColor="#ece5d0" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9d0b8" />
          <stop offset="1" stopColor="#c7bc9f" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d949c" />
          <stop offset="0.45" stopColor="#f4f6f8" />
          <stop offset="1" stopColor="#6f767e" />
        </linearGradient>
        <linearGradient id={`${id}-bubble`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="0.5" stopColor="#3a95ee" />
          <stop offset="1" stopColor="#1b62c9" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodOpacity="0.35" />
        </filter>
      </defs>
      <g transform="rotate(-7 28 36)" filter={`url(#${id}-shadow)`}>
        <rect x="9" y="17" width="38" height="42" rx="2" fill={`url(#${id}-edge)`} />
        <rect x="8" y="15" width="38" height="42" rx="2" fill={`url(#${id}-paper)`} />
        <path d="M12 27h30M12 33h30M12 39h30M12 45h30M12 51h30" stroke="#a9c9ea" strokeWidth="1" />
        <path d="M15.5 21v34" stroke="#e98b80" strokeWidth="1" />
        <path
          d="M19 31.5c1.6-2.4 3-2.4 4.2 0s2.6 2.4 4 0 2.8-2.4 4 0M19 37.5c1.4-2 2.8-2 4 0s2.4 2 3.6 0"
          fill="none"
          stroke="#4a4a4a"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        {rings.map((x) => (
          <circle key={`hole${x}`} cx={x} cy="18.5" r="1.3" fill="#6b6150" />
        ))}
        {rings.map((x) => (
          <rect
            key={`ring${x}`}
            x={x - 1.1}
            y="11.5"
            width="2.2"
            height="7.5"
            rx="1.1"
            fill={`url(#${id}-ring)`}
            stroke="#5b6168"
            strokeWidth="0.5"
          />
        ))}
      </g>
      <g filter={`url(#${id}-shadow)`}>
        <path
          d="M45 7c9 0 15.5 5.2 15.5 11.8S54 30.6 45 30.6c-1.6 0-3.1-.2-4.5-.5L34 34.5l2.2-6.2C32 26.2 29.5 22.8 29.5 18.8 29.5 12.2 36 7 45 7z"
          fill={`url(#${id}-bubble)`}
          stroke="#1450a8"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        <ellipse cx="45" cy="13.2" rx="12" ry="4.6" fill={`url(#${id}-gloss)`} />
        <g fill="#fff">
          <circle cx="39.5" cy="19.6" r="2.1" />
          <circle cx="45" cy="19.6" r="2.1" />
          <circle cx="50.5" cy="19.6" r="2.1" />
        </g>
      </g>
    </svg>
  );
}
