// The guestbook in this browser, three notes a day as the database counts.

import { loadJSON, saveJSON } from '../../core/storage';
import { SocialError } from '../errors';
import { NOTES_PER_DAY, type Note, type NotesSocial } from '../notes';
import type { LocalContext } from './context';

const NOTES_KEY = 'os-dev-notes';

export function localNotes({ account, member }: LocalContext): NotesSocial {
  const notes = () => loadJSON<Note[]>(NOTES_KEY, []);

  async function notesLeft() {
    const current = account();
    if (!current) return 0;
    const day = Date.now() - 86_400_000;
    const today = notes().filter((n) => n.user_id === current.id && Date.parse(n.created_at) > day).length;
    return Math.max(0, NOTES_PER_DAY - today);
  }

  return {
    async listNotes() {
      return notes().sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async postNote(note) {
      const me = member();
      if ((await notesLeft()) <= 0) throw new SocialError('limit', 'That’s three notes today. Come back tomorrow.');
      saveJSON(NOTES_KEY, [...notes(), { ...note, id: crypto.randomUUID(), name: me.username, user_id: me.id, created_at: new Date().toISOString() }]);
    },

    async deleteNote(id) {
      const me = member();
      saveJSON(
        NOTES_KEY,
        notes().filter((n) => n.id !== id || n.user_id !== me.id)
      );
    },

    notesLeft
  };
}
