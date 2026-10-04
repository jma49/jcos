// The two backends the contract tests hold to the same rules: the
// stand-in (local/), on a storage of its own, and the Supabase slices
// (supabase/), over a fake client (fakeSupabase.ts). Each domain's test
// runs every case on both with describe.each(backends); a case arranges
// what the database holds the way each backend can (`given`): the stand-in
// by its own calls or its storage, Supabase by priming what the database
// answers. What a case then asserts is the same for both.

import { vi } from 'vitest';
import type { Account } from '../accounts';
import { localSocial } from '../local/index';
import { socialOver } from '../supabase/index';
import type { Social } from '../types';
import { fakeSupabase, type FakeSupabase } from './fakeSupabase';

/** The owner on both: the stand-in's DEV_OWNER, and the fake database's private.owners. */
export const OWNER = 'jincheng';

export interface Arrange {
  /** The stand-in: its storage, by key, to seed or read. */
  local?: (store: Map<string, string>, social: Social) => unknown;
  /** Supabase: the fake client, to prime what the database answers. */
  supabase?: (db: FakeSupabase) => unknown;
}

export interface Backend {
  name: 'local' | 'supabase';
  social: Social;
  /** Makes an account and signs in as it; `OWNER` is the owner. */
  signUp: (username: string) => Promise<Account>;
  /** Arranges what the database holds or answers, each backend its way. */
  given: (arrange: Arrange) => Promise<void>;
  /** The fake client under the Supabase slices; null for the stand-in. */
  db: FakeSupabase | null;
}

/** BroadcastChannel without other tabs: what's posted goes nowhere, as in a lone tab. */
class LoneChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

function local(): Backend {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key)
    }
  });
  vi.stubGlobal('BroadcastChannel', LoneChannel);
  const social = localSocial();
  return {
    name: 'local',
    social,
    signUp: (username) => social.signUp(username, 'a password'),
    given: async ({ local }) => void (await local?.(store, social)),
    db: null
  };
}

function supabase(): Backend {
  const db = fakeSupabase();
  db.owner(OWNER);
  const social = socialOver(db.client);
  return {
    name: 'supabase',
    social,
    signUp: (username) => social.signUp(username, 'a password'),
    given: async ({ supabase }) => void (await supabase?.(db)),
    db
  };
}

export const backends = [
  { name: 'local', make: local },
  { name: 'supabase', make: supabase }
];
