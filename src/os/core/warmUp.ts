// Code the first screen doesn't show but a visitor may reach for soon (the
// Dashboard, the screen saver) is fetched once the desktop has settled: a
// few seconds after the first load, when the browser is idle. It's then
// there, instantly, when it's asked for, without competing with the first
// paint for the network and the main thread. Asked for sooner, it loads
// on the spot.

/** How long after the desktop starts to wait before fetching ahead. */
const SETTLE_MS = 8000;

/** Runs `load` once the desktop has settled. Returns a cancel function, for an effect's cleanup. */
export function afterSettled(load: () => unknown): () => void {
  let idle = 0;
  const timer = window.setTimeout(() => {
    const whenIdle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 0));
    // Only a head start: if it fails (offline), the real load tries again when it's needed.
    idle = whenIdle(
      () =>
        void Promise.resolve()
          .then(load)
          .catch(() => {})
    );
  }, SETTLE_MS);
  return () => {
    clearTimeout(timer);
    (window.cancelIdleCallback ?? window.clearTimeout)(idle);
  };
}
