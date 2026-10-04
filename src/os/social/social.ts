// The social side of JM/OS: accounts, Stickies, presence, Soapbox
// reactions and the chat room.
//
// Production talks to Supabase with the public anon (or publishable) key;
// see supabase/schema.sql and this folder's supabase/index.ts. The URL and
// key are read from PUBLIC_SUPABASE_* or, as the Supabase integration for
// Vercel names them, from NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Without them the features stay
// hidden, except in `astro dev`, which falls back to a stand-in that works
// across tabs of one browser (local/index.ts). How the folder is laid out,
// a file per domain and a slice of each backend per domain: types.ts.
//
// The backend's code (supabase-js alone is 58 KB gzipped) isn't part of a
// first visit: it loads when something asks for it, at the latest once the
// desktop has settled (account.ts; docs/decisions/0009).

import { load as loadStored } from '../core/storage';
import type { Social } from './types';

export * from './types';

/** How often a moving cursor is sent to others, at most. */
export const CURSOR_INTERVAL = 100;

// Written out in full so Vite inlines each value on its own.
const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);

/** Where supabase-js keeps the session in this browser (its `storageKey`, supabase/index.ts). */
export const SUPABASE_SESSION_KEY = 'os-auth';
/** Where the stand-in keeps who's signed in (local/context.ts). */
export const DEV_SESSION_KEY = 'os-dev-session';

/** Whether this build has a backend at all, known without loading it. */
export const HAS_BACKEND = SUPABASE || import.meta.env.DEV;

/** Where this build's backend keeps a session. */
export const SESSION_KEY = SUPABASE ? SUPABASE_SESSION_KEY : DEV_SESSION_KEY;

/**
 * Whether this browser holds a session, read without loading the backend.
 * Without one no one is signed in: a session is only ever stored, never
 * taken from the address (`detectSessionInUrl` is off). One that's stored
 * may still turn out to have expired.
 */
export const hasStoredSession = () => HAS_BACKEND && loadStored(SESSION_KEY) !== null;

let pending: Promise<Social | null> | null = null;
const whenLoaded: ((social: Social | null) => void)[] = [];

/** The social backend, loaded on first use, or null when there isn't one. */
export function getSocial(): Promise<Social | null> {
  if (pending) return pending;
  const loading = loadBackend().catch((error) => {
    console.warn(`[social] ${error}`);
    return null;
  });
  pending = loading;
  for (const callback of whenLoaded.splice(0)) void loading.then(callback);
  return loading;
}

/** Calls back once the backend has loaded (or failed to), whoever asks for it first. */
export function onSocial(callback: (social: Social | null) => void) {
  if (pending) void pending.then(callback);
  else whenLoaded.push(callback);
}

async function loadBackend(): Promise<Social | null> {
  if (SUPABASE_URL && SUPABASE_KEY) return (await import('./supabase/index')).supabaseSocial(SUPABASE_URL, SUPABASE_KEY);
  if (import.meta.env.DEV) return (await import('./local/index')).localSocial();
  return null;
}
