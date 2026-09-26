// Who's signed in, for the interface: the menu bar, Stickies, Soapbox and
// Chat all read it here. startAccount() connects it to the backend once.

import { create } from 'zustand';
import { getSocial } from './social';
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

export function startAccount() {
  if (started) return;
  started = true;
  getSocial().then((social) => {
    if (!social) return useAccount.setState({ ready: true });
    useAccount.setState({ available: true });
    social.onAccount((account) => useAccount.setState({ account, ready: true }));
  });
}
