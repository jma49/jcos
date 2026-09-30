import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// DVD Player's shelf (discs.ts): chapters, pictures, what a stored or
// burned disc may be, a visitor's own DVD-Rs in storage shared with their
// other tabs, and reading a YouTube link.

const stored = new Map<string, string>();
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
  removeItem: (key: string) => void stored.delete(key)
};

const load = async () => {
  vi.resetModules();
  return import('./discs');
};

beforeEach(() => {
  stored.clear();
  vi.stubGlobal('window', { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const DISC = { id: 'jWQx2f-CErU', title: 'Whiplash', artist: 'aespa', cover: 'maxresdefault', coverX: 40, added: '2026-09-29T08:00:00.000Z' };

describe('chapters', () => {
  test('a video is four chapters of equal length', async () => {
    const { chapterStart } = await load();
    expect([0, 1, 2, 3].map((n) => chapterStart(n, 200))).toEqual([0, 50, 100, 150]);
    expect(chapterStart(7, 200)).toBe(150);
    expect(chapterStart(-1, 200)).toBe(0);
  });

  test('the chapter playing, and the first until the length is known', async () => {
    const { chapterAt } = await load();
    expect([0, 49.9, 50, 120, 199, 250].map((t) => chapterAt(t, 200))).toEqual([0, 0, 1, 2, 3, 3]);
    expect(chapterAt(120, 0)).toBe(0);
  });
});

describe('pictures', () => {
  test('are the video’s own, on YouTube’s image host', async () => {
    const { pictureOf, chapterPictures } = await load();
    expect(pictureOf('jWQx2f-CErU', 'hq2')).toBe('https://i.ytimg.com/vi/jWQx2f-CErU/hq2.jpg');
    expect(chapterPictures('jWQx2f-CErU').map((src) => src.split('/').pop())).toEqual(['hqdefault.jpg', 'hq1.jpg', 'hq2.jpg', 'hq3.jpg']);
  });

  test('4:3 ones are zoomed past their black bars', async () => {
    const { zoomOf } = await load();
    expect(['hqdefault', 'sd2', 'maxresdefault', 'mq1'].map(zoomOf)).toEqual([4 / 3, 4 / 3, 1, 1]);
  });

  test('Burn offers each full size where YouTube made it, else the size every video has', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe('HEAD');
      return new Response(null, { status: /maxres(default|2)\.jpg$/.test(url) ? 200 : 404 });
    }));
    const { coverChoices } = await load();
    expect(await coverChoices('jWQx2f-CErU')).toEqual(['maxresdefault', 'hq1', 'maxres2', 'hq3']);
  });
});

describe('a stored disc', () => {
  test('is kept as it was', async () => {
    const { asDisc } = await load();
    expect(asDisc(DISC)).toEqual(DISC);
  });

  test('isn’t one without a video id, a picture of its own or a name', async () => {
    const { asDisc } = await load();
    expect(asDisc({ ...DISC, id: 'nope' })).toBeNull();
    expect(asDisc({ ...DISC, cover: 'https://evil.example/a.jpg' })).toBeNull();
    expect(asDisc({ ...DISC, title: '   ' })).toBeNull();
    expect(asDisc('Whiplash')).toBeNull();
  });

  test('has its crop, length and date put right', async () => {
    const { asDisc } = await load();
    const d = asDisc({ ...DISC, coverX: 400, duration: 12, added: 'yesterday' })!;
    expect(d.coverX).toBe(50);
    expect(d.duration).toBeUndefined();
    expect(d.added).toBe(new Date(0).toISOString());
  });
});

