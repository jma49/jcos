import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// report() records an error the desktop got past: a warning in development,
// Sentry in production only with a DSN, and nothing for what's expected.

const sent: { error: Error; where: string }[] = [];
const makeSender = vi.fn((_dsn: string) => (error: Error, where: string) => void sent.push({ error, where }));
vi.mock('./sentry', () => ({ makeSender }));

/** report.ts as a build with these settings has it. */
async function reportWith(env: { DEV: boolean; PUBLIC_SENTRY_DSN?: string }) {
  vi.resetModules();
  vi.stubEnv('DEV', env.DEV);
  vi.stubEnv('PROD', !env.DEV);
  vi.stubEnv('PUBLIC_SENTRY_DSN', env.PUBLIC_SENTRY_DSN ?? '');
  return import('./report');
}

/** A refusal the interface explains, shaped as social/errors.ts makes it. */
const refusal = (reason: string) => Object.assign(new Error('Sign in first.'), { reason });

beforeEach(() => {
  sent.length = 0;
  makeSender.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('report', () => {
  test('in development, warns with where it happened', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { report } = await reportWith({ DEV: true, PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.us.sentry.io/2' });
    const error = new Error('boom');
    report(error, 'stickies.read');
    expect(warn).toHaveBeenCalledWith('[stickies.read]', error);
    await Promise.resolve();
    expect(makeSender).not.toHaveBeenCalled();
  });

  test('in production without a DSN, does nothing and loads nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { report } = await reportWith({ DEV: false });
    report(new Error('boom'), 'stickies.read');
    await new Promise((resolve) => setTimeout(resolve));
    expect(warn).not.toHaveBeenCalled();
    expect(makeSender).not.toHaveBeenCalled();
  });

  test('in production with a DSN, sends through one client, made on the first report', async () => {
    const { report } = await reportWith({ DEV: false, PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.us.sentry.io/2' });
    report(new Error('one'), 'stickies.read');
    report({ message: 'permission denied for table events', code: '42501', details: 'Key (title)=(Lunch)' }, 'ical.read');
    await new Promise((resolve) => setTimeout(resolve));
    expect(makeSender).toHaveBeenCalledTimes(1);
    expect(makeSender).toHaveBeenCalledWith('https://key@o1.ingest.us.sentry.io/2');
    expect(sent.map(({ error, where }) => [where, error.message])).toEqual([
      ['stickies.read', 'one'],
      ['ical.read', 'permission denied for table events']
    ]);
  });

  test('leaves out what’s expected', async () => {
    const { report } = await reportWith({ DEV: false, PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.us.sentry.io/2' });
    report(refusal('signed-out'), 'stickies.read');
    report(new DOMException('The operation was aborted.', 'AbortError'), 'lyrics');
    vi.stubGlobal('navigator', { onLine: false });
    report(new Error('Failed to fetch'), 'stickies.read');
    await new Promise((resolve) => setTimeout(resolve));
    expect(sent).toEqual([]);
  });
});

describe('expected', () => {
  test('a refusal other than failed, an abort or a timeout', async () => {
    const { expected } = await reportWith({ DEV: true });
    expect(expected(refusal('conflict'))).toBe(true);
    expect(expected(refusal('limit'))).toBe(true);
    expect(expected(refusal('failed'))).toBe(false);
    expect(expected(new DOMException('', 'TimeoutError'))).toBe(true);
    expect(expected(new TypeError('x is undefined'))).toBe(false);
    expect(expected({ reason: 'limit' })).toBe(false);
  });
});

describe('asError', () => {
  test('keeps an Error, and only the code and message of a plain one', async () => {
    const { asError } = await reportWith({ DEV: true });
    const error = new Error('boom');
    expect(asError(error)).toBe(error);
    const made = asError({ message: 'duplicate key value', code: '23505', details: 'Key (username)=(alice) already exists.' });
    expect([made.name, made.message]).toEqual(['Error 23505', 'duplicate key value']);
    expect(JSON.stringify(made)).not.toContain('alice');
    expect(asError('plain').message).toBe('plain');
    expect(asError(undefined).message).toBe('Unknown error');
  });
});
