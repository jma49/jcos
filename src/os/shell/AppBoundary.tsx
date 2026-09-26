import { Component, type ReactNode } from 'react';

// Keeps one app's failure inside its own window. Without it, an error
// thrown while rendering an app, or an app's code failing to download,
// unmounts the whole desktop and leaves a blank page.
//
// The usual download failure comes after a deploy: a visitor who has had
// the desktop open since before it asks for an app whose old chunk no
// longer exists. Only a reload fetches the new build, so that case offers
// one instead of trying again.

/** An app's code failed to download (the wording differs by browser). */
export function isChunkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Loading chunk|preload CSS/i.test(message);
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
    const updated = isChunkError(error);
    return (
      <div className="os-app os-crash" role="alert">
        <img src="/os/icons/apple.png" alt="" width={40} height={40} />
        <h3>{updated ? 'JM/OS has been updated' : `${name} quit unexpectedly`}</h3>
        <p>
          {updated
            ? `Reload the page to open ${name} in the new version. Your open windows come back.`
            : 'The rest of the desktop is fine. You can open it again or close this window.'}
        </p>
        <div className="os-crash-buttons">
          <button type="button" className="os-button" onClick={onClose}>
            Close
          </button>
          {updated ? (
            <button type="button" className="os-button os-button-primary" onClick={() => location.reload()}>
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