describe('burning', () => {
  test('trims the name and keeps the crop on the picture', async () => {
    const { burnable } = await load();
    expect(burnable({ id: DISC.id, title: '  Whiplash  ', artist: ' ', cover: 'hq2', coverX: 120.4 })).toEqual({
      id: DISC.id,
      title: 'Whiplash',
      cover: 'hq2',
      coverX: 100
    });
  });

  test('refuses what isn’t a disc', async () => {
    const { burnable } = await load();
    expect(() => burnable({ id: 'x', title: 'a', cover: 'hq2', coverX: 50 })).toThrow();
    expect(() => burnable({ id: DISC.id, title: 'a', cover: 'hq9', coverX: 50 })).toThrow();
    expect(() => burnable({ id: DISC.id, title: '  ', cover: 'hq2', coverX: 50 })).toThrow(/name/);
  });

  test('a DVD-R goes on this visitor’s shelf, in place of one of the same video', async () => {
    const { burnHere, shelf } = await load();
    burnHere({ id: DISC.id, title: 'Whiplash', cover: 'hq1', coverX: 50 });
    burnHere({ id: DISC.id, title: 'Whiplash (again)', cover: 'hq2', coverX: 60 });
    expect(shelf()).toMatchObject([{ id: DISC.id, title: 'Whiplash (again)', cover: 'hq2', burnedHere: true }]);
    expect(JSON.parse(stored.get('os-dvds')!)).toHaveLength(1);
  });

  test('a DVD-R burned in another tab meanwhile stays', async () => {
    const { burnHere, shelf } = await load();
    stored.set('os-dvds', JSON.stringify([{ ...DISC, id: 'Dlz_XHeUUis', title: 'White Ferrari' }]));
    burnHere({ id: DISC.id, title: 'Whiplash', cover: 'hq1', coverX: 50 });
    expect(shelf().map((d) => d.title)).toEqual(['White Ferrari', 'Whiplash']);
  });

  test('the oldest DVD-Rs go past fifty', async () => {
    const { burnHere, MINE_MOST, shelf } = await load();
    for (let i = 0; i < MINE_MOST + 2; i++) burnHere({ id: `vid${String(i).padStart(8, '0')}`, title: `Disc ${i}`, cover: 'hq1', coverX: 50 });
    const titles = shelf().map((d) => d.title);
    expect(titles).toHaveLength(MINE_MOST);
    expect(titles[0]).toBe('Disc 2');
  });

  test('throwing one away takes it off the shelf', async () => {
    const { burnHere, throwAwayHere, shelf } = await load();
    burnHere({ id: DISC.id, title: 'Whiplash', cover: 'hq1', coverX: 50 });
    throwAwayHere(DISC.id);
    expect(shelf()).toEqual([]);
  });
});

describe('a DVD-R’s length', () => {
  test('is kept once DVD Player knows it, and not changed for YouTube’s rounding', async () => {
    const { burnHere, noteLength, shelf } = await load();
    burnHere({ id: DISC.id, title: 'Whiplash', cover: 'hq1', coverX: 50 });
    noteLength(shelf()[0], 191.2, false);
    expect(shelf()[0].duration).toBe(191200);
    noteLength(shelf()[0], 192.9, false);
    expect(shelf()[0].duration).toBe(191200);
  });

  test('is put right when it’s off, as when a disc was given the length of the one before it', async () => {
    stored.set('os-dvds', JSON.stringify([{ ...DISC, duration: 207000 }]));
    const { noteLength, shelf } = await load();
    noteLength(shelf()[0], 191.2, false);
    expect(shelf()[0].duration).toBe(191200);
    expect(JSON.parse(stored.get('os-dvds')!)[0].duration).toBe(191200);
  });

  test('isn’t a length YouTube can’t mean', async () => {
    const { burnHere, noteLength, shelf } = await load();
    burnHere({ id: DISC.id, title: 'Whiplash', cover: 'hq1', coverX: 50 });
    noteLength(shelf()[0], 0.4, false);
    noteLength(shelf()[0], 90_000, false);
    expect(shelf()[0].duration).toBeUndefined();
  });
});

describe('reading a link', () => {
  const oembed = (answer: Response) => vi.stubGlobal('fetch', vi.fn(async () => answer));

  test('names the video as the bot’s /dvd would', async () => {
    oembed(Response.json({ title: 'Frank Ocean - White Ferrari (Official Video)', author_name: 'Frank Ocean' }));
    const { lookUpVideo } = await load();
    expect(await lookUpVideo('https://youtu.be/Dlz_XHeUUis?si=x')).toEqual({ id: 'Dlz_XHeUUis', title: 'White Ferrari', artist: 'Frank Ocean' });
  });

  test('says why a video can’t be burned', async () => {
    const { lookUpVideo } = await load();
    expect(await lookUpVideo('https://evil.example/watch?v=Dlz_XHeUUis')).toHaveProperty('error');
    oembed(new Response('Unauthorized', { status: 401 }));
    expect(await lookUpVideo('Dlz_XHeUUis')).toEqual({ error: 'Its owner doesn’t let other sites play it.' });
    oembed(new Response('Not Found', { status: 404 }));
    expect((await lookUpVideo('Dlz_XHeUUis')) as { error: string }).toHaveProperty('error', expect.stringMatching(/doesn’t know/));
  });
});
