// The social features on Supabase (supabase/migrations/): accounts through
// Supabase Auth, notes, reactions and chat in Postgres behind row-level
// security, presence and live chat through Realtime. One client and one
// context (context.ts) are shared by every domain's slice, joined here into
// what getSocial() returns. Loaded only by social.ts's dynamic import.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../lib/database.types';
import type { Social } from '../types';
import { supabaseAccounts } from './accounts';
import { supabaseCalendar } from './calendar';
import { supabaseChat } from './chat';
import { supabaseContext } from './context';
import { supabaseDiscs } from './discs';
import { supabaseDocuments } from './documents';
import { supabaseJobs } from './jobs';
import { supabaseMusic } from './music';
import { supabaseNotes } from './notes';
import { supabaseSoapbox } from './soapbox';
import { supabaseStickies } from './stickies';
import { supabaseVisitors } from './visitors';

export function supabaseSocial(url: string, key: string): Social {
  const client = createClient<Database>(url, key, {
    // The session stays in this browser, so members stay signed in.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'os-auth' }
  });
  const ctx = supabaseContext(client);
  return {
    ...supabaseAccounts(ctx),
    ...supabaseNotes(ctx),
    ...supabaseVisitors(ctx),
    ...supabaseSoapbox(ctx),
    ...supabaseChat(ctx),
    ...supabaseMusic(ctx),
    ...supabaseDiscs(ctx),
    ...supabaseDocuments(ctx),
    ...supabaseStickies(ctx),
    ...supabaseCalendar(ctx),
    ...supabaseJobs(ctx)
  };
}
