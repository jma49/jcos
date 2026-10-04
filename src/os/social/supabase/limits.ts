// The limits a member is held to, from member_limits(): asked once a page,
// and again after a failure.

import type { Limits, LimitsSocial } from '../limits';
import type { SupabaseContext } from './context';

export function supabaseLimits({ client }: SupabaseContext): LimitsSocial {
  let asked: Promise<Limits | null> | null = null;
  return {
    limits() {
      asked ??= Promise.resolve(client.rpc('member_limits'))
        .then(({ data, error }) => {
          const row = data?.[0];
          if (error || !row) throw error ?? new Error('no limits');
          return { notesPerDay: row.notes_per_day, stickies: row.stickies, events: row.events, todos: row.todos };
        })
        .catch(() => {
          // A database without the migration, or none reached: nothing said, and asked again next time.
          asked = null;
          return null;
        });
      return asked;
    }
  };
}
