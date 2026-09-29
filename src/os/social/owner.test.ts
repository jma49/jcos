import { beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  social: null as null | { account: () => { id: string } | null; isOwner: () => Promise<boolean> }
}));
vi.mock('./social', () => ({ getSocial: () => Promise.resolve(backend.social) }));

let signedIn: string | null;
const isOwner = vi.fn<() => Promise<boolean>>();

beforeEach(() => {
  vi.resetModules();
  isOwner.mockReset();
  signedIn = 'a';
  backend.social = { account: () => (signedIn ? { id: signedIn } : null), isOwner };
});

const load = async () => (await import('./owner')).ownerAnswer;

describe('ownerAnswer', () => {
  it('asks once per account', async () => {
    const ownerAnswer = await load();
    isOwner.mockResolvedValue(true);
    expect(await ownerAnswer('a')).toBe(true);
    expect(await ownerAnswer('a')).toBe(true);
    expect(isOwner).toHaveBeenCalledTimes(1);
  });

  it('asks again when someone else signs in', async () => {
    const ownerAnswer = await load();
    isOwner.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await ownerAnswer('a')).toBe(true);
    signedIn = 'b';
    expect(await ownerAnswer('b')).toBe(false);
    expect(isOwner).toHaveBeenCalledTimes(2);
  });

  it('answers no to a failure, and asks again next time', async () => {
    const ownerAnswer = await load();
    isOwner.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(true);
    expect(await ownerAnswer('a')).toBe(false);
    expect(await ownerAnswer('a')).toBe(true);
  });

  it('doesn’t answer for an account that has since signed out', async () => {
    const ownerAnswer = await load();
    signedIn = null;
    expect(await ownerAnswer('a')).toBe(false);
    expect(isOwner).not.toHaveBeenCalled();
  });

  it('says no without a backend', async () => {
    const ownerAnswer = await load();
    backend.social = null;
    expect(await ownerAnswer('a')).toBe(false);
  });
});
