import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Account } from '../accounts';
import { backends, OWNER, type Backend } from './backends';

// Accounts, the same on both backends (backends.ts): what a username and
// a password must be, a name taken once, who's signed in and who's told,
// and the owner.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(backends)('accounts: $name', ({ make }) => {
  let b: Backend;
  const fresh = () => (b = make());

  test('a username is 3 to 20 letters, digits or underscores, and a password at least six characters', async () => {
    fresh();
    await expect(b.social.signUp('al', 'a password')).rejects.toMatchObject({ reason: 'invalid' });
    await expect(b.social.signUp('al-ice', 'a password')).rejects.toMatchObject({ reason: 'invalid' });
    await expect(b.social.signUp('alice', 'short')).rejects.toMatchObject({ reason: 'invalid' });
    expect(b.social.account()).toBeNull();
  });

  test('signing up signs in, as the lower-case name, and tells whoever listens', async () => {
    fresh();
    const heard: (Account | null)[] = [];
    b.social.onAccount((account) => heard.push(account));
    const alice = await b.social.signUp('  Alice ', 'a password');
    expect(alice.username).toBe('alice');
    expect(b.social.account()).toEqual(alice);
    await b.social.signOut();
    expect(b.social.account()).toBeNull();
    await vi.waitFor(() => expect(heard.at(-1)).toBeNull());
    expect(heard).toContainEqual(alice);
  });

  test('a username is taken once, whatever its case', async () => {
    fresh();
    await b.signUp('alice');
    await b.social.signOut();
    expect(await b.social.usernameAvailable('ALICE')).toBe(false);
    expect(await b.social.usernameAvailable('bob')).toBe(true);
    await expect(b.social.signUp('Alice', 'another password')).rejects.toMatchObject({ reason: 'taken' });
  });

  test('a wrong password is refused, and the right one signs in', async () => {
    fresh();
    await b.signUp('alice');
    await b.social.signOut();
    await expect(b.social.signIn('alice', 'not it at all')).rejects.toMatchObject({ reason: 'credentials' });
    expect(b.social.account()).toBeNull();
    expect((await b.social.signIn('Alice', 'a password')).username).toBe('alice');
  });

  test('the recovery address is a member’s alone', async () => {
    fresh();
    await expect(b.social.recoveryEmail()).rejects.toMatchObject({ reason: 'signed-out' });
    await expect(b.social.setRecoveryEmail('a@example.com')).rejects.toMatchObject({ reason: 'signed-out' });
    await b.signUp('alice');
    await b.given({ supabase: (db) => db.refuse('rpc.set_recovery_email', '23514') });
    await expect(b.social.setRecoveryEmail('not an address')).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('only the owner is the owner, and nobody signed out', async () => {
    fresh();
    expect(await b.social.isOwner()).toBe(false);
    await b.signUp('alice');
    expect(await b.social.isOwner()).toBe(false);
    await b.social.signOut();
    await b.signUp(OWNER);
    expect(await b.social.isOwner()).toBe(true);
  });
});
