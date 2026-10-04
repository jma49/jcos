import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/browser';
import { makeSender, scrub, withoutQueries } from './sentry';

// What reaches Sentry has nothing personal in it: no user, breadcrumbs or
// extra data, and no URL's query string or hash.

describe('withoutQueries', () => {
  test('takes the query string and hash off every URL in a text', () => {
    expect(withoutQueries('Failed to load https://majincheng.com/?reset=abc123&open=account#top then https://x.supabase.co/rest/v1/events?select=*')).toBe(
      'Failed to load https://majincheng.com/ then https://x.supabase.co/rest/v1/events'
    );
    expect(withoutQueries('no address here')).toBe('no address here');
  });
});

describe('scrub', () => {
  test('keeps the error and drops what could identify a visitor', () => {
    const event = {
      type: undefined,
      message: 'at https://majincheng.com/?place=Tokyo',
      user: { id: 'alice-id', username: 'alice' },
      breadcrumbs: [{ message: 'clicked' }],
      extra: { body: 'Dear diary' },
      request: { url: 'https://majincheng.com/?reset=token', headers: { cookie: 'a' } },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Failed to fetch https://majincheng.com/api/lyrics?title=Whiplash',
            stacktrace: { frames: [{ filename: 'https://majincheng.com/_astro/stickies.js?v=1', abs_path: 'https://majincheng.com/_astro/stickies.js?v=1' }] }
          }
        ]
      }
    } as unknown as ErrorEvent;
    const clean = scrub(event);
    expect(clean.user).toBeUndefined();
    expect(clean.breadcrumbs).toBeUndefined();
    expect(clean.extra).toBeUndefined();
    expect(clean.request).toEqual({ url: 'https://majincheng.com/' });
    expect(clean.message).toBe('at https://majincheng.com/');
    const [value] = clean.exception!.values!;
    expect(value.value).toBe('Failed to fetch https://majincheng.com/api/lyrics');
    expect(value.stacktrace!.frames![0]).toEqual({ filename: 'https://majincheng.com/_astro/stickies.js', abs_path: 'https://majincheng.com/_astro/stickies.js' });
  });
});

describe('makeSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('sends to the DSN’s ingest origin, tagged with where, and only a sample', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('__JMOS_BUILD__', 'abc1234'); // defined by the build (astro.config.mjs)
    const random = vi.spyOn(Math, 'random');
    const send = makeSender('https://publickey@o123.ingest.us.sentry.io/456');
    random.mockReturnValue(0.9); // outside the sample: dropped
    send(new Error('dropped'), 'stickies.read');
    random.mockReturnValue(0.1);
    send(new Error('Failed at https://majincheng.com/?reset=token'), 'stickies.read');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).origin).toBe('https://o123.ingest.us.sentry.io');
    const body = String(init.body);
    expect(body).toContain('"where":"stickies.read"');
    expect(body).toContain('"release":"abc1234"');
    expect(body).toContain('Failed at https://majincheng.com/');
    expect(body).not.toContain('token');
    expect(body).not.toContain('dropped');
  });
});
