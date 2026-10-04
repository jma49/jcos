import { afterEach, describe, expect, test, vi } from 'vitest';
import { backends, type Backend } from './backends';

// Soapbox's reactions, the same on both backends: someone signed out gets
// one per post, a member can change theirs or take it back.

afterEach(() => {
  vi.unstubAllGlobals();
});

// One of the stand-in's sample posts; the fake database holds whichever a test names.
const POST = 'sample-1';

describe.each(backends)('soapbox: $name', ({ make }) => {
  let b: Backend;

  test('signed out, one reaction a post, and none taken back', async () => {
    b = make();
    await b.social.react(POST, '🔥');
    await b.given({ supabase: (db) => db.refuse('soapbox_reactions.insert', '23505') });
    await expect(b.social.react(POST, '👍')).rejects.toMatchObject({ reason: 'already' });
    await expect(b.social.react(POST, null)).rejects.toMatchObject({ reason: 'signed-out' });
    expect(await b.social.myReactions()).toEqual({});
  });

  test('a member changes their reaction, or takes it back', async () => {
    b = make();
    await b.signUp('alice');
    await b.social.react(POST, '🔥');
    // The database has their row already: the insert is refused, and the slice changes it.
    await b.given({ supabase: (db) => db.refuse('soapbox_reactions.insert', '23505') });
    await b.social.react(POST, '😂');
    await b.given({ supabase: (db) => db.answer('rpc.my_reactions', { data: [{ post_id: POST, emoji: '😂' }] }) });
    expect(await b.social.myReactions()).toEqual({ [POST]: '😂' });
    if (b.db) expect(b.db.last('soapbox_reactions')).toMatchObject({ op: 'update', payload: { emoji: '😂' } });
    await b.social.react(POST, null);
    if (b.db) expect(b.db.last('soapbox_reactions')).toMatchObject({ op: 'delete', filters: [['eq', 'post_id', POST]] });
    await b.given({ supabase: (db) => db.answer('rpc.my_reactions', { data: [] }) });
    expect(await b.social.myReactions()).toEqual({});
  });
});
