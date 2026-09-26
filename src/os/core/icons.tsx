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
export const IPodIcon = pngIcon('ipod');
export const KaraokeIcon = pngIcon('karaoke');
export const ChatIcon = pngIcon('chat');
export const AccountIcon = pngIcon('account');
export const ApplicationsFolderIcon = pngIcon('applications');
export const AppletsFolderIcon = pngIcon('applets');
export const DocumentsFolderIcon = pngIcon('documents');
export const AirDropIcon = pngIcon('airdrop');
export const PhotoBoothIcon = pngIcon('photo-booth');
export const SynthIcon = pngIcon('synth');
/** Finder's face, as in the Dock. */
export const FinderIcon = pngIcon('mac');
export const AppleIcon = pngIcon('apple');

// System Preferences panes.
export const DesktopPaneIcon = pngIcon('desktop-screen-saver');
export const AppearancePaneIcon = pngIcon('appearance-pane');
export const DateTimePaneIcon = pngIcon('international');
export const DisplaysPaneIcon = pngIcon('displays');
export const SoundPaneIcon = pngIcon('sound');
export const AccountsPaneIcon = pngIcon('users');
export const SharingPaneIcon = pngIcon('screen-sharing');
export const SoftwareUpdatePaneIcon = pngIcon('software-update');
export const BackupPaneIcon = pngIcon('backup-restore');

/** The Dock pane: a glass shelf with three icons on it, as Tiger's. Drawn here. */
export function DockPaneIcon({ size = 64 }: { size?: number }) {
  // Unique per instance, as for Stickies: a hidden copy's gradients can't be borrowed.
  const id = `dockpane${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="os-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fb6f0" />
          <stop offset="1" stopColor="#2b62b8" />
        </linearGradient>
        <linearGradient id={`${id}-shelf`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#c9d3de" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect x="4" y="8" width="56" height="44" rx="4" fill={`url(#${id}-screen)`} stroke="#1d4687" strokeWidth="1.5" />
      <path d="M8 44h48l4 10H4z" fill={`url(#${id}-shelf)`} stroke="#8795a6" strokeWidth="1" />
      <rect x="13" y="33" width="11" height="11" rx="2.5" fill="#e5484d" stroke="#fff" strokeWidth="1" />
      <rect x="26.5" y="30" width="11" height="14" rx="2.5" fill="#30a46c" stroke="#fff" strokeWidth="1" />
      <rect x="40" y="33" width="11" height="11" rx="2.5" fill="#ffc53d" stroke="#fff" strokeWidth="1" />
      <circle cx="32" cy="50" r="1.3" fill="#3b4656" />
    </svg>
  );
}

/** The Music folder: a folder with a note on it, as in Mac OS X's home folder. */
export function MusicFolderIcon({ size = 64 }: { size?: number }) {
  return (
    <span className="os-icon os-icon-stack" style={{ width: size, height: size }} aria-hidden="true">
      <FolderIcon size={size} />
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <path
          d="M38 22v18.5a5 5 0 1 1-3-4.6V26l-10 2.4v14.6a5 5 0 1 1-3-4.6V24.6z"
          fill="#3d6fa8"
          opacity="0.55"
          transform="translate(4 6)"
        />
      </svg>
    </span>
  );
}

/** Spider Solitaire: two fanned cards, a spade on top. Drawn here. */
export function SpiderIcon({ size = 64 }: { size?: number }) {
  // Unique per instance, as for Stickies: a hidden copy's gradients can't be borrowed.
  const id = `spider${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="os-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-back`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5aa0e8" />
          <stop offset="1" stopColor="#1f5fb8" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="10" y="10" width="30" height="42" rx="3" fill={`url(#${id}-back)`} stroke="#fff" strokeWidth="2" transform="rotate(-12 25 31)" />
        <rect x="24" y="12" width="30" height="42" rx="3" fill="#fff" stroke="#bbb" transform="rotate(8 39 33)" />
      </g>
      <g transform="rotate(8 39 33)">
        <text x="28" y="23" fontSize="9" fontWeight="700" fontFamily="Helvetica, Arial" fill="#111">A</text>
        <path d="M39 26c-5 5-8 7-8 10.5a3.6 3.6 0 0 0 6.4 2.2L36 44h6l-1.4-5.3A3.6 3.6 0 0 0 47 36.5C47 33 44 31 39 26z" fill="#111" />
      </g>
    </svg>
  );
}

