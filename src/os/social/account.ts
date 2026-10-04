// Who's signed in, for the interface: the menu bar, Stickies, Soapbox and
// Chat all read it here. startAccount() connects it to the backend once.
//
// Knowing it doesn't always take the backend, which isn't part of a first
// visit (docs/decisions/0009). Without a stored session no one is signed
// in, and that's known at once: the account is null and ready, and the
// backend loads when something asks for it (an app, signing in, Presence
// once the desktop has settled), which connects it here. With one, a
// member's desktop (their stickies, the menu's Sign Out) waits on it, so
// it loads at the start.

import { create } from 'zustand';
import { onStored } from '../core/storage';
import { getSocial, hasStoredSession, HAS_BACKEND, onSocial, SESSION_KEY, type Social } from './social';
import type { Account } from './types';

interface AccountState {
  /** The signed-in member, or null. */
  account: Account | null;
  /** Whether there's a backend for accounts at all (there isn't without Supabase in production). */
  available: boolean;
  /** Whether the session has been read yet. */
  ready: boolean;
}

export const useAccount = create<AccountState>(() => ({ account: null, available: false, ready: false }));

let started = false;

function connect(social: Social | null) {
  if (!social) return useAccount.setState({ available: false, ready: true });
  social.onAccount((account) => useAccount.setState({ account, available: true, ready: true }));
}

export function startAccount() {
  if (started) return;
  started = true;
  if (!HAS_BACKEND) return void useAccount.setState({ ready: true });
  onSocial(connect);
  // Until the session is read, the menu offers neither Sign In nor Sign Out.
  if (hasStoredSession()) return void getSocial();
  useAccount.setState({ available: true, ready: true });
  // Signed in from another tab: this one loads the backend to follow.
  onStored(SESSION_KEY, () => void (hasStoredSession() && getSocial()));
}
