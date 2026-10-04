import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Account } from '../accounts';
import { LOBBY } from '../chat';
import { socialOver } from '../supabase/index';
import { backends, type Backend } from './backends';
import { fakeSupabase } from './fakeSupabase';

// What the slices share (the context each backend makes once): one
// session for every domain, the usernames already known, and the chat
// channel that starts over when the member changes.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(backends)('one session for every domain: $name', ({ make }) => {
  let b: Backend;

  test('signing in or out reaches every slice at once', async () => {
    b = make();
    await b.signUp('alice');
    await b.given({ supabase: (db) => db.answer('stickies.insert', { data: { id: 's', body: '', color: 'yellow', x: 0, y: 0, width: 220, height: 180, collapsed: false, version: 1, updated_at: '' } }) });
    await expect(b.social.addSticky({})).resolves.toMatchObject({ version: 1 });
    expect(await b.social.notesLeft()).toBeGreaterThan(0);
    await b.social.signOut();
    await expect(b.social.addSticky({})).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.saveEvent({ title: 'x', calendar: 'home', day: '2026-10-02', starts: null, ends: null, notes: '' })).rejects.toMatchObject({
      reason: 'signed-out'
    });
    expect(await b.social.notesLeft()).toBe(0);
  });
});

describe('the Supabase context', () => {
  test('the chat channel starts over when the member changes, before the site hears of it', async () => {
    const db = fakeSupabase();
    const social = socialOver(db.client);
    const stop = social.watchChat({ onMessage: () => {}, onRemove: () => {} });
    expect(db.channels.made).toEqual(['chat-room']);
    // The site's own listener, added after the chat slice's.
    const heard: { account: Account | null; restarted: number }[] = [];
    social.onAccount((account) => heard.push({ account, restarted: db.channels.removed.length }));
    await social.signUp('alice', 'a password');
    expect(db.channels.removed).toEqual(['chat-room']);
    expect(db.channels.made).toEqual(['chat-room', 'chat-room']);
    expect(heard.find((h) => h.account?.username === 'alice')?.restarted).toBe(1);
    // The last watcher gone, the channel goes, and a change of member makes none.
    stop();
    expect(db.channels.removed).toEqual(['chat-room', 'chat-room']);
    await social.signOut();
    expect(db.channels.made).toHaveLength(2);
  });

  test('usernames learnt from a page of messages are known to every slice after', async () => {
    const db = fakeSupabase();
    const social = socialOver(db.client);
    db.answer('chat_messages.select', {
      data: [{ id: 1, room: 'lobby', user_id: 'bob-id', body: 'hi', created_at: '2026-10-02T10:00:00Z', profiles: { username: 'bob' } }]
    });
    await social.listChat(LOBBY.id);
    expect(await social.usernameOf('bob-id')).toBe('bob');
    expect(db.calls.filter((c) => c.target === 'profiles')).toEqual([]);
    // Someone not met yet is asked for once.
    db.answer('profiles.select', { data: { username: 'carol' } });
    expect(await social.usernameOf('carol-id')).toBe('carol');
    expect(await social.usernameOf('carol-id')).toBe('carol');
    expect(db.calls.filter((c) => c.target === 'profiles')).toHaveLength(1);
  });

  test('the limits are asked once a page, and again after the database couldn’t say', async () => {
    const db = fakeSupabase();
    const social = socialOver(db.client);
    db.refuse('rpc.member_limits', 'PGRST202', 'Could not find the function');
    expect(await social.limits()).toBeNull();
    expect(await social.limits()).toEqual({ notesPerDay: 3, stickies: 50, events: 5000, todos: 1000 });
    await social.limits();
    expect(db.calls.filter((c) => c.target === 'member_limits')).toHaveLength(2);
  });
});
