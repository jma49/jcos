// What every slice of the stand-in shares: this browser's members and who's
// signed in (kept in localStorage, as the session would be), and the
// refusals the database's rules would give. Made once by the composer
// (index.ts) and handed to each slice.

import { loadJSON, saveJSON } from '../../core/storage';
import type { Account } from '../accounts';
import { SocialError } from '../errors';

const USERS_KEY = 'os-dev-users';
const SESSION_KEY = 'os-dev-session';
/** The member the stand-in treats as the owner: sign up as this to see the owner's rooms. */
export const DEV_OWNER = 'jincheng';

export interface StoredUser extends Account {
  password: string;
  recovery?: string;
}

export interface LocalContext {
  /** Every member this browser knows, as stored now. */
  users: () => StoredUser[];
  saveUsers: (users: StoredUser[]) => void;
  /** The signed-in member, or null. */
  account: () => Account | null;
  /** Signs in or out here, and tells every listener. */
  become: (account: Account | null) => void;
  listeners: Set<(account: Account | null) => void>;
  /** The signed-in member, or a refusal. */
  member: () => Account;
  /** The owner, or a refusal as the database's row-level security would give. */
  owner: (what: string) => void;
}

export function localContext(): LocalContext {
  let current = loadJSON<Account | null>(SESSION_KEY, null);
  const listeners = new Set<(account: Account | null) => void>();
  const member = () => {
    if (!current) throw new SocialError('signed-out', 'Sign in first.');
    return current;
  };
  return {
    users: () => loadJSON<StoredUser[]>(USERS_KEY, []),
    saveUsers: (users) => saveJSON(USERS_KEY, users),
    account: () => current,
    become: (account) => {
      current = account;
      saveJSON(SESSION_KEY, account);
      listeners.forEach((l) => l(account));
    },
    listeners,
    member,
    owner: (what) => {
      if (member().username !== DEV_OWNER) throw new SocialError('failed', `Only Jincheng can change ${what}.`);
    }
  };
}
