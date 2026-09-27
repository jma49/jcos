import { useId } from 'react';

/** Pinball: a silver ball over a flipper and a lit bumper. Drawn here. */
export default function Icon({ size = 64 }: { size?: number }) {
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
