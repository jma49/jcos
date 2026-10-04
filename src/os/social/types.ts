// What the social features share, whichever backend serves them: Supabase
// in production (supabase/) or a stand-in during `astro dev` (local/).
//
// Each domain is a file of its own here, with its part of the backend (an
// interface), its types and its constants: accounts.ts, notes.ts (the
// guestbook), visitors.ts (presence), soapbox.ts, chat.ts, music.ts,
// discs.ts, documents.ts (Jincheng's home folder), stickies.ts (a
// member's own), calendar.ts (iCal) and jobs.ts (Job Hunt). Each backend
// has a slice per domain (supabase/<domain>.ts, local/<domain>.ts) and a
// composer that joins them (supabase/index.ts, local/index.ts). This file
// re-exports them all and joins their interfaces into Social, so callers
// import from social.ts (or here) as before.

import type { AccountsSocial } from './accounts';
import type { CalendarSocial } from './calendar';
import type { ChatSocial } from './chat';
import type { DiscsSocial } from './discs';
import type { DocumentsSocial } from './documents';
import type { JobsSocial } from './jobs';
import type { MusicSocial } from './music';
import type { NotesSocial } from './notes';
import type { SoapboxSocial } from './soapbox';
import type { StickiesSocial } from './stickies';
import type { PresenceSocial } from './visitors';

export * from './accounts';
export * from './notes';
export * from './visitors';
export * from './soapbox';
export * from './chat';
export { SocialError, type Refusal } from './errors';
export * from './music';
export * from './documents';
export * from './stickies';
export * from './calendar';
export type { DiscsSocial } from './discs';

/** Everything the site asks of the backend: every domain's part. */
export interface Social
  extends AccountsSocial,
    NotesSocial,
    PresenceSocial,
    SoapboxSocial,
    ChatSocial,
    MusicSocial,
    DiscsSocial,
    DocumentsSocial,
    StickiesSocial,
    CalendarSocial,
    JobsSocial {}
