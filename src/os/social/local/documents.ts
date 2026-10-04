// Jincheng's home folder in this browser, with the database's rules:
// Public for anyone, the rest and the diary for DEV_OWNER only, and a save
// from an older version refused.

import { loadJSON, saveJSON } from '../../core/storage';
import type { DiaryEntry, DocumentsSocial, Home, HomeDocument } from '../documents';
import { changedElsewhere, SocialError } from '../errors';
import { DEV_OWNER, type LocalContext } from './context';

const HOME_KEY = 'os-dev-home';

export function localDocuments({ account, owner }: LocalContext): DocumentsSocial {
  const home = () => loadJSON<Home>(HOME_KEY, { documents: [], diary: [] });
  /** Changes the stored home folder from what's stored now; a refusal thrown by `change` stores nothing. */
  const changeHome = <T,>(change: (h: Home) => T): T => {
    const h = home();
    const result = change(h);
    saveJSON(HOME_KEY, h);
    return result;
  };

  return {
    async home(asOwner) {
      const h = home();
      const mine = asOwner && account()?.username === DEV_OWNER;
      // Documents kept before they had a date of their own count from their last save.
      const documents = h.documents.map((d) => ({ ...d, created: d.created ?? d.updated }));
      return { documents: documents.filter((d) => mine || d.folder === 'public'), diary: mine ? h.diary : [] };
    },
    async saveDocument({ id, version, folder, name, body }) {
      owner('Jincheng’s documents');
      const badName = name !== name.trim() || !name || name.length > 80 || /[\u0000-\u001f\u007f/:]/.test(name) || name.startsWith('.');
      if (badName || body.length > 100_000) {
        throw new SocialError('invalid', 'A name is one line, without “/” or “:”, and a document holds 100,000 characters at most.');
      }
      return changeHome((h) => {
        if (h.documents.some((d) => d.id !== id && d.folder === folder && d.name.toLowerCase() === name.toLowerCase())) {
          throw new SocialError('already', `There’s already a document called “${name}” in that folder.`);
        }
        const updated = new Date().toISOString();
        if (!id) {
          const made: HomeDocument = { id: crypto.randomUUID(), folder, name, body, version: 1, created: updated, updated };
          h.documents.push(made);
          return made;
        }
        const at = h.documents.findIndex((d) => d.id === id && d.version === version);
        if (at < 0) throw changedElsewhere();
        const saved = { ...h.documents[at], folder, name, body, version: h.documents[at].version + 1, updated };
        h.documents[at] = saved;
        return saved;
      });
    },
    async deleteDocument(id) {
      owner('Jincheng’s documents');
      changeHome((h) => {
        h.documents = h.documents.filter((d) => d.id !== id);
      });
    },
    async saveEntry({ id, version, day, body }) {
      owner('Jincheng’s diary');
      if (!body.trim() || body.length > 20_000) throw new SocialError('invalid', 'A diary entry says something, in 20,000 characters at most.');
      return changeHome((h) => {
        const now = new Date().toISOString();
        if (!id) {
          const made: DiaryEntry = { id: crypto.randomUUID(), day, body, version: 1, created: now, updated: now };
          h.diary.push(made);
          return made;
        }
        const at = h.diary.findIndex((e) => e.id === id && e.version === version);
        if (at < 0) throw changedElsewhere();
        const saved = { ...h.diary[at], day, body, version: h.diary[at].version + 1, updated: now };
        h.diary[at] = saved;
        return saved;
      });
    },
    async deleteEntry(id) {
      owner('Jincheng’s diary');
      changeHome((h) => {
        h.diary = h.diary.filter((e) => e.id !== id);
      });
    }
  };
}
