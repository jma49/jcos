import type { ReactNode } from 'react';

// DVD Player's own control glyphs, drawn as core/glyphs.tsx draws the
// shared ones (1em square, in the text's colour), and kept here rather
// than there so they stay out of the first load.

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg className="os-glyph" viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const StopGlyph = () => (
  <Glyph>
    <path d="M3.2 3.2h9.6v9.6H3.2z" />
  </Glyph>
);

export const ChapterBackGlyph = () => (
  <Glyph>
    <path d="M1.6 3h1.8v10H1.6zM8.6 3v10L3.4 8zM14.4 3v10L9.2 8z" />
  </Glyph>
);

export const ChapterNextGlyph = () => (
  <Glyph>
    <path d="M1.6 3v10L6.8 8zM7.4 3v10L12.6 8zM12.6 3h1.8v10h-1.8z" />
  </Glyph>
);

export const EjectGlyph = () => (
  <Glyph>
    <path d="M8 2.2l6.2 6.6H1.8zM1.8 10.6h12.4v2.8H1.8z" />
  </Glyph>
);

export const RewindGlyph = () => (
  <Glyph>
    <path d="M8 3v10L1.5 8zM14.5 3v10L8 8z" />
  </Glyph>
);

export const FastForwardGlyph = () => (
  <Glyph>
    <path d="M1.5 3v10L8 8zM8 3v10L14.5 8z" />
  </Glyph>
);

/** Four corners going out: full screen. */
export const FullScreenGlyph = () => (
  <Glyph>
    <path d="M1.5 6V1.5H6M10 1.5h4.5V6M14.5 10v4.5H10M6 14.5H1.5V10" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </Glyph>
);

/** Four corners coming in: back to the window. */
export const ExitFullScreenGlyph = () => (
  <Glyph>
    <path d="M6 1.5V6H1.5M10 1.5V6h4.5M14.5 10H10v4.5M1.5 10H6v4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </Glyph>
);
