// The stand-in's limits. It plays the database here, so it holds its own
// copy of the database's defaults (member_limits(),
// supabase/migrations/20261004025117_member_limits.sql), which its slices
// enforce and limits() answers.

import type { Limits, LimitsSocial } from '../limits';

export const LOCAL_LIMITS: Limits = { notesPerDay: 3, stickies: 50, events: 5000, todos: 1000 };

export function localLimits(): LimitsSocial {
  return {
    async limits() {
      return LOCAL_LIMITS;
    }
  };
}