/** Pinball: a silver ball over a flipper and a lit bumper. Drawn here. */
export function PinballIcon({ size = 64 }: { size?: number }) {
  // Unique per instance, as for Stickies: a hidden copy's gradients can't be borrowed.
  const id = `pinball${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="os-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-table`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2a6b" />
          <stop offset="1" stopColor="#0a0f2e" />
        </linearGradient>
        <radialGradient id={`${id}-ball`} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.5" stopColor="#b9c0cc" />
          <stop offset="1" stopColor="#4a5160" />
        </radialGradient>
        <radialGradient id={`${id}-bumper`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#e5484d" />
        </radialGradient>
      </defs>
      <rect x="6" y="4" width="52" height="56" rx="10" fill={`url(#${id}-table)`} stroke="#8fa3ff" strokeWidth="1.5" />
      <path d="M12 16l3 1-1 3 3 1-3 1 1 3-3-1-1 3-1-3-3 1 1-3-3-1 3-1-1-3z" fill="#ffe27a" opacity="0.8" transform="translate(30 -2) scale(0.8)" />
      <circle cx="22" cy="22" r="7" fill={`url(#${id}-bumper)`} stroke="#fff" strokeWidth="1.5" />
      <path d="M14 50l18-6" stroke="#e5484d" strokeWidth="5" strokeLinecap="round" />
      <path d="M50 50l-10-4" stroke="#e5484d" strokeWidth="5" strokeLinecap="round" />
      <circle cx="38" cy="34" r="6" fill={`url(#${id}-ball)`} />
    </svg>
  );
}

/** Stickies: a stack of notes. Drawn here; ryOS has no Stickies icon. */
export function StickiesIcon({ size = 64 }: { size?: number }) {
  // Unique per instance: the icon shows in several places at once, and a
  // hidden copy's gradient can't be borrowed by the others.
  const id = `stickies${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="os-icon" width={size} height={size} viewBox="4.9 3.7 55.2 55.2" aria-hidden="true">
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
    <svg className="os-icon" width={size} height={size} viewBox="2.65 4.07 60.7 60.7" aria-hidden="true">
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

/** Applet Store: a shopping bag with an Aqua band and four applet tiles. Drawn here. */
export function AppletStoreIcon({ size = 64 }: { size?: number }) {
  const id = `store${useId().replace(/[^\w-]/g, '')}`;
  const handle = 'M21 22v-4a10 10 0 0 1 20 0v4';
  return (
    <svg className="os-icon" width={size} height={size} viewBox="5.5 5.8 54 54" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bag`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3e6ea" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9dde3" />
          <stop offset="1" stopColor="#bfc5cd" />
        </linearGradient>
        <linearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="0.5" stopColor="#3a95ee" />
          <stop offset="1" stopColor="#1b62c9" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        <path d={handle} fill="none" stroke="#6f7985" strokeWidth="3.6" strokeLinecap="round" />
        <path d={handle} fill="none" stroke="#d3d9e0" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M52 21l5 2.4-1.5 27.8-3.5 1.1z" fill={`url(#${id}-side)`} />
        <path d="M8 21h44v31.3H8z" fill={`url(#${id}-bag)`} stroke="#9aa3ad" strokeWidth="0.8" strokeLinejoin="round" />
        <path d="M8.4 25.5h43.2v6.5H8.4z" fill={`url(#${id}-band)`} />
        <path d="M8.4 25.5h43.2v2.8H8.4z" fill={`url(#${id}-gloss)`} />
        <path d="M8.4 21.4h43.2v3.4H8.4z" fill="#fff" opacity="0.7" />
        <g stroke="rgba(0,0,0,0.25)" strokeWidth="0.6">
          <rect x="19.5" y="35" width="10" height="7.6" rx="2.2" fill="#ff8a3d" />
          <rect x="31" y="35" width="10" height="7.6" rx="2.2" fill="#35b25a" />
          <rect x="19.5" y="43.6" width="10" height="7.6" rx="2.2" fill="#a05cf0" />
          <rect x="31" y="43.6" width="10" height="7.6" rx="2.2" fill="#ffcf33" />
        </g>
        <g fill="#fff" opacity="0.55">
          <rect x="20.5" y="35.8" width="8" height="2.6" rx="1.3" />
          <rect x="32" y="35.8" width="8" height="2.6" rx="1.3" />
          <rect x="20.5" y="44.4" width="8" height="2.6" rx="1.3" />
          <rect x="32" y="44.4" width="8" height="2.6" rx="1.3" />
        </g>
      </g>
    </svg>
  );
}

