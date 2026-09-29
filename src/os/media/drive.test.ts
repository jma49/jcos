import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShelfDisc } from './discs';

// The drive (drive.ts): a disc slides in and DVD Player opens; the disc
// already in the drive isn't put in again, so what's playing plays on;
// while one slides in, a second double-click changes nothing and a
// different disc goes in after it.

const calls = vi.hoisted(() => ({
  slides: [] as { id: string; done: () => void }[],
  out: [] as string[],
  launched: [] as { app: string; origin: boolean }[]
}));

vi.mock('./insertion', () => ({
  slideIn: (disc: { id: string }) =>
    new Promise((resolve) => calls.slides.push({ id: disc.id, done: () => resolve({ x: 1274, y: 300, width: 6, height: 200 }) })),
  slideOut: async (disc: { id: string }) => void calls.out.push(disc.id),
  bounce: () => {}
}));
vi.mock('../core/registry', () => ({
  launch: (app: string, options?: { origin?: unknown }) => void calls.launched.push({ app, origin: !!options?.origin })
}));

const disc = (id: string): ShelfDisc => ({ id, title: id, cover: 'maxresdefault', coverX: 50, added: '2026-09-29T08:00:00.000Z' });

const load = async () => {
  vi.resetModules();
  return import('./drive');
};

/** Lets whatever the slides finishing set going run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Finishes the slide going on now. */
const land = async () => {
  calls.slides.at(-1)?.done();
  await settle();
};

beforeEach(() => {
  calls.slides.length = 0;
  calls.out.length = 0;
  calls.launched.length = 0;
});

describe('putting a disc in', () => {
  test('slides it in, then it’s in the drive and DVD Player opens from the slot', async () => {
    const { insertDisc, useDrive } = await load();
    void insertDisc(disc('A'));
    expect(useDrive.getState().disc).toBeNull();
    await land();
    expect(useDrive.getState()).toMatchObject({ disc: { id: 'A' }, inserted: 1 });
    expect(calls.launched).toEqual([{ app: 'dvdplayer', origin: true }]);
  });

  test('the disc already in the drive isn’t put in again: DVD Player comes forward and it plays on', async () => {
    const { insertDisc, useDrive } = await load();
    void insertDisc(disc('A'));
    await land();
    await insertDisc(disc('A'));
    expect(calls.slides).toHaveLength(1);
    expect(useDrive.getState().inserted).toBe(1);
    expect(calls.launched.at(-1)).toEqual({ app: 'dvdplayer', origin: false });
  });

  test('a second double-click while it slides in changes nothing', async () => {
    const { insertDisc, useDrive } = await load();
    void insertDisc(disc('A'));
    void insertDisc(disc('A'));
    await land();
    expect(calls.slides.map((s) => s.id)).toEqual(['A']);
    expect(useDrive.getState().inserted).toBe(1);
  });

  test('a different disc asked for while one slides in goes in after it, the last asked for', async () => {
    const { insertDisc, useDrive } = await load();
    void insertDisc(disc('A'));
    void insertDisc(disc('B'));
    void insertDisc(disc('C'));
    await land();
    expect(useDrive.getState().disc?.id).toBe('A');
    expect(calls.slides.map((s) => s.id)).toEqual(['A', 'C']);
    await land();
    expect(useDrive.getState()).toMatchObject({ disc: { id: 'C' }, inserted: 2 });
  });

  test('asking again for the disc sliding in drops one asked for in between', async () => {
    const { insertDisc } = await load();
    void insertDisc(disc('A'));
    void insertDisc(disc('B'));
    void insertDisc(disc('A'));
    await land();
    expect(calls.slides.map((s) => s.id)).toEqual(['A']);
  });

  test('once ejected, the same disc goes in again, from its menu', async () => {
    const { ejectDisc, insertDisc, useDrive } = await load();
    void insertDisc(disc('A'));
    await land();
    ejectDisc();
    expect(useDrive.getState().disc).toBeNull();
    expect(calls.out).toEqual(['A']);
    void insertDisc(disc('A'));
    await land();
    expect(useDrive.getState()).toMatchObject({ disc: { id: 'A' }, inserted: 2 });
  });

  test('ejecting an empty drive does nothing', async () => {
    const { ejectDisc } = await load();
    ejectDisc();
    expect(calls.out).toEqual([]);
  });
});

describe('the same disc', () => {
  test('is the same video from the same shelf: a visitor’s DVD-R of Jincheng’s video is another disc', async () => {
    const { insertDisc, sameDisc, useDrive } = await load();
    expect(sameDisc(disc('A'), disc('A'))).toBe(true);
    expect(sameDisc(disc('A'), { ...disc('A'), burnedHere: true })).toBe(false);
    void insertDisc(disc('A'));
    await land();
    void insertDisc({ ...disc('A'), burnedHere: true });
    await land();
    expect(useDrive.getState()).toMatchObject({ disc: { id: 'A', burnedHere: true }, inserted: 2 });
  });
});
