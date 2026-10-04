// A stand-in for the Supabase backend during `astro dev`, so accounts,
// Stickies, reactions, chat, presence, DVD Player's shelf, the iPod's
// ratings and playlists, the home folder, a member's own stickies and
// calendar, and Job Hunt can be tried without a project.
// Everything lives in this browser's localStorage, and chat and presence go
// between its tabs over BroadcastChannels. It keeps the same rules as the
// database (three notes a day, one reaction per visitor unless signed in),
// but it's not secure in any way: passwords are stored as typed.
//
// One context (context.ts) is shared by every domain's slice, joined here.
// Only social.ts's dynamic import under `import.meta.env.DEV` loads it, so
// a production build has none of it.

import type { Social } from '../types';
import { localAccounts } from './accounts';
import { localCalendar } from './calendar';
import { localChat } from './chat';
import { localContext } from './context';
import { localDiscs } from './discs';
import { localDocuments } from './documents';
import { localJobs } from './jobs';
import { localLimits } from './limits';
import { localMusic } from './music';
import { localNotes } from './notes';
import { localSoapbox } from './soapbox';
import { localStickies } from './stickies';
import { localVisitors } from './visitors';

export function localSocial(): Social {
  const ctx = localContext();
  return {
    ...localAccounts(ctx),
    ...localNotes(ctx),
    ...localVisitors(),
    ...localSoapbox(ctx),
    ...localChat(ctx),
    ...localMusic(ctx),
    ...localDiscs(ctx),
    ...localDocuments(ctx),
    ...localStickies(ctx),
    ...localCalendar(ctx),
    ...localJobs(ctx),
    ...localLimits()
  };
}
