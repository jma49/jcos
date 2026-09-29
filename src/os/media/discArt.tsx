import { useInsertionEffect, type CSSProperties } from 'react';
import { adoptStyles } from '../core/appStyles';
import { DiscIcon, pngIcon } from '../core/icons';
import { pictureOf, zoomOf, type ShelfDisc } from './discs';
import styles from './discArt.css?inline';

// How a disc looks, for Finder's Movies folder and DVD Player: its case,
// with the video's picture as the cover, and the disc itself, printed
// with the same picture (or, for a DVD-R burned here, bare silver with
// its name in marker). Loaded with those apps, as is its stylesheet.

export { DiscIcon };
export const MoviesFolderIcon = pngIcon('movies');

const useStyles = () => useInsertionEffect(() => adoptStyles('disc-art', styles), []);

/** What a case shows: a disc on the shelf, or one Burn is about to make. */
export type CaseArt = Pick<ShelfDisc, 'id' | 'title' | 'artist' | 'cover' | 'coverX'>;

/** The picture, its crop and its zoom, as the stylesheet reads them. */
export const artOf = (disc: Pick<ShelfDisc, 'id' | 'cover' | 'coverX'>): CSSProperties =>
  ({
    '--art': `url("${pictureOf(disc.id, disc.cover)}")`,
    '--pos': `${disc.coverX}%`,
    '--zoom': zoomOf(disc.cover)
  }) as CSSProperties;

/** The case, `width` px wide. */
export function DiscCase({ disc, width }: { disc: CaseArt; width: number }) {
  useStyles();
  return (
    <span className="os-disc-case" style={{ ...artOf(disc), '--w': `${width}px` } as CSSProperties}>
      <span className="os-disc-case-art">
        {disc.artist && <span className="os-disc-case-artist">{disc.artist}</span>}
        <span className="os-disc-case-title">{disc.title}</span>
        <span className="os-disc-case-logo">
          DVD<small>VIDEO</small>
        </span>
      </span>
    </span>
  );
}

/** The disc, `size` px across. */
export function DiscFace({ disc, size }: { disc: ShelfDisc; size: number }) {
  useStyles();
  return (
    <span className="os-disc-wrap">
      <span className="os-disc" data-burned={disc.burnedHere || undefined} style={{ ...artOf(disc), '--d': `${size}px` } as CSSProperties} />
      {disc.burnedHere && (
        <span className="os-disc-hand" style={{ '--d': `${size}px` } as CSSProperties}>
          {disc.title}
          {disc.artist && <small>{disc.artist}</small>}
        </span>
      )}
    </span>
  );
}

/**
 * A disc as Finder's icon of `size` px: its case standing in the icon's
 * square, or at list size, a tiny cover with a black rim.
 */
export function DiscThumb({ disc, size }: { disc: ShelfDisc; size: number }) {
  useStyles();
  if (size <= 24) return <span className="os-disc-mini" style={{ ...artOf(disc), '--h': `${size}px` } as CSSProperties} />;
  return (
    <span className="os-disc-icon" style={{ width: size, height: size }}>
      <DiscCase disc={disc} width={Math.round((size * 135) / 190)} />
    </span>
  );
}

/** Quick Look on a disc: the case, and the disc beside it. */
export function DiscLook({ disc }: { disc: ShelfDisc }) {
  useStyles();
  return (
    <span className="os-disc-look" data-burned={disc.burnedHere || undefined}>
      <DiscCase disc={disc} width={230} />
      <DiscFace disc={disc} size={250} />
    </span>
  );
}
