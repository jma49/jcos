import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Listening } from '../social/types';

// The iPod's playlists (playlists.ts): the smart playlists made from
// Jincheng's ratings and plays, rating on Now Playing, plays counted only
// for Jincheng, Jincheng's own playlists, and a visitor's On-The-Go in
// storage shared with their other tabs.

const backend = vi.hoisted(() => ({
  social: null as null | Record<string, (...args: never[]) => unknown>,
  owner: false,
  account: null as null | { id: string }
}));
vi.mock('../social/social', () => ({ getSocial: async () => backend.social }));
vi.mock('../social/owner', () => ({ ownerAnswer: async () => backend.owner }));
vi.mock('../social/account', () => ({ useAccount: { getState: () => ({ account: backend.account }) } }));
vi.mock('./library', () => {
  const SONGS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD', 'EEEEEEEEEEE'].map((id, i) => ({ id, title: `Song ${i}`, artist: 'A' }));
  return { SONGS, fromLibrary: (build: () => unknown) => () => build() };
});

const [A, B, C, D, E] = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD', 'EEEEEEEEEEE'];

const stored = new Map<string, string>();
/** Another tab's change to storage: what the browser tells this tab. */
let storageListener: ((e: { key: string | null }) => void) | null = null;

/** A backend that answers with `listening`, and records what's asked of it. */
function database(listening: Listening = { stats: {}, playlists: [] }) {
  const calls: unknown[][] = [];
  const social = {
    listening: vi.fn(async () => structuredClone(listening)),
    rateSong: vi.fn(async (...args: unknown[]) => void calls.push(['rate', ...args])),
    songPlayed: vi.fn(async (...args: unknown[]) => void calls.push(['played', ...args])),
    savePlaylist: vi.fn(async (name: string, songs: string[]) => {
      calls.push(['save', name, songs]);
      return listening.playlists.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ?? 99;
    }),
    unlistSong: vi.fn(async (...args: unknown[]) => void calls.push(['unlist', ...args])),
    deletePlaylist: vi.fn(async (...args: unknown[]) => void calls.push(['delete', ...args]))
  };
  backend.social = social as never;
  return { social, calls };
}

const load = async () => {
  vi.resetModules();
  return import('./playlists');
};

beforeEach(() => {
  stored.clear();
  storageListener = null;
  backend.social = null;
  backend.owner = false;
  backend.account = null;
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key)
    },
    addEventListener: (type: string, listener: (e: { key: string | null }) => void) => {
      if (type === 'storage') storageListener = listener;
    },
    removeEventListener: () => {}
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

describe('the smart playlists', () => {
  test('My Top Rated is four stars and up, the best first, then in the library’s order', async () => {
    database({ stats: { [A]: { rating: 4, plays: 0 }, [B]: { rating: 5, plays: 0 }, [C]: { rating: 3, plays: 9 }, [D]: { rating: 4, plays: 0 } }, playlists: [] });
    const p = await load();
    await p.readListening();
    expect(p.topRated()).toEqual([1, 0, 3]);
  });

  test('Recently Played is the last two weeks, the latest first', async () => {
    database({ stats: { [A]: { plays: 1, played: ago(1) }, [B]: { plays: 1, played: ago(20) }, [C]: { plays: 3, played: ago(0.1) } }, playlists: [] });
    const p = await load();
    await p.readListening();
    expect(p.recentlyPlayed()).toEqual([2, 0]);
  });

  test('Top 25 Most Played is the most plays first, the latest among equals', async () => {
    database({
      stats: { [A]: { plays: 2, played: ago(3) }, [B]: { plays: 7, played: ago(30) }, [C]: { plays: 2, played: ago(1) }, [E]: { rating: 5, plays: 0 } },
      playlists: []
    });
    const p = await load();
    await p.readListening();
    expect(p.mostPlayed()).toEqual([1, 2, 0]);
  });
});

describe('reading', () => {
  test('is at most every thirty seconds', async () => {
    const { social } = database();
    const p = await load();
    await p.readListening();
    await p.readListening();
    expect(social.listening).toHaveBeenCalledTimes(1);
  });

  test('a read that started before a change is dropped', async () => {
    database({ stats: {}, playlists: [{ id: 1, name: 'Rainy Days', songs: [A, B] }] });
    backend.account = { id: 'jincheng' };
    const p = await load();
    await p.readListening();
    await vi.waitFor(() => expect(p.playlists()).toHaveLength(1));
    // The read that follows answers from before the song came out.
    const reading = p.readListening();
    await p.unlist(1, A);
    await reading;
    expect(p.playlists()[0].songs).toEqual([B]);
  });

  test('without a database, there’s nothing, and nothing breaks', async () => {
    const p = await load();
    await p.readListening();
    expect(p.playlists()).toEqual([]);
    expect(p.ratingOf(A)).toBe(0);
  });
});

