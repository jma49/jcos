// Discs Jincheng burns reach the desktop as they happen (Realtime): the
// shelf stays current for Movies and DVD Player, and whoever is on the
// desktop gets a notice with Play DVD, as for a song Jincheng plays for
// everyone (together.ts). Loaded once the desktop has settled; a disc
// burned before then is on the shelf when Movies next opens.

import { createElement } from 'react';
import { DiscIcon } from '../core/icons';
import { dismiss, notify } from '../core/notices';
import { getSocial } from '../social/social';
import type { Disc } from '../../lib/library';
import { burnedOnThisPage } from './discs';
import { insertDisc } from './drive';
import { applyDiscs, DISCS, libraryLoaded } from './library';

const noticeOf = (id: string) => `disc-burned-${id}`;

/** The shelf with `disc` in its place, or at the end if it's new. */
function withDisc(disc: Disc) {
  const at = DISCS.findIndex((d) => d.id === disc.id);
  return at < 0 ? [...DISCS, disc] : DISCS.map((d, i) => (i === at ? disc : d));
}

/** Tells the visitor of a disc Jincheng has just burned; Play DVD puts it in. */
function tell(disc: Disc) {
  const id = noticeOf(disc.id);
  notify({
    id,
    title: 'Jincheng burned a DVD',
    body: disc.artist ? `${disc.title} — ${disc.artist}` : disc.title,
    icon: createElement(DiscIcon, { size: 32 }),
    actions: [
      {
        label: 'Play DVD',
        primary: true,
        run: () => {
          dismiss(id, true);
          void insertDisc(disc);
        }
      }
    ]
  });
}

/** Watches the shelf for as long as the desktop runs; returns a function that stops. */
export function watchDiscs(): () => void {
  let dead = false;
  let stop = () => {};
  void getSocial().then((social) => {
    if (!social || dead) return;
    stop = social.watchDiscs({
      onDisc: (disc, burned) => {
        // Before the library is read, Movies reads the shelf fresh anyway.
        if (libraryLoaded()) applyDiscs(withDisc(disc));
        if (burned && !burnedOnThisPage.has(disc.id)) tell(disc);
      },
      onRemove: (id) => {
        if (libraryLoaded()) applyDiscs(DISCS.filter((d) => d.id !== id));
        dismiss(noticeOf(id), true);
      }
    });
  });
  return () => {
    dead = true;
    stop();
  };
}
