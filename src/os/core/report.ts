// Errors the desktop gets past on its own (a read that failed, a save put
// back, an app that crashed in its window) would otherwise leave no trace.
// report() makes them seen: in development, a warning in the console with
// where it happened; in production, an event in Sentry, when the build has
// PUBLIC_SENTRY_DSN. Without one it does nothing and loads nothing. The
// Sentry SDK (core/sentry.ts) is imported on the first report, never with
// the desktop, and sends a sample of client errors without personal data.
//
// What's expected isn't reported: anything while the browser is offline,
// an aborted or timed-out request, and a refusal the interface explains
// (a SocialError other than 'failed': signed out, over a limit, changed
// elsewhere). A place that expects an error says why beside its catch.

const DSN = import.meta.env.PUBLIC_SENTRY_DSN;

type Send = (error: Error, where: string) => void;
let sender: Promise<Send> | null = null;

/** Records an error that was handled, with `where` it happened ("stickies.read"). */
export function report(error: unknown, where: string): void {
  if (import.meta.env.DEV) {
    if (!expected(error)) console.warn(`[${where}]`, error);
    return;
  }
  // Without a DSN the build drops everything below, and this module is all but empty.
  if (!DSN || expected(error)) return;
  sender ??= import('./sentry').then(({ makeSender }) => makeSender(DSN));
  sender.then(
    (send) => send(asError(error), where),
    // The reporter itself couldn't load (blocked, offline): try again next time.
    () => {
      sender = null;
    }
  );
}

/** Whether an error is part of normal use, not a fault. */
export function expected(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) return true;
  // SocialError (social/errors.ts), recognised by its shape: core/ imports no domain's code.
  const reason = error instanceof Error ? (error as { reason?: unknown }).reason : undefined;
  return typeof reason === 'string' && reason !== 'failed';
}

/**
 * An Error for anything thrown or rejected. Supabase's errors are plain
 * objects: only their code and message are kept, not their details, which
 * can quote the values written.
 */
export function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const { message, code } = error as { message: unknown; code?: unknown };
    const made = new Error(String(message));
    if (typeof code === 'string' && code) made.name = `Error ${code}`;
    return made;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}