/** Tile Game: a landscape cut into sliding tiles, one of them loose. Drawn here. */
export function TileGameIcon({ size = 64 }: { size?: number }) {
  const id = `tiles${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="os-icon" width={size} height={size} viewBox="2.5 3 59 59" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fb6f2" />
          <stop offset="0.55" stopColor="#cfe6f7" />
          <stop offset="1" stopColor="#f6d9a8" />
        </linearGradient>
        <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f4f4" />
          <stop offset="1" stopColor="#b9b9b9" />
        </linearGradient>
        <clipPath id={`${id}-pic`}>
          <rect x="10" y="10" width="44" height="44" />
        </clipPath>
        <mask id={`${id}-gaps`}>
          <rect x="0" y="0" width="64" height="64" fill="#fff" />
          <path d="M21 10v44M32 10v44M43 10v44M10 21h44M10 32h44M10 43h44" stroke="#000" strokeWidth="0.9" />
          <rect x="43" y="43" width="11" height="11" fill="#000" />
        </mask>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="6" y="6" width="52" height="52" rx="5" fill={`url(#${id}-frame)`} stroke="#8a8a8a" strokeWidth="0.8" />
        <rect x="10" y="10" width="44" height="44" fill="#e6e6e6" />
        <rect x="43.6" y="43.6" width="10.4" height="10.4" fill="#9a9a9a" />
        <path d="M43.6 54V43.6H54" fill="none" stroke="#6d6d6d" strokeWidth="1.2" />
        <g clipPath={`url(#${id}-pic)`} mask={`url(#${id}-gaps)`}>
          <rect x="10" y="10" width="44" height="44" fill={`url(#${id}-sky)`} />
          <circle cx="41" cy="22" r="5" fill="#fff4c2" />
          <path d="M10 42l12-11 9 8 8-6 15 11v10H10z" fill="#3f7d4a" />
          <path d="M10 47l14-6 12 5 18-5v13H10z" fill="#2d5f37" />
          <path
            d="M10 10.7h44M10 21.7h44M10 32.7h44M10 43.7h44M10.7 10v44M21.7 10v44M32.7 10v44M43.7 10v44"
            stroke="#fff"
            strokeOpacity="0.45"
            strokeWidth="0.8"
          />
        </g>
        <g transform="translate(44.5 45.5) rotate(-6)">
          <rect x="-1" y="-1" width="11.5" height="11.5" rx="1" fill="#2d5f37" stroke="#fff" strokeWidth="1" />
          <path d="M-1 3l5 -2 6 3v6.5H-1z" fill="#3f7d4a" />
        </g>
      </g>
    </svg>
  );
}
