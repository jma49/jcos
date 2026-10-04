// Jincheng's home folder in public.documents and public.diary. Row-level
// security gives anyone else only the documents in Public, and no diary at
// all; only the owner writes. A save names the version it was made from.

import type { Tables } from '../../../lib/database.types';
import type { DiaryEntry, DocumentsSocial, HomeDocument, HomeFolder } from '../documents';
import { changedElsewhere, SocialError } from '../errors';
import { notOwner, refusal, type SupabaseContext } from './context';

/** The columns of a document and of a diary entry, as the owner (or, in Public, anyone) reads them. */
const DOCUMENT_COLUMNS = 'id,folder,name,body,version,created_at,updated_at';
const ENTRY_COLUMNS = 'id,day,body,version,created_at,updated_at';

// Rows are typed by the generated types (src/lib/database.types.ts), with
// the columns read. Those know a column's type but not its check: the
// folder is a string there, narrowed here to what the check allows.

type DocumentRow = Pick<Tables<'documents'>, 'id' | 'folder' | 'name' | 'body' | 'version' | 'created_at' | 'updated_at'>;

type EntryRow = Pick<Tables<'diary'>, 'id' | 'day' | 'body' | 'version' | 'created_at' | 'updated_at'>;

const documentOf = (row: DocumentRow): HomeDocument => ({
  id: row.id,
  folder: row.folder as HomeFolder,
  name: row.name,
  body: row.body,
  version: row.version,
  created: row.created_at,
  updated: row.updated_at
});

const entryOf = (row: EntryRow): DiaryEntry => ({
  id: row.id,
  day: row.day,
  body: row.body,
  version: row.version,
  created: row.created_at,
  updated: row.updated_at
});

export function supabaseDocuments({ client, member }: SupabaseContext): DocumentsSocial {
  return {
    async home(owner) {
      const [documents, diary] = await Promise.all([
        client.from('documents').select(DOCUMENT_COLUMNS).order('folder').order('name'),
        owner
          ? client.from('diary').select(ENTRY_COLUMNS).order('day', { ascending: false }).order('created_at')
          : Promise.resolve({ data: [] as EntryRow[], error: null })
      ]);
      if (documents.error) throw documents.error;
      if (diary.error) throw diary.error;
      return { documents: (documents.data ?? []).map(documentOf), diary: (diary.data ?? []).map(entryOf) };
    },

    // A save names the version it was made from, so one from an older copy
    // reaches no row and is refused rather than overwriting what's newer.
    async saveDocument({ id, version, folder, name, body }) {
      member();
      const request = id
        ? client
            .from('documents')
            .update({ folder, name, body })
            .eq('id', id)
            .eq('version', version ?? 0)
            .select(DOCUMENT_COLUMNS)
            .maybeSingle()
        : client.from('documents').insert({ folder, name, body }).select(DOCUMENT_COLUMNS).single();
      const { data, error } = await request;
      if (error) {
        if (error.code === '42501') throw notOwner('Jincheng’s documents');
        if (error.code === '23505') throw new SocialError('already', `There’s already a document called “${name}” in that folder.`);
        if (error.code === '23514')
          throw new SocialError('invalid', 'A name is one line, without “/” or “:”, and a document holds 100,000 characters at most.');
        throw refusal(error);
      }
      if (!data) throw changedElsewhere();
      return documentOf(data);
    },

    async deleteDocument(id) {
      member();
      const { error } = await client.from('documents').delete().eq('id', id);
      if (error) throw error.code === '42501' ? notOwner('Jincheng’s documents') : refusal(error);
    },

    async saveEntry({ id, version, day, body }) {
      member();
      const request = id
        ? client
            .from('diary')
            .update({ day, body })
            .eq('id', id)
            .eq('version', version ?? 0)
            .select(ENTRY_COLUMNS)
            .maybeSingle()
        : client.from('diary').insert({ day, body }).select(ENTRY_COLUMNS).single();
      const { data, error } = await request;
      if (error) throw error.code === '42501' ? notOwner('Jincheng’s diary') : refusal(error);
      if (!data) throw changedElsewhere();
      return entryOf(data);
    },

    async deleteEntry(id) {
      member();
      const { error } = await client.from('diary').delete().eq('id', id);
      if (error) throw error.code === '42501' ? notOwner('Jincheng’s diary') : refusal(error);
    }
  };
}
