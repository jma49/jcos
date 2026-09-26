// Signals between visitors on the desktop: typing in Chat, nudges and
// AirDrop. They travel over the presence channel Presence.tsx joins and
// aren't kept anywhere. Apps send and listen here without holding the
// channel themselves. Anyone can send anything, so listeners check what
// arrives before they use it.

import type { Signal } from './types';

type Listener = (signal: Signal) => void;

interface Channel {
  id: string;
  signal: (event: string, payload: Record<string, unknown>) => void;
}

const listeners = new Map<string, Set<Listener>>();
let channel: Channel | null = null;

/** Called by Presence.tsx as it joins the desktop (and with null as it leaves). */
export function connectSignals(next: Channel | null) {
  channel = next;
}

/** This visitor's presence id, or null while not on the desktop's channel. */
export const myPresenceId = () => channel?.id ?? null;

/** Sends a signal to everyone else; false when there's no channel to send it on. */
export function sendSignal(event: string, payload: Record<string, unknown>) {
  if (!channel) return false;
  channel.signal(event, payload);
  return true;
}

/** Listens for one kind of signal; returns a function that stops. */
export function onSignal(event: string, listener: Listener) {
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/** Hands an arriving signal to its listeners. */
export function deliverSignal(signal: Signal) {
  listeners.get(signal.event)?.forEach((l) => l(signal));
}
