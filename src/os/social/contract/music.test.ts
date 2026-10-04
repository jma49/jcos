import { afterEach, describe, expect, test, vi } from 'vitest';
import { backends, OWNER, type Backend } from './backends';

// The iPod's ratings and playlists and DVD Player's shelf, the same on
// both backends: everyone reads them, only the owner changes them, a
// playlist's name is one the iPod doesn't keep for itself, and a disc is
// on the shelf once.

afterEach(() => {
  vi.unstubAllGlobals();
});

const disc = { id: 'dQw4w9WgXcQ', title: 'A video', cover: 'hq2', coverX: 50 };
const discRow = { id: 'dQw4w9WgXcQ', title: 'A video', artist: null, cover: 'hq2', cover_x: 50, duration_ms: null, added_at: '2026-10-02T10:00:00Z' };

describe.each(backends)('music: $name', ({ make }) => {
  let b: Backend;

  test('signed out, nothing changes', async () => {
    b = make();
    await expect(b.social.rateSong('x', 5)).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.savePlaylist('Road', ['x'])).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.burnDisc(disc)).rejects.toMatchObject({ reason: 'signed-out' });
  });

  test('only the owner rates, makes playlists or burns discs', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({
      supabase: (db) => {
        db.refuse('rpc.rate_song', '42501');
        db.refuse('rpc.save_playlist', '42501');
        db.refuse('discs.insert', '42501');
      }
    });
    await expect(b.social.rateSong('x', 5)).rejects.toMatchObject({ reason: 'failed', message: 'Only Jincheng can change the ratings everyone sees.' });
    await expect(b.social.savePlaylist('Road', ['x'])).rejects.toMatchObject({
      reason: 'failed',
      message: 'Only Jincheng can change the playlists everyone sees.'
    });
    await expect(b.social.burnDisc(disc)).rejects.toMatchObject({ reason: 'failed', message: 'Only Jincheng can change the discs everyone sees.' });
  });

  test('a playlist isn’t named as one of the iPod’s own', async () => {
    b = make();
    await b.signUp(OWNER);
    await b.given({ supabase: (db) => db.refuse('rpc.save_playlist', '23514') });
    await expect(b.social.savePlaylist('On-The-Go', ['x'])).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('songs saved into a playlist of the same name, whatever its case, join it', async () => {
    b = make();
    await b.signUp(OWNER);
    await b.given({ supabase: (db) => (db.answer('rpc.save_playlist', { data: 7 }), db.answer('rpc.save_playlist', { data: 7 })) });
    const first = await b.social.savePlaylist('Road', ['a']);
    expect(await b.social.savePlaylist('ROAD', ['b'])).toBe(first);
  });

  test('a disc is on the shelf once', async () => {
    b = make();
    await b.signUp(OWNER);
    await b.given({
      supabase: (db) => {
        db.answer('discs.insert', { data: discRow });
        db.refuse('discs.insert', '23505');
      }
    });
    const burned = await b.social.burnDisc(disc);
    expect(burned).toMatchObject({ id: disc.id, title: 'A video' });
    await expect(b.social.burnDisc(disc)).rejects.toMatchObject({ reason: 'already' });
  });
});
