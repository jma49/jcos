// How a disc goes into the drive and comes out again. It leaves its case
// and slides across to the slot in the right edge of the screen, where
// the iMac G5 had its drive, and goes in; ejected, it slides back out of
// the slot and away. DVD Player's icon bounces in the Dock as it opens.
// Drawn with the Web Animations API over everything else, and skipped
// with motion reduced.

import { adoptStyles } from '../core/appStyles';
import { useSystem } from '../core/system';
import type { Rect } from '../core/types';
import styles from './discArt.css?inline';
import { pictureOf, zoomOf, type ShelfDisc } from './discs';

/** The disc's size on its way in. */
const SIZE = 200;

/** Whether to leave the animations out: the visitor's choice, else their device's. */
function reduced() {
  const choice = useSystem.getState().motion;
  const device = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return choice === 'system' ? device : choice === 'reduce';
}

const root = () => document.querySelector<HTMLElement>('.os-root');

/** The disc as drawn by media/discArt.css (adopted here too, for a disc put in from elsewhere). */
function discElement(disc: ShelfDisc) {
  adoptStyles('disc-art', styles);
  const wrap = document.createElement('span');
  wrap.className = 'os-disc-flight';
  wrap.setAttribute('aria-hidden', 'true');
  const face = document.createElement('span');
  face.className = 'os-disc';
  if (disc.burnedHere) face.dataset.burned = '';
  face.style.setProperty('--d', `${SIZE}px`);
  face.style.setProperty('--art', `url("${pictureOf(disc.id, disc.cover)}")`);
  face.style.setProperty('--pos', `${disc.coverX}%`);
  face.style.setProperty('--zoom', String(zoomOf(disc.cover)));
  wrap.append(face);
  return wrap;
}

/** The slot in the screen's right edge, level with the disc. */
function slotElement(top: number) {
  const slot = document.createElement('span');
  slot.className = 'os-disc-slot';
  slot.setAttribute('aria-hidden', 'true');
  slot.style.top = `${top}px`;
  slot.style.height = `${SIZE}px`;
  return slot;
}

/** Where the slot is: halfway down the screen, on its right edge. */
const slotTop = () => Math.round((window.innerHeight - SIZE) / 2);

/**
 * Slides the disc from `from` (its case in Finder) into the slot; resolves
 * with the slot's rect, for DVD Player to open from, once it's in.
 */
export async function slideIn(disc: ShelfDisc, from?: Rect): Promise<Rect> {
  const top = slotTop();
  const slotRect = { x: window.innerWidth - 6, y: top, width: 6, height: SIZE };
  const host = root();
  if (reduced() || !host) return slotRect;
  const flight = discElement(disc);
  const slot = slotElement(top);
  host.append(slot, flight);
  const start = from ?? { x: window.innerWidth / 2 - SIZE / 2, y: top, width: SIZE, height: SIZE };
  const startX = start.x + start.width / 2 - SIZE / 2;
  const startY = start.y + start.height / 2 - SIZE / 2;
  const rest = window.innerWidth - SIZE - 36;
  const fade = slot.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 1150, fill: 'forwards' });
  const move = flight.animate(
    [
      { transform: `translate(${startX}px, ${startY}px) scale(${Math.max(0.2, start.width / SIZE)})`, opacity: 0.7 },
      { transform: `translate(${rest}px, ${top}px) scale(1)`, opacity: 1, offset: 0.45, easing: 'ease-in-out' },
      { transform: `translate(${rest}px, ${top}px) scale(1)`, opacity: 1, offset: 0.55, easing: 'ease-in' },
      { transform: `translate(${window.innerWidth + 8}px, ${top}px) scale(1)`, opacity: 1 }
    ],
    { duration: 1150, fill: 'forwards' }
  );
  // An animation cancelled (the disc ejected meanwhile) rejects: it's over either way.
  await move.finished.catch(() => {});
  await fade.finished.catch(() => {});
  flight.remove();
  slot.remove();
  return slotRect;
}

/** Slides an ejected disc back out of the slot and away. */
export async function slideOut(disc: ShelfDisc) {
  const host = root();
  if (reduced() || !host) return;
  const top = slotTop();
  const flight = discElement(disc);
  const slot = slotElement(top);
  host.append(slot, flight);
  const out = window.innerWidth - SIZE - 36;
  slot.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 900, fill: 'forwards' });
  const move = flight.animate(
    [
      { transform: `translate(${window.innerWidth + 8}px, ${top}px)`, opacity: 1 },
      { transform: `translate(${out}px, ${top}px)`, opacity: 1, offset: 0.55, easing: 'ease-out' },
      { transform: `translate(${out - 60}px, ${top + 30}px) scale(0.85)`, opacity: 0 }
    ],
    { duration: 900, fill: 'forwards' }
  );
  // Cancelled, it's over either way.
  await move.finished.catch(() => {});
  flight.remove();
  slot.remove();
}

/** Bounces an app's icon in the Dock as it opens, as a Mac does, once its slot is there. */
export function bounce(app: string) {
  if (reduced()) return;
  let tries = 0;
  const find = () => {
    const icon = document.querySelector<HTMLElement>(`[data-dock-app="${app}"] .os-dock-icon`);
    if (!icon) {
      if (++tries < 20) requestAnimationFrame(find);
      return;
    }
    icon.animate(
      [
        { translate: '0 0' },
        { translate: '0 -24px', offset: 0.2, easing: 'ease-out' },
        { translate: '0 0', offset: 0.4, easing: 'ease-in' },
        { translate: '0 -14px', offset: 0.6, easing: 'ease-out' },
        { translate: '0 0', offset: 0.8, easing: 'ease-in' },
        { translate: '0 0' }
      ],
      { duration: 900 }
    );
  };
  requestAnimationFrame(find);
}
