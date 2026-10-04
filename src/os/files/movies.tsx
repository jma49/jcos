import type { FileNode } from './disk';
import { rectOf } from '../core/registry';
import { notify } from '../core/notices';
import { DiscLook, DiscThumb, MoviesFolderIcon } from '../media/discArt';
import { throwAwayForEveryone, throwAwayHere, type ShelfDisc } from '../media/discs';
import { insertDisc } from '../media/drive';
import { formatTime } from '../media/music';

// The Movies folder: DVD Player's shelf (media/discs.ts). Each disc's
// icon is its case, Quick Look shows the case with the disc beside it, and
// opening one puts it in the drive and starts DVD Player. A DVD-R burned
// here can be thrown away; so can Jincheng's discs, by Jincheng.

/** Where a disc lives on the disk; a DVD-R apart from a disc of the same video. */
export const discPath = (disc: Pick<ShelfDisc, 'id' | 'burnedHere'>) => `/Movies/${disc.burnedHere ? `${disc.id}-r` : disc.id}`;

function discNode(disc: ShelfDisc, owner: boolean): FileNode {
  const length = disc.duration ? formatTime(disc.duration / 1000) : null;
  const trash = disc.burnedHere
    ? () => throwAwayHere(disc.id)
    : owner
      ? () =>
          void throwAwayForEveryone(disc.id).catch((error) =>
            notify({ id: `disc-${disc.id}`, title: 'The disc is still on the shelf', body: error instanceof Error ? error.message : String(error) })
          )
      : undefined;
  return {
    path: discPath(disc),
    name: disc.title,
    kind: disc.burnedHere ? 'DVD-R' : 'DVD',
    Icon: ({ size = 64 }) => <DiscThumb disc={disc} size={size} />,
    date: disc.added,
    duration: disc.duration,
    look: {
      View: () => <DiscLook disc={disc} />,
      lines: [
        [disc.artist, length].filter(Boolean).join(' · '),
        disc.burnedHere ? 'Only you have this disc: it’s kept in this browser.' : 'Burned by Jincheng, for everyone.'
      ]
    },
    openLabel: 'Play DVD',
    open: (el) => insertDisc(disc, rectOf(el)),
    trash,
    share: false
  };
}

/** The Movies folder for `shelf`; `owner` lets Jincheng throw Jincheng's discs away. */
export function moviesFolder(shelf: ShelfDisc[], owner: boolean): FileNode {
  return {
    path: '/Movies',
    name: 'Movies',
    kind: 'Folder',
    Icon: MoviesFolderIcon,
    children: shelf.map((disc) => discNode(disc, owner))
  };
}
