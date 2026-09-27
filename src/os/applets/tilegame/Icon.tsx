import { useId } from 'react';

/** Tile Game: a landscape cut into sliding tiles, one of them loose. Drawn here. */
export default function Icon({ size = 64 }: { size?: number }) {
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
