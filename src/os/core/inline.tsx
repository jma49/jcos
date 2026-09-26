import type { ReactNode } from 'react';

/** Renders text with [label](url) links, the only markup the content uses. */
export function Inline({ text }: { text: string }): ReactNode {
  return text.split(/(\[[^\]]+\]\([^)]+\))/).map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return m ? (
      <a key={i} href={m[2]} target="_blank" rel="noopener">
        {m[1]}
      </a>
    ) : (
      part
    );
  });
}

/** The same text with links reduced to their labels, for plain output. */
export const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
