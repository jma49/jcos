import { Component, type ReactNode } from 'react';

// Keeps one app's failure inside its own window. Without it, an error
// thrown while rendering an app, or an app's code failing to download,
// unmounts the whole desktop and leaves a blank page.
//
// An app's code can fail to download because a deploy since the page
// loaded removed the old chunk, or because the connection dropped; it
// can't tell which. Either way only a reload helps: the browser remembers
// a failed module import for the page's life and won't ask again. The
// reload brings the open windows back.

/** An app's code failed to download (the wording differs by browser). */
export function isChunkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Loading chunk|preload CSS/i.test(message);
}

/**
 * Reloads into the new version with the open windows put back. A link's
 * ?open= would otherwise win over them (deepLink.ts), and the app that
 * asked for the reload wouldn't come back.
 */
function reloadWithWindows() {
  const url = new URL(location.href);
  url.searchParams.delete('open');
  if (url.href === location.href) location.reload();
  else location.replace(url);
}

interface Props {
  /** The app's name, for the message. */
  name: string;
  onClose: () => void;
  children: ReactNode;
}

export class AppBoundary extends Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('Unknown error') };
  }

  componentDidCatch(error: unknown) {
    console.error(`[JM/OS] ${this.props.name} quit unexpectedly`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { name, onClose } = this.props;
    const download = isChunkError(error);
    const offline = download && typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="os-app os-crash" role="alert">
        <img src="/os/icons/apple.png" alt="" width={40} height={40} />
        <h3>{download ? `${name} couldn’t be opened` : `${name} quit unexpectedly`}</h3>
        <p>
          {offline
            ? 'You’re offline. Once you’re connected, reload to open it; your open windows come back.'
            : download
              ? 'JM/OS may have been updated since this page loaded, or the connection dropped. Reload to open it; your open windows come back.'
              : 'The rest of the desktop is fine. You can open it again or close this window.'}
        </p>
        <div className="os-crash-buttons">
          <button type="button" className="os-button" onClick={onClose}>
            Close
          </button>
          {download ? (
            <button type="button" className="os-button os-button-primary" onClick={reloadWithWindows}>
              Reload
            </button>
          ) : (
            <button type="button" className="os-button os-button-primary" onClick={() => this.setState({ error: null })}>
              Reopen
            </button>
          )}
        </div>
      </div>
    );
  }
}
