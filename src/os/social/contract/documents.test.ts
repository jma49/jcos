import { afterEach, describe, expect, test, vi } from 'vitest';
import { backends, OWNER, type Backend } from './backends';

// Jincheng's home folder, the same on both backends: only the owner
// writes, anyone else reads Public alone, a name is unique in its folder,
// and a save from an older copy is refused.

afterEach(() => {
  vi.unstubAllGlobals();
});

const docRow = (id: string, folder: string, name: string, version = 1, body = '') => ({
  id,
  folder,
  name,
  body,
  version,
  created_at: '2026-10-02T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z'
});

describe.each(backends)('documents: $name', ({ make }) => {
  let b: Backend;

  test('only the owner writes', async () => {
    b = make();
    await expect(b.social.saveDocument({ folder: 'public', name: 'Hi.txt', body: '' })).rejects.toMatchObject({ reason: 'signed-out' });
    await b.signUp('alice');
    await b.given({
      supabase: (db) => {
        db.refuse('documents.insert', '42501');
        db.refuse('diary.insert', '42501');
      }
    });
    await expect(b.social.saveDocument({ folder: 'public', name: 'Hi.txt', body: '' })).rejects.toMatchObject({
      reason: 'failed',
      message: 'Only Jincheng can change Jincheng’s documents.'
    });
    await expect(b.social.saveEntry({ day: '2026-10-02', body: 'Dear diary' })).rejects.toMatchObject({
      reason: 'failed',
      message: 'Only Jincheng can change Jincheng’s diary.'
    });
  });

  test('anyone else reads Public alone, and no diary', async () => {
    b = make();
    await b.signUp(OWNER);
    await b.given({
      supabase: (db) => {
        db.answer('documents.insert', { data: docRow('p', 'public', 'Hello.txt') });
        db.answer('documents.insert', { data: docRow('d', 'documents', 'Secret.txt') });
      }
    });
    await b.social.saveDocument({ folder: 'public', name: 'Hello.txt', body: '' });
    await b.social.saveDocument({ folder: 'documents', name: 'Secret.txt', body: '' });
    await b.social.signOut();
    await b.signUp('alice');
    // Row-level security gives alice the one in Public.
    await b.given({ supabase: (db) => db.answer('documents.select', { data: [docRow('p', 'public', 'Hello.txt')] }) });
    const home = await b.social.home(true);
    expect(home.documents.map((d) => d.name)).toEqual(['Hello.txt']);
    expect(home.diary).toEqual([]);
  });

  test('a name is unique in its folder, whatever its case', async () => {
    b = make();
    await b.signUp(OWNER);
    await b.given({
      supabase: (db) => {
        db.answer('documents.insert', { data: docRow('a', 'documents', 'Notes.txt') });
        db.refuse('documents.insert', '23505');
      }
    });
    await b.social.saveDocument({ folder: 'documents', name: 'Notes.txt', body: '' });
    await expect(b.social.saveDocument({ folder: 'documents', name: 'NOTES.txt', body: '' })).rejects.toMatchObject({ reason: 'already' });
  });

  test('a save names the version it was made from; one from an older copy is refused', async () => {
    b = make();
    await b.signUp(OWNER);
    await b.given({ supabase: (db) => db.answer('documents.insert', { data: docRow('a', 'documents', 'Notes.txt') }) });
    const made = await b.social.saveDocument({ folder: 'documents', name: 'Notes.txt', body: '' });
    await b.given({ supabase: (db) => db.answer('documents.update', { data: docRow(made.id, 'documents', 'Notes.txt', 2, 'one') }) });
    const saved = await b.social.saveDocument({ id: made.id, version: 1, folder: 'documents', name: 'Notes.txt', body: 'one' });
    expect([saved.body, saved.version]).toEqual(['one', 2]);
    if (b.db) expect(b.db.last('documents')?.filters).toContainEqual(['eq', 'version', 1]);
    await expect(b.social.saveDocument({ id: made.id, version: 1, folder: 'documents', name: 'Notes.txt', body: 'stale' })).rejects.toMatchObject({
      reason: 'conflict'
    });
  });
});
