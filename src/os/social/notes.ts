// Stickies, the guestbook: notes members put up for everyone, three in any
// 24 hours. The Supabase side is supabase/notes.ts, the stand-in's
// local/notes.ts.

export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_MAX = 280;
/** Notes a member may put up in any 24 hours. */
export const NOTES_PER_DAY = 3;

export interface Note {
  id: string;
  body: string;
  /** The member's username (older notes: whatever name was typed). */
  name: string;
  color: NoteColor;
  /** Who put it up; null for notes from before accounts. */
  user_id: string | null;
  created_at: string;
}

export interface NotesSocial {
  /** The newest visible notes. */
  listNotes: () => Promise<Note[]>;
  /** Puts a note up for the signed-in member (three a day). */
  postNote: (note: Pick<Note, 'body' | 'color'>) => Promise<void>;
  /** Takes down one of the member's own notes. */
  deleteNote: (id: string) => Promise<void>;
  /** How many more notes the member can put up right now. */
  notesLeft: () => Promise<number>;
}
