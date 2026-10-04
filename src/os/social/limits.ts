// The limits a member is held to, as the database has them: notes a day,
// stickies, events and to-dos. They're defined once, in the database
// (music_settings, read by its triggers and by member_limits():
// supabase/migrations/20261004025117_member_limits.sql), where Jincheng
// can change them without a deploy; the site asks rather than keeping its
// own copy. The Supabase side is supabase/limits.ts, the stand-in's
// local/limits.ts.
//
// The lengths are different: a note's 280 characters (NOTE_MAX), a
// sticky's 4,000 (STICKY_MAX), a message's 500 (CHAT_MAX), a username's
// shape (USERNAME) are the tables' checks, which only a migration
// changes, and an input needs them as it renders (maxLength); the minimum
// password (PASSWORD_MIN) is Supabase Auth's setting. They stay
// constants, beside the domain's types, and the database refuses whatever
// gets past a stale one.

export interface Limits {
  /** Notes a member may put up in any 24 hours. */
  notesPerDay: number;
  /** Stickies of their own a member may keep. */
  stickies: number;
  /** Events and to-dos a member may keep. */
  events: number;
  todos: number;
}

export interface LimitsSocial {
  /**
   * The limits as the database has them, asked once a page; null when it
   * can't say (a database without member_limits() yet), and then only
   * the database's refusal tells.
   */
  limits: () => Promise<Limits | null>;
}
