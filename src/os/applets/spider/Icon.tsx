import { useId } from 'react';

/** Spider Solitaire: two fanned cards, a spade on top. Drawn here. */
export default function Icon({ size = 64 }: { size?: number }) {
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
