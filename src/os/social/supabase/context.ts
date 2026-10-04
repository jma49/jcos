// What every Supabase slice shares: the one client, who's signed in (the
// session, read once and followed after), the usernames already known, and
// how a database refusal reads. Made once by the composer (index.ts) and
// handed to each slice, so they all see the same session and cache.

import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '../../../lib/database.types';
import type { Account } from '../accounts';
import { SocialError } from '../errors';

export type Client = SupabaseClient<Database>;

export interface SupabaseContext {
  client: Client;
  /** The signed-in member, or null. */
  account: () => Account | null;
  /** Records who signed in or out here, as signing in learns it (the session's own changes come through Auth). */
  setAccount: (account: Account | null) => void;
  /** Told of every change of member: the slices' (the chat channel's) first, then the site's. */
  listeners: Set<(account: Account | null) => void>;
  /** Settles once the stored session has been read. */
  ready: Promise<Account | null>;
  /** The signed-in member, or a refusal. */
  member: () => Account;
  /** Usernames by account, for chat messages that arrive without one. */
  usernames: Map<string, string>;
  /** A member's username by account id, from the cache or the database. */
  usernameOf: (id: string) => Promise<string>;
}

export const accountOf = (user: User | null | undefined): Account | null =>
  user ? { id: user.id, username: String(user.user_metadata?.username ?? user.email?.split('@')[0] ?? '') } : null;

/** Turns a database refusal into one the interface can explain. */
export function refusal(error: PostgrestError): SocialError {
  if (error.code === 'P0429') return new SocialError('limit', error.message);
  if (error.code === '42501') return new SocialError('signed-out', 'Sign in first.');
  if (error.code === '23505') return new SocialError('already', 'You’ve already done that.');
  return new SocialError('failed', error.message);
}

/** A write only the owner may make, from anyone else: row-level security refuses it (42501). */
export const notOwner = (what = 'the discs everyone sees') => new SocialError('failed', `Only Jincheng can change ${what}.`);

export function supabaseContext(client: Client): SupabaseContext {
  let current: Account | null = null;
  const listeners = new Set<(account: Account | null) => void>();
  client.auth.onAuthStateChange((_event, session) => {
    const next = accountOf(session?.user);
    if (next?.id === current?.id && next?.username === current?.username) return;
    current = next;
    listeners.forEach((l) => l(current));
  });
  const ready = client.auth.getSession().then(({ data }) => {
    current = accountOf(data.session?.user);
    return current;
  });

  const usernames = new Map<string, string>();

  return {
    client,
    account: () => current,
    setAccount: (account) => {
      current = account;
    },
    listeners,
    ready,
    member: () => {
      if (!current) throw new SocialError('signed-out', 'Sign in first.');
      return current;
    },
    usernames,
    async usernameOf(id) {
      if (!usernames.has(id)) {
        const { data } = await client.from('profiles').select('username').eq('id', id).maybeSingle();
        usernames.set(id, data?.username ?? 'someone');
      }
      return usernames.get(id)!;
    }
  };
}
