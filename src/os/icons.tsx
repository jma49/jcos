import { useId, type ReactNode } from 'react';

// App icons: a shared 64x64 rounded tile with a top-lit gradient, and a glyph
// per app. Colours come from the site and the Golden Gate illustration.

interface TileProps {
  from: string;
  to: string;
  children: ReactNode;
  size?: number;
}

function Tile({ from, to, children, size = 64 }: TileProps) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="os-icon">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill={`url(#${id}-bg)`} />
      {children}
      <rect x="2" y="2" width="60" height="60" rx="14" fill={`url(#${id}-shine)`} />
      <rect x="2.5" y="2.5" width="59" height="59" rx="13.5" fill="none" stroke="#000" strokeOpacity="0.12" />
    </svg>
  );
}

export function AboutIcon({ size }: { size?: number }) {
  return (
    <Tile from="#fbf6ec" to="#eadfca" size={size}>
      <rect x="15" y="11" width="34" height="42" rx="3" fill="#fff" stroke="#d9ccb3" />
      <rect x="15" y="11" width="34" height="9" rx="3" fill="#e2532d" />
      <text x="32" y="38" textAnchor="middle" fontFamily="Iowan Old Style, Palatino, Georgia, serif" fontSize="15" fontWeight="600" fill="#2b2a28">
        Aa
      </text>
      <path d="M21 44h22M21 48h15" stroke="#c9bda6" strokeWidth="1.6" strokeLinecap="round" />
    </Tile>
  );
}

export function ResumeIcon({ size }: { size?: number }) {
  return (
    <Tile from="#5b95cf" to="#2f6aa6" size={size}>
      <path d="M19 10h19l9 9v35H19z" fill="#fff" />
      <path d="M38 10v9h9" fill="#dce8f4" />
      <path d="M24 26h18M24 31h18M24 36h12" stroke="#9fb9d4" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="40" cy="45" r="7" fill="#e2532d" />
      <path d="M36.8 45.2l2.2 2.2 4.2-4.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Tile>
  );
}

export function FolderIcon({ size }: { size?: number }) {
  return (
    <Tile from="#9db89e" to="#6c8c6f" size={size}>
      <path d="M11 20a3 3 0 0 1 3-3h12l4 4h20a3 3 0 0 1 3 3v2H11z" fill="#e9f0e6" opacity="0.9" />
      <path d="M11 25h42v20a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z" fill="#fff" />
      <path d="M11 25h42v4H11z" fill="#dfe9dc" />
      <path d="M26 38h12" stroke="#9db89e" strokeWidth="2" strokeLinecap="round" />
    </Tile>
  );
}

export function TerminalIcon({ size }: { size?: number }) {
  return (
    <Tile from="#3a3835" to="#1c1b19" size={size}>
      <rect x="10" y="12" width="44" height="40" rx="4" fill="#111" stroke="#4a4845" />
      <path d="M17 24l7 6-7 6" fill="none" stroke="#9fe0a8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 37h11" stroke="#9fe0a8" strokeWidth="2.6" strokeLinecap="round" />
    </Tile>
  );
}

export function BrowserIcon({ size }: { size?: number }) {
  return (
    <Tile from="#f08a5d" to="#d4452a" size={size}>
      <circle cx="32" cy="32" r="18" fill="#fff" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#f4c7b3" strokeWidth="1.5" />
      <path d="M32 14v36M14 32h36" stroke="#f4c7b3" strokeWidth="1.2" />
      <path d="M38.5 25.5l-4.2 8.8-8.8 4.2 4.2-8.8z" fill="#d4452a" />
      <circle cx="32" cy="32" r="1.8" fill="#fff" />
    </Tile>
  );
}

export function ClassicIcon({ size }: { size?: number }) {
  return (
    <Tile from="#ffffff" to="#ece8e1" size={size}>
      <text x="32" y="43" textAnchor="middle" fontFamily="Iowan Old Style, Palatino, Georgia, serif" fontSize="30" fontStyle="italic" fill="#2b2a28">
        JM
      </text>
      <path d="M20 48h24" stroke="#e2532d" strokeWidth="1.6" strokeLinecap="round" />
    </Tile>
  );
}

export function PdfIcon({ size }: { size?: number }) {
  return (
    <Tile from="#f3efe8" to="#ddd6ca" size={size}>
      <path d="M19 10h19l9 9v35H19z" fill="#fff" stroke="#d3cabb" />
      <rect x="15" y="34" width="26" height="12" rx="2" fill="#c8402b" />
      <text x="28" y="43.2" textAnchor="middle" fontFamily="ui-sans-serif, -apple-system, sans-serif" fontSize="8.5" fontWeight="700" fill="#fff">
        PDF
      </text>
    </Tile>
  );
}
