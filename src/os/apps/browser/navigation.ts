// What the Browser shows and how it gets there: typed addresses, the
// history behind ◀ and ▶, and visits to the past through the Internet
// Archive's Wayback Machine.
//
// The Wayback Machine lets its pages be framed, so time travel needs no
// server of ours. A past page loads as web.archive.org/web/<date>if_/
// <address>: `if_` is its own mode for framed pages, without the
// archive's toolbar. Links inside it stay in the archive, near that date.

/** One stop in the history: an address, now or in a past year. */
export interface Visit {
  url: string;
  /** A year to see the page as it was then; null for today. */
  year: number | null;
}

export interface History {
  visits: Visit[];
  at: number;
}

export const FIRST_YEAR = 1996;

/** The years the year menu offers, newest first: last year back to the archive's first. */
export function pastYears(now = new Date()): number[] {
  const years: number[] = [];
  for (let y = now.getFullYear() - 1; y >= FIRST_YEAR; y--) years.push(y);
  return years;
}

/** A typed address as a URL: a scheme is added when it's missing. Null when it isn't one. */
export function addressToUrl(typed: string): string | null {
  const text = typed.trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export const start = (visit: Visit): History => ({ visits: [visit], at: 0 });

/** Goes somewhere new: what was ahead of the current visit is dropped, as in any browser. */
export function visit(history: History, next: Visit): History {
  const here = history.visits[history.at];
  if (here && here.url === next.url && here.year === next.year) return history;
  const visits = [...history.visits.slice(0, history.at + 1), next];
  return { visits, at: visits.length - 1 };
}

export const back = (h: History): History => (h.at > 0 ? { ...h, at: h.at - 1 } : h);
export const forward = (h: History): History => (h.at < h.visits.length - 1 ? { ...h, at: h.at + 1 } : h);

/**
 * The Wayback address for a page as it was around the middle of `year`.
 * The archive redirects it to the nearest copy it has, on either side of
 * that date, or says it has none. (Its availability API would name the
 * copy first, but it often comes back empty for sites it has plenty of,
 * and the CDX API doesn't answer browsers.)
 */
export const waybackUrl = (url: string, year: number) => `https://web.archive.org/web/${year}0701if_/${url}`;

/** A short name for a page: its host without "www.". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
