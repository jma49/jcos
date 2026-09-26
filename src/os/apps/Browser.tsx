import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../core/registry';

const HOME = 'https://ocra-nine.vercel.app/';

/** A small browser around an iframe. Sites that forbid framing show blank, so
 *  there is always a way out to a real tab. */
export default function Browser({ win }: AppProps) {
  const [url, setUrl] = useState(win.props?.url ?? HOME);
  const [draft, setDraft] = useState(url);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  // Opening a different demo in the same window navigates it.
  useEffect(() => {
    if (win.props?.url && win.props.url !== url) {
      setUrl(win.props.url);
      setDraft(win.props.url);
      setLoading(true);
    }
  }, [win.props?.url]);

  const go = (next: string) => {
    const withScheme = /^https?:\/\//i.test(next) ? next : `https://${next}`;
    setUrl(withScheme);
    setDraft(withScheme);
    setLoading(true);
  };

  return (
    <div className="os-app os-browser">
      <form
        className="os-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          go(draft.trim());
        }}
      >
        <button
          type="button"
          className="os-button os-icon-button"
          aria-label="Reload"
          onClick={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        >
          ↻
        </button>
        <input className="os-address" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Address" spellCheck={false} />
        <a className="os-button" href={url} target="_blank" rel="noopener">
          Open in tab ↗
        </a>
        <span className="os-progress" data-loading={loading} aria-hidden="true" />
      </form>
      <iframe
        key={`${url}#${reloadKey}`}
        ref={frame}
        src={url}
        title={win.title}
        onLoad={() => setLoading(false)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
