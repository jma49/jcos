// The guestbook's notes in public.notes: members put them up, row-level
// security shows the approved ones, and the database holds each member to
// three a day.

import { NOTES_PER_DAY, type Note, type NoteColor, type NotesSocial } from '../notes';
import { refusal, type SupabaseContext } from './context';

export function supabaseNotes({ client, account, member }: SupabaseContext): NotesSocial {
  return {
    async listNotes() {
      const { data, error } = await client
        .from('notes')
        .select('id, body, name, color, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return data.map((note): Note => ({ ...note, color: note.color as NoteColor }));
    },

    async postNote(note) {
      member();
      // No .select(): visitors can't read back every column the database fills in.
      const { error } = await client.from('notes').insert(note);
      if (error) throw refusal(error);
    },

    async deleteNote(id) {
      member();
      const { error } = await client.from('notes').delete().eq('id', id);
      if (error) throw refusal(error);
    },

    // Counted by the database as its limit counts, hidden notes too, which
    // row-level security doesn't show the member.
    async notesLeft() {
      if (!account()) return 0;
      const { data, error } = await client.rpc('notes_left');
      if (error) throw refusal(error);
      return typeof data === 'number' ? Math.max(0, Math.min(NOTES_PER_DAY, data)) : 0;
    }
  };
}