describe('rating', () => {
  test('shows at once, and saves once the wheel rests', async () => {
    vi.useFakeTimers();
    const { calls } = database();
    const p = await load();
    p.rate(A, 1);
    p.rate(A, 2);
    p.rate(A, 3);
    expect(p.ratingOf(A)).toBe(3);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(p.SAVE_RATING_AFTER_MS);
    expect(calls).toEqual([['rate', A, 3]]);
  });

  test('stays between none and five stars', async () => {
    vi.useFakeTimers();
    database();
    const p = await load();
    p.rate(A, 7);
    expect(p.ratingOf(A)).toBe(5);
    p.rate(A, -2);
    expect(p.ratingOf(A)).toBe(0);
    expect(p.statsOf(A)).toEqual({ plays: 0 });
  });

  test('a rating the database refuses goes back to what it has, and is said', async () => {
    vi.useFakeTimers();
    const { social } = database({ stats: { [A]: { rating: 2, plays: 4 } }, playlists: [] });
    const p = await load();
    await p.readListening();
    social.rateSong.mockRejectedValueOnce(new Error('Only Jincheng can change the ratings everyone sees.'));
    p.rate(A, 5);
    await vi.advanceTimersByTimeAsync(p.SAVE_RATING_AFTER_MS);
    expect(p.ratingOf(A)).toBe(2);
    expect(p.statsOf(A).plays).toBe(4);
    expect(p.ratingRefused()?.id).toBe(A);
  });

  test('ratings save in order, and a read doesn’t undo one waiting to be saved', async () => {
    vi.useFakeTimers();
    const { social, calls } = database();
    const p = await load();
    let answer = () => {};
    social.rateSong.mockImplementationOnce(async (...args: unknown[]) => {
      await new Promise<void>((resolve) => (answer = resolve));
      calls.push(['rate', ...args]);
    });
    p.rate(A, 3);
    await vi.advanceTimersByTimeAsync(p.SAVE_RATING_AFTER_MS);
    // Rated again while the first is still saving.
    p.rate(A, 4);
    await vi.advanceTimersByTimeAsync(p.SAVE_RATING_AFTER_MS);
    await p.readListening();
    expect(p.ratingOf(A)).toBe(4);
    answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([
      ['rate', A, 3],
      ['rate', A, 4]
    ]);
    expect(p.ratingOf(A)).toBe(4);
  });
});

describe('plays', () => {
  test('count for Jincheng, when the song was listened to the end', async () => {
    const { calls } = database({ stats: { [A]: { rating: 5, plays: 1 } }, playlists: [] });
    backend.account = { id: 'jincheng' };
    backend.owner = true;
    const p = await load();
    await p.readListening();
    await p.countPlay(A);
    expect(calls).toEqual([['played', A]]);
    expect(p.statsOf(A)).toMatchObject({ rating: 5, plays: 2 });
    expect(Date.now() - Date.parse(p.statsOf(A).played!)).toBeLessThan(1000);
  });

  test('don’t count for anyone else, or when the database refuses', async () => {
    const { social, calls } = database();
    const p = await load();
    await p.countPlay(A);
    backend.account = { id: 'someone' };
    await p.countPlay(A);
    expect(calls).toEqual([]);
    backend.owner = true;
    social.songPlayed.mockRejectedValueOnce(new Error('offline'));
    await p.countPlay(A);
    expect(p.statsOf(A).plays).toBe(0);
  });
});

