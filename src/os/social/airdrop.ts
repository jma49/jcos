// AirDrop between visitors on the desktop. What's sent is a place on
// Macintosh HD (a photo, a project, a song, an app, a folder), never a
// file's contents: the receiver looks the path up on its own disk, so
// only things JM/OS already has can arrive. Offers and answers travel as
// signals over the presence channel (signals.ts); nothing is stored.
//
// AirDrop is for members: only signed-in visitors see each other, send or
// receive, and are shown by username. Anyone could still send an offer
// over the channel, so a receiver only takes them while signed in and
// discoverable, only for paths that exist, one at a time per sender
// and a few at once, and names the sender from presence, not from what
// the offer says.

import { createElement } from 'react';
import { create } from 'zustand';
import { apps, launch } from '../core/registry';
import { buildDisk, find, type FileNode } from '../core/files';
import { notify, dismiss } from '../core/notices';
import { play } from '../core/sound';
import { load, save } from '../core/storage';
import { useWindows } from '../core/store';
import type { AppId, OSData } from '../core/types';
import { useAccount } from './account';
import { myPresenceId, onSignal, sendSignal } from './signals';
import type { Visitor } from './types';

/** The drag-and-drop type Finder uses for a file's path. */
export const PATH_MIME = 'application/x-jmos-path';

const KEY = 'os-airdrop';
/** How long an offer waits for an answer. */
const WAIT_MS = 60_000;
/** Offers waiting on this visitor at once; more are ignored. */
const MAX_PENDING = 3;

export type Discoverable = 'everyone' | 'none';

export type TransferState = 'waiting' | 'accepted' | 'declined' | 'unanswered';

export interface Transfer {
  id: string;
  /** Who it went to (a presence id), and how they were shown. */
  to: string;
  toLabel: string;
  path: string;
  name: string;
  state: TransferState;
}

interface AirDropState {
  discoverable: Discoverable;
  /** What this visitor has sent, newest last. */
  sent: Transfer[];
}

export const useAirDrop = create<AirDropState>(() => ({
  discoverable: load(KEY) === 'none' ? 'none' : 'everyone',
  sent: []
}));

export function setDiscoverable(discoverable: Discoverable) {
  save(KEY, discoverable);
  useAirDrop.setState({ discoverable });
}

/** How a visitor is shown in AirDrop: their username. */
export const labelOf = (v: Pick<Visitor, 'username'>) => v.username ?? 'Someone';

/** The people AirDrop can reach: other signed-in members on the desktop who are discoverable. */
export const reachable = (visitors: Visitor[] | null) =>
  (visitors ?? []).filter((v) => !v.self && v.username && v.airdrop !== false && v.username !== useAccount.getState().account?.username);

/** Opens AirDrop to share a place on Macintosh HD. */
export function shareViaAirDrop(path: string) {
  launch('airdrop', { props: { path } });
}

const update = (id: string, state: TransferState) =>
  useAirDrop.setState((s) => ({ sent: s.sent.map((t) => (t.id === id && t.state === 'waiting' ? { ...t, state } : t)) }));

/** Offers `node` to a visitor; the answer arrives in `sent`. */
export function sendAirDrop(to: Visitor, node: FileNode) {
  if (!useAccount.getState().account) return null;
  const id = crypto.randomUUID();
  if (!sendSignal('airdrop-offer', { to: to.id, id, path: node.path })) return null;
  useAirDrop.setState((s) => ({ sent: [...s.sent.slice(-19), { id, to: to.id, toLabel: labelOf(to), path: node.path, name: node.name, state: 'waiting' }] }));
  play('click');
  setTimeout(() => update(id, 'unanswered'), WAIT_MS);
  return id;
}

/** The disk as a receiver sees it: every applet, so a shared one can be found. */
const allApplets = () => (Object.keys(apps) as AppId[]).filter((id) => apps[id].applet);

let started = false;

/** Listens for offers and answers. Call once, as the desktop starts. */
export function startAirDrop(data: OSData) {
  if (started) return;
  started = true;
  /** Offers waiting on this visitor, by sender. */
  const pending = new Map<string, string>();

  onSignal('airdrop-offer', ({ from, payload }) => {
    const { to, id, path } = payload;
    if (to !== myPresenceId() || typeof id !== 'string' || typeof path !== 'string' || id.length > 64 || path.length > 300) return;
    if (useAirDrop.getState().discoverable === 'none' || !useAccount.getState().account) return;
    if (pending.has(from) || pending.size >= MAX_PENDING) return;
    const sender = useWindows.getState().visitors?.find((v) => v.id === from);
    const node = find(buildDisk(data, allApplets()), path);
    if (!sender?.username || !node) return;

    const answer = (accepted: boolean) => {
      pending.delete(from);
      sendSignal('airdrop-reply', { to: from, id, accepted });
    };
    pending.set(from, id);
    play('chime');
    const who = labelOf(sender);
    const notice = notify({
      id: `airdrop:${id}`,
      title: 'AirDrop',
      body: `${who} would like to share “${node.name}”.`,
      icon: node.thumb
        ? createElement('img', { src: node.thumb, alt: '', className: 'os-notice-thumb' })
        : createElement(node.Icon, { size: 36 }),
      actions: [
        { label: 'Decline', run: () => answer(false) },
        {
          label: 'Accept',
          primary: true,
          run: () => {
            answer(true);
            if (node.children) launch('finder', { props: { path: node.path } });
            else node.open?.(null);
          }
        }
      ],
      onDismiss: () => answer(false)
    });
    // Nobody answered: let the sender know, and take it away.
    setTimeout(() => {
      if (pending.get(from) === id) dismiss(notice);
    }, WAIT_MS);
  });

  onSignal('airdrop-reply', ({ from, payload }) => {
    const { to, id, accepted } = payload;
    if (to !== myPresenceId() || typeof id !== 'string') return;
    const transfer = useAirDrop.getState().sent.find((t) => t.id === id);
    if (!transfer || transfer.to !== from) return;
    update(id, accepted === true ? 'accepted' : 'declined');
    play(accepted === true ? 'pop' : 'error');
  });
}
