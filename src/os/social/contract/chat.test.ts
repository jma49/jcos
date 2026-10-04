import { afterEach, describe, expect, test, vi } from 'vitest';
import { dmRoom, LOBBY } from '../chat';
import { backends, type Backend } from './backends';

// Chat, the same on both backends: members write, a private conversation
// is its two members' alone, and a room reads oldest first.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(backends)('chat: $name', ({ make }) => {
  let b: Backend;

  test('the Lobby is the first room', async () => {
    b = make();
    await b.given({ supabase: (db) => db.answer('chat_rooms.select', { data: [LOBBY, { id: 'music', name: 'Music', topic: '' }] }) });
    expect((await b.social.listRooms())[0]).toEqual(LOBBY);
  });

  test('signed out, nothing is sent or taken down', async () => {
    b = make();
    await expect(b.social.sendChat(LOBBY.id, 'hi')).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.deleteChat('1')).rejects.toMatchObject({ reason: 'signed-out' });
  });

  test('a private conversation is written only by its two members', async () => {
    b = make();
    const alice = await b.signUp('alice');
    await b.social.signOut();
    const bob = await b.signUp('bob');
    await b.social.signOut();
    await b.signUp('carol');
    await b.given({ supabase: (db) => db.refuse('chat_messages.insert', '42501') });
    await expect(b.social.sendChat(dmRoom(alice.id, bob.id), 'psst')).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('a room reads oldest first, its messages signed with their usernames', async () => {
    b = make();
    vi.useFakeTimers({ toFake: ['Date'] });
    const alice = await b.signUp('alice');
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    await b.social.sendChat(LOBBY.id, 'one');
    vi.setSystemTime(new Date('2026-10-02T10:00:01Z'));
    await b.social.sendChat(LOBBY.id, ' two ');
    vi.useRealTimers();
    await b.given({
      // The database answers newest first, as listChat asks.
      supabase: (db) =>
        db.answer('chat_messages.select', {
          data: [
            { id: 2, room: 'lobby', user_id: alice.id, body: 'two', created_at: '2026-10-02T10:00:01Z', profiles: { username: 'alice' } },
            { id: 1, room: 'lobby', user_id: alice.id, body: 'one', created_at: '2026-10-02T10:00:00Z', profiles: { username: 'alice' } }
          ]
        })
    });
    const messages = await b.social.listChat(LOBBY.id);
    expect(messages.map((m) => [m.body, m.username, m.room])).toEqual([
      ['one', 'alice', 'lobby'],
      ['two', 'alice', 'lobby']
    ]);
    expect(await b.social.usernameOf(alice.id)).toBe('alice');
    if (b.db) expect(b.db.calls.find((c) => c.target === 'chat_messages' && c.op === 'insert' && (c.payload as { body: string }).body === 'two')).toBeTruthy();
  });

  test('a member found by name, whatever its case', async () => {
    b = make();
    const alice = await b.signUp('alice');
    await b.given({ supabase: (db) => db.answer('profiles.select', { data: { id: alice.id, username: 'alice' } }) });
    expect(await b.social.findMember(' ALICE ')).toEqual({ id: alice.id, username: 'alice' });
    if (b.db) expect(b.db.last('profiles')?.filters).toEqual([['eq', 'username', 'alice']]);
  });
});