describe('Jincheng’s playlists', () => {
  test('are listed by name', async () => {
    database({
      stats: {},
      playlists: [
        { id: 1, name: 'While Coding', songs: [A] },
        { id: 2, name: 'Rainy Days', songs: [B] }
      ]
    });
    const p = await load();
    await p.readListening();
    expect(p.playlists().map((l) => l.name)).toEqual(['Rainy Days', 'While Coding']);
  });

  test('a new one is named as an iPod names a saved On-The-Go', async () => {
    database({ stats: {}, playlists: [{ id: 1, name: 'New Playlist 1', songs: [] }] });
    const p = await load();
    expect(p.newPlaylistName()).toBe('New Playlist 1');
    await p.readListening();
    expect(p.newPlaylistName()).toBe('New Playlist 2');
  });

  test('saving On-The-Go into one that’s there adds its songs after, each once, and empties On-The-Go', async () => {
    const { calls } = database({ stats: {}, playlists: [{ id: 7, name: 'Rainy Days', songs: [A, B] }] });
    const p = await load();
    await p.readListening();
    p.addToGo([B, C]);
    const saved = await p.saveOnTheGo('  rainy days ');
    expect(calls).toEqual([['save', 'rainy days', [B, C]]]);
    expect(saved).toEqual({ id: 7, name: 'Rainy Days', songs: [A, B, C] });
    expect(p.onTheGo()).toEqual([]);
  });

  test('saving refuses a name that won’t do, and keeps On-The-Go when it fails', async () => {
    const { social, calls } = database();
    const p = await load();
    p.addToGo([A]);
    await expect(p.saveOnTheGo('on-the-go')).rejects.toThrow('On-The-Go is one of the iPod’s own playlists.');
    await expect(p.saveOnTheGo('   ')).rejects.toThrow(/name/);
    expect(calls).toEqual([]);
    social.savePlaylist.mockRejectedValueOnce(new Error('There are 50 playlists already. Delete one first.'));
    await expect(p.saveOnTheGo('Rainy Days')).rejects.toThrow(/50 playlists/);
    expect(p.onTheGo()).toEqual([A]);
  });

  test('a song taken out comes back where it was if the database refuses', async () => {
    const { social } = database({ stats: {}, playlists: [{ id: 1, name: 'Rainy Days', songs: [A, B, C] }] });
    const p = await load();
    await p.readListening();
    social.unlistSong.mockRejectedValueOnce(new Error('offline'));
    const out = p.unlist(1, B);
    expect(p.playlists()[0].songs).toEqual([A, C]);
    await expect(out).rejects.toThrow('offline');
    expect(p.playlists()[0].songs).toEqual([A, B, C]);
  });

  test('a deleted one is gone', async () => {
    const { calls } = database({ stats: {}, playlists: [{ id: 1, name: 'Rainy Days', songs: [A] }] });
    const p = await load();
    await p.readListening();
    await p.deletePlaylist(1);
    expect(calls).toEqual([['delete', 1]]);
    expect(p.playlists()).toEqual([]);
  });
});

describe('On-The-Go', () => {
  test('adds songs at the end, each once', async () => {
    const p = await load();
    p.addToGo([A, B]);
    p.addToGo([B, C, A]);
    expect(p.onTheGo()).toEqual([A, B, C]);
    expect(p.indexesOf(p.onTheGo())).toEqual([0, 1, 2]);
  });

  test('takes one off, and clears', async () => {
    const p = await load();
    p.addToGo([A, B, C]);
    p.takeOffGo(B);
    expect(p.onTheGo()).toEqual([A, C]);
    p.clearOnTheGo();
    expect(p.onTheGo()).toEqual([]);
  });

  test('keeps a song another tab added meanwhile, and hears of that tab’s changes', async () => {
    const p = await load();
    p.addToGo([A]);
    stored.set('os-ipod-on-the-go', JSON.stringify([A, D]));
    p.addToGo([B]);
    expect(p.onTheGo()).toEqual([A, D, B]);
    stored.set('os-ipod-on-the-go', JSON.stringify([C]));
    storageListener?.({ key: 'os-ipod-on-the-go' });
    expect(p.onTheGo()).toEqual([C]);
  });

  test('keeps only song ids, and the latest GO_MOST', async () => {
    stored.set('os-ipod-on-the-go', JSON.stringify([A, 'nope', 42, A, B]));
    const p = await load();
    expect(p.onTheGo()).toEqual([A, B]);
    p.addToGo(Array.from({ length: p.GO_MOST }, (_, i) => `x${String(i).padStart(10, '0')}`));
    // The two that were there first are the two that go.
    expect(p.onTheGo()).toHaveLength(p.GO_MOST);
    expect(p.onTheGo()[0]).toBe('x0000000000');
    expect(p.onTheGo()).not.toContain(A);
  });

  test('leaves out songs no longer in the library', async () => {
    const p = await load();
    p.addToGo(['ZZZZZZZZZZZ', C]);
    expect(p.indexesOf(p.onTheGo())).toEqual([2]);
  });
});
