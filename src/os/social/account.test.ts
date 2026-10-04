import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from './types';

// startAccount() knows a visitor without a session at once, without the
// backend (docs/decisions/0009), and loads it at the start for a member.

const backend = vi.hoisted(() => ({
  stored: false,
  loads: 0,
  pending: null as Promise<unknown> | null,
  loaded: [] as ((social: unknown) => void)[],
  signedIn: null as Account | null
}));

vi.mock('./social', () => {
  const social = { onAccount: (callback: (account: Account | null) => void) => callback(backend.signedIn) };
  return {
    HAS_BACKEND: true,
    SESSION_KEY: 'os-auth',
    hasStoredSession: () => backend.stored,
    getSocial: () => {
      if (!backend.pending) {
        backend.loads++;
        backend.pending = Promise.resolve(social);
        for (const callback of backend.loaded.splice(0)) void backend.pending.then(callback);
      }
      return backend.pending;
    },
    onSocial: (callback: (social: unknown) => void) => backend.loaded.push(callback)
  };
});

beforeEach(() => {
  vi.resetModules();
  Object.assign(backend, { stored: false, loads: 0, pending: null, loaded: [], signedIn: null });
});

const start = async () => {
  const { startAccount, useAccount } = await import('./account');
  startAccount();
  return useAccount;
};

describe('startAccount', () => {
  it('knows a visitor without a session at once, without loading the backend', async () => {
    const account = await start();
    expect(account.getState()).toEqual({ account: null, available: true, ready: true });
    expect(backend.loads).toBe(0);
  });

  it('connects once anything else loads the backend', async () => {
    const account = await start();
    backend.signedIn = { id: '1', username: 'jincheng' };
    const { getSocial } = await import('./social');
    await getSocial();
    await Promise.resolve();
    expect(account.getState().account).toEqual({ id: '1', username: 'jincheng' });
  });

  it('loads the backend at the start for a stored session, offering nothing until it is read', async () => {
    backend.stored = true;
    backend.signedIn = { id: '1', username: 'jincheng' };
    const { startAccount, useAccount: account } = await import('./account');
    startAccount();
    expect(backend.loads).toBe(1);
    expect(account.getState()).toEqual({ account: null, available: false, ready: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(account.getState()).toEqual({ account: { id: '1', username: 'jincheng' }, available: true, ready: true });
  });
});
