// Jincheng's home folder: the documents (those in Public for anyone, the
// rest for the owner) and the diary. The Supabase side is
// supabase/documents.ts, the stand-in's local/documents.ts; Finder and
// TextEdit use it through files/documents.ts.

/** A folder of Jincheng's home that holds documents (Sites lists Jincheng's sites instead). */
export type HomeFolder = 'desktop' | 'documents' | 'downloads' | 'library' | 'movies' | 'music' | 'pictures' | 'public';

/** One of Jincheng's documents. */
export interface HomeDocument {
  id: string;
  folder: HomeFolder;
  /** With its extension: "Things to remember.txt". */
  name: string;
  body: string;
  /** Counts saves: a save names the version it was made from. */
  version: number;
  /** When it was first saved (ISO 8601): from then on, Time Machine shows it. */
  created: string;
  /** When it was last saved (ISO 8601). */
  updated: string;
}

/** A document as it's saved: `id` and `version` for one that's there. */
export type DocumentDraft = Pick<HomeDocument, 'folder' | 'name' | 'body'> & { id?: string; version?: number };

/** An entry in Jincheng's diary. */
export interface DiaryEntry {
  id: string;
  /** The day it's about (YYYY-MM-DD), in the writer's own time zone. */
  day: string;
  body: string;
  version: number;
  /** When it was written (ISO 8601), which orders a day's entries. */
  created: string;
  updated: string;
}

export type EntryDraft = Pick<DiaryEntry, 'day' | 'body'> & { id?: string; version?: number };

/** Jincheng's home folder, as far as the reader may see it. */
export interface Home {
  documents: HomeDocument[];
  /** Empty for anyone but the owner. */
  diary: DiaryEntry[];
}

export interface DocumentsSocial {
  /**
   * Jincheng's home folder: the documents anyone may read (those in
   * Public) and, for the owner, the rest and the diary.
   */
  home: (owner: boolean) => Promise<Home>;
  /**
   * Writes one of Jincheng's documents: a new one without an `id`, else a
   * save made from `version`, refused ('conflict') if it has been saved or
   * thrown away since. Only the owner may.
   */
  saveDocument: (doc: DocumentDraft) => Promise<HomeDocument>;
  /** Throws one of Jincheng's documents away. Only the owner may. */
  deleteDocument: (id: string) => Promise<void>;
  /** Writes an entry in Jincheng's diary, as saveDocument does a document. */
  saveEntry: (entry: EntryDraft) => Promise<DiaryEntry>;
  /** Takes an entry out of the diary. */
  deleteEntry: (id: string) => Promise<void>;
}
