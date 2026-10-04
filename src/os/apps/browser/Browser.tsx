import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { BackGlyph, ForwardGlyph } from '../../core/glyphs';
import { useOSData } from '../../core/context';
import type { AppProps } from '../../core/registry';
import { useWindows } from '../../core/store';
import { CLASSICS, type Bookmark } from './bookmarks';
import { addressToUrl, back, forward, hostOf, pastYears, start, visit, waybackUrl, type History, type Visit } from './navigation';

const HOME: Visit = { url: 'https://ocra.majincheng.com/', year: null };

/** Whether a page may be shown in a frame here: unknown until /api/framing answers, and not asked for the archive or this site. */
type Framing = 'unknown' | 'yes' | 'no';

/** A year asked for by whoever opened the window (props are strings), if it's one the menu offers. */
const yearOf = (asked: string | undefined) => {
  const y = Number(asked);
  return Number.isInteger(y) && pastYears().includes(y) ? y : null;
};

const sameOrigin = (url: string) => {
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
};

/**
 * A browser around an iframe, with a history, a Bookmarks Bar and a year
 * menu that shows a page as the Internet Archive kept it. Links followed
 * inside the page aren't known to the history (another site's frame can't
 * be read), so ◀ and ▶ step through the addresses opened here.
 *
 * Sites that forbid framing would show a blank page; /api/framing reads
 * their headers so the Browser can say so and offer a real tab instead.
 *
 * Home is ocra; the Bookmarks Bar has the projects' demos, then classic
 * sites in their early years (bookmarks.ts). A year shows the page at
 * web.archive.org/web/<year>0701if_/<address>, which the archive redirects
 * to its nearest copy, with no server of ours in between (decision 0012).
 */
export default function Browser({ win }: AppProps) {
  const data = useOSData();
  const [history, setHistory] = useState<History>(() =>
    start(win.props?.url ? { url: win.props.url, year: yearOf(win.props.year) } : HOME)
  );
  const here = history.visits[history.at];
  const [draft, setDraft] = useState(here.url);
  const [loaded, setLoaded] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [framing, setFraming] = useState<Framing>('unknown');
  const years = useMemo(() => pastYears(), []);

  const bookmarks = useMemo<Bookmark[]>(
    () => data.projects.flatMap((p) => (p.demo ? [{ name: p.title, url: p.demo, year: null }] : [])),
    [data.projects]
  );

  const go = (next: Visit) => setHistory((h) => visit(h, next));

  // Opening a demo in a window that's already open goes there.
  const asked = win.props?.url;
  const openAsked = useEffectEvent((url: string) => go({ url, year: yearOf(win.props?.year) }));
  useEffect(() => {
    if (asked) openAsked(asked);
  }, [asked]);

  // Each visit: the address field, the window's title, and whether the page can be framed.
  useEffect(() => {
    setDraft(here.url);
    setLoaded(false);
    useWindows.getState().setTitle(win.id, here.year ? `${hostOf(here.url)} — ${here.year}` : hostOf(here.url));
    if (here.year || sameOrigin(here.url)) return setFraming('yes');
    setFraming('unknown');
    const ask = new AbortController();
    fetch(`/api/framing?${new URLSearchParams({ url: here.url })}`, { signal: ask.signal })
      .then((res) => (res.ok ? res.json() : null))
      // No answer (offline, `astro dev`, a site that didn't answer): try the frame anyway.
      .then((answer: { embeddable?: boolean } | null) => setFraming(answer?.embeddable === false ? 'no' : 'yes'))
      .catch(() => !ask.signal.aborted && setFraming('yes'));
    return () => ask.abort();
  }, [here.url, here.year, win.id]);

  const src = here.year ? waybackUrl(here.url, here.year) : here.url;
  const host = hostOf(here.url);
  const status =
    framing === 'no'
      ? `${host} doesn’t allow other sites to show it`
      : !loaded
        ? here.year
          ? `Asking the Internet Archive for ${host} in ${here.year}…`
          : `Loading ${host}…`
        : here.year
          ? `From the Internet Archive: ${host} around ${here.year}`
          : 'Done';

  return (
    <div className="os-app os-browser">
      <form
        className="os-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const url = addressToUrl(draft);
          if (url) go({ url, year: here.year });
        }}
      >
        <div className="os-segmented" role="group" aria-label="Navigate">
          <button type="button" disabled={history.at === 0} onClick={() => setHistory(back)} aria-label="Back" title="Back">
            <BackGlyph />
          </button>
          <button
            type="button"
            disabled={history.at >= history.visits.length - 1}
            onClick={() => setHistory(forward)}
            aria-label="Forward"
            title="Forward"
          >
            <ForwardGlyph />
          </button>
        </div>
        <button
          type="button"
          className="os-button os-icon-button"
          aria-label="Reload"
          title="Reload"
          onClick={() => {
            setLoaded(false);
            setReloads((n) => n + 1);
          }}
        >
          ↻
        </button>
        <button type="button" className="os-button os-icon-button" aria-label="Home" title="Home" onClick={() => go(HOME)}>
          ⌂
        </button>
        <input
          className="os-address"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-label="Address"
          spellCheck={false}
          autoCapitalize="off"
        />
        <select
          className="os-browser-year"
          aria-label="Year"
          title="See the page as the Internet Archive kept it"
          value={here.year ?? 'now'}
          onChange={(e) => go({ url: here.url, year: e.target.value === 'now' ? null : Number(e.target.value) })}
        >
          <option value="now">Today</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <a className="os-button os-icon-button" href={src} target="_blank" rel="noopener" aria-label="Open in a new tab" title="Open in a new tab">
          ↗
        </a>
        <span className="os-progress" data-loading={!loaded && framing !== 'no'} aria-hidden="true" />
      </form>

      <nav className="os-browser-bookmarks" aria-label="Bookmarks">
        {bookmarks.map((b) => (
          <BookmarkButton key={b.url} bookmark={b} here={here} onOpen={go} />
        ))}
        {bookmarks.length > 0 && <span className="os-browser-sep" aria-hidden="true" />}
        {CLASSICS.map((b) => (
          <BookmarkButton key={b.url} bookmark={b} here={here} onOpen={go} />
        ))}
      </nav>

      {framing === 'no' ? (
        <div className="os-browser-notice" role="status">
          <h2>{host} can’t be shown here</h2>
          <p>It asks browsers not to show it inside other sites, so this window would stay blank.</p>
          <div className="os-browser-notice-actions">
            <a className="os-button" href={here.url} target="_blank" rel="noopener">
              Open in a New Tab
            </a>
            {history.at > 0 && (
              <button type="button" className="os-button" onClick={() => setHistory(back)}>
                Go Back
              </button>
            )}
          </div>
        </div>
      ) : (
        <iframe
          key={`${src}#${reloads}`}
          src={src}
          title={win.title}
          onLoad={() => setLoaded(true)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}

      <div className="os-browser-status">{status}</div>
    </div>
  );
}

function BookmarkButton({ bookmark: b, here, onOpen }: { bookmark: Bookmark; here: Visit; onOpen: (v: Visit) => void }) {
  return (
    <button
      type="button"
      aria-current={b.url === here.url && b.year === here.year ? 'page' : undefined}
      title={b.year ? `${b.name} in ${b.year}, from the Internet Archive` : b.url}
      onClick={() => onOpen({ url: b.url, year: b.year })}
    >
      {b.name}
      {b.year && <small>{b.year}</small>}
    </button>
  );
}
