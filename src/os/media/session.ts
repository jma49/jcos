// The browser's own now-playing controls (Media Session API): the media
// keys, and the song and cover in the system's controls.

import { coverOf, SONGS } from './library';
import { useMusic, type MusicApp, type MusicStore } from './music';

let sessionWatched = false;

/**
 * Tells the browser what's playing (Media Session API), for the media keys
 * and the system's now-playing controls, and routes those keys to the app
 * that's playing. Call once.
 */
export function watchMediaSession() {
  if (sessionWatched || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  sessionWatched = true;
  const session = navigator.mediaSession;
  const act = (fn: (s: MusicStore, app: MusicApp) => void) => () => {
    const s = useMusic.getState();
    if (s.owner) fn(s, s.owner);
  };
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', act((s, app) => !s.playing && s.toggle(app))],
    ['pause', act((s) => s.pause())],
    ['nexttrack', act((s, app) => s.next(app))],
    ['previoustrack', act((s, app) => s.previous(app))]
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {}
  }
  const show = (s: MusicStore) => {
    if (!s.owner) {
      session.metadata = null;
      session.playbackState = 'none';
      return;
    }
    const song = SONGS[s.index];
    const cover = coverOf(song);
    session.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album ?? '',
      artwork: [{ src: cover, sizes: cover.includes('mzstatic') ? '600x600' : '320x180', type: 'image/jpeg' }]
    });
    session.playbackState = s.playing ? 'playing' : 'paused';
  };
  show(useMusic.getState());
  useMusic.subscribe((s, prev) => {
    if (s.index !== prev.index || s.playing !== prev.playing || s.owner !== prev.owner) show(s);
  });
}
