// Listening along: when Jincheng plays a song for everyone from Telegram
// (/play), whoever is on the desktop gets a notification, and "Listen
// along" opens the iPod at his place in the song, by the database's clock
// rather than the visitor's own. A visitor who arrives mid-song gets it
// too. Browsers don't play sound unasked, so it waits for that click; the
// music then follows the one sound switch, as all music does.

import { createElement } from 'react';
import { IPodIcon } from '../core/icons';
import { dismiss, notify } from '../core/notices';
import { launch } from '../core/registry';
import { getSocial } from '../social/social';
import type { NowPlaying, Social } from '../social/types';
import { loadLibrary, SONGS } from './library';
import { useMusic } from './music';

const NOTICE = 'listen-along';

/** The song's place in the library, once it's loaded; -1 if it isn't there (removed since). */
async function indexOf(songId: string) {
  await loadLibrary();
  return SONGS.findIndex((s) => s.id === songId);
}

/** Plays the song from where Jincheng is in it, on the iPod. */
export async function listenAlong(social: Pick<Social, 'nowPlaying'>) {
  const now = await social.nowPlaying().catch(() => null);
  const index = now ? await indexOf(now.songId) : -1;
  if (!now || index < 0) {
    notify({ id: NOTICE, title: 'That song has finished', body: 'Jincheng isn’t playing anything right now.' });
    return;
  }
  const { play } = useMusic.getState();
  play('ipod', index, [index]);
  // The player starts the song here (player.ts), as it would when taking over from Karaoke.
  useMusic.setState({ resume: { index, time: now.elapsedMs / 1000 } });
  launch('ipod');
}

/** Tells the visitor what Jincheng is playing, or takes the notification away when he stops. */
async function show(social: Social, now: NowPlaying | null, stop: { timer: number }) {
  clearTimeout(stop.timer);
  const index = now ? await indexOf(now.songId) : -1;
  if (!now || index < 0) return dismiss(NOTICE, true);
  const song = SONGS[index];
  notify({
    id: NOTICE,
    title: 'Jincheng is listening to',
    body: `${song.title} — ${song.artist}`,
    icon: createElement(IPodIcon, { size: 32 }),
    actions: [{ label: 'Listen along', primary: true, run: () => void listenAlong(social) }]
  });
  // Nothing in the database changes when the song ends; the notification goes then.
  stop.timer = window.setTimeout(() => dismiss(NOTICE, true), now.remainingMs);
}

/** Watches for Jincheng's plays for as long as the desktop runs. Call once, as it starts. */
export function startListeningAlong() {
  let cancelled = false;
  let unwatch = () => {};
  const stop = { timer: 0 };
  getSocial().then((social) => {
    if (!social || cancelled) return;
    const check = () =>
      social
        .nowPlaying()
        .catch(() => null)
        .then((now) => {
          if (!cancelled) return show(social, now, stop);
        });
    check();
    unwatch = social.watchNowPlaying(check);
  });
  return () => {
    cancelled = true;
    clearTimeout(stop.timer);
    unwatch();
  };
}
