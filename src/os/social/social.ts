// The social side of JM/OS: accounts, Stickies, presence, Soapbox
// reactions and the chat room.
//
// Production talks to Supabase with the public anon (or publishable) key;
// see supabase/schema.sql and supabase.ts. The URL and key are read from
// PUBLIC_SUPABASE_* or, as the Supabase integration for Vercel names them,
// from NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
// Without them the features stay hidden, except in `astro dev`, which falls
// back to a stand-in that works across tabs of one browser (local.ts).

import type { Social } from './types';

export * from './types';

/** Colours for visitors' cursors. */
export const CURSOR_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#0090ff', '#8e4ec6', '#d6409f'];

/** How often a moving cursor is sent to others, at most. */
export const CURSOR_INTERVAL = 100;

let pending: Promise<Social | null> | null = null;

/** The social backend, loaded on first use, or null when there isn't one. */
export function getSocial(): Promise<Social | null> {
  pending ??= load().catch((error) => {
    console.warn(`[social] ${error}`);
    return null;
  });
  return pending;
}

async function load(): Promise<Social | null> {
  // Written out in full so Vite inlines each value on its own.
  const url = import.meta.env.PUBLIC_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return (await import('./supabase')).supabaseSocial(url, key);
  if (import.meta.env.DEV) return (await import('./local')).localSocial();
  return null;
}
