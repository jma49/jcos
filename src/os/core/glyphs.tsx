// Control glyphs (play, pause, skip, shuffle, volume, back and forward),
// drawn rather than typed. The characters (⏮ ⏯ ⏭ ▶ ◀ 🔈) are emoji on
// iOS and some Android fonts, so the same button showed a colour picture
// on a phone and a symbol on a desktop. Each is 1em square and takes the
// text's colour, so it sits in a label or a button like the character did.

import type { ReactNode, SVGProps } from 'react';

type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

function Glyph({ children, ...props }: GlyphProps & { children: ReactNode }) {
  return (
    <svg className="os-glyph" viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

export const PlayGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 2.5v11l9-5.5z" />
  </Glyph>
);

export const PauseGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" />
  </Glyph>
);

/** ⏯: play and pause together, as on the click wheel. */
export const PlayPauseGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M1 3.5v9l6.5-4.5zM9 3.5h2.2v9H9zM12.8 3.5H15v9h-2.2z" />
  </Glyph>
);

/** ⏭ */
export const NextGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M1 3.5v9L7 8zM7 3.5v9L13 8zM13 3.5h2v9h-2z" />
  </Glyph>
);

/** ⏮ */
export const PreviousGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M15 3.5v9L9 8zM9 3.5v9L3 8zM1 3.5h2v9H1z" />
  </Glyph>
);

/** ⤮: crossing arrows. */
export const ShuffleGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M11 2l3.5 3L11 8V6.2h-.8c-1 0-1.6.5-2.3 1.4L6.6 9.4C5.6 10.8 4.6 11.6 2.8 11.6H1.5V9.8h1.3c1 0 1.6-.5 2.3-1.4l1.3-1.8C7.4 5.2 8.4 4.4 10.2 4.4h.8zM1.5 4.4h1.3c1.2 0 2 .4 2.8 1.1l-1 1.4c-.5-.5-1-.7-1.8-.7H1.5zM11 8.1l3.5 3L11 14v-1.8h-.8c-1.2 0-2-.4-2.8-1.1l1-1.4c.5.5 1 .7 1.8.7h.8z" />
  </Glyph>
);

/** 🔈: a speaker. */
export const SpeakerLowGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M2 6h3l4-3.5v11L5 10H2z" />
  </Glyph>
);

/** 🔊: a speaker with sound. */
export const SpeakerHighGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M1 6h2.6L7 3v10l-3.4-3H1z" />
    <path d="M9.2 5.4a3.6 3.6 0 0 1 0 5.2M11.2 3.6a6.1 6.1 0 0 1 0 8.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </Glyph>
);

/** ◀ */
export const BackGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M11.5 2.5v11L3 8z" />
  </Glyph>
);

/** ▶ as forward (the same shape as Play, named for what it does). */
export const ForwardGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4.5 2.5v11L13 8z" />
  </Glyph>
);
