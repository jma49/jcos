import { describe, expect, test } from 'vitest';
import { GET } from '../../api/geo';

// Where the visitor is, from the headers Vercel adds. Anything can arrive
// in a header, so it has to survive bad ones.

const ask = (headers: Record<string, string>) => GET(new Request('https://www.majincheng.com/api/geo', { headers }));

const SAO_PAULO = {
  'x-vercel-ip-city': 'S%C3%A3o%20Paulo',
  'x-vercel-ip-country': 'BR',
  'x-vercel-ip-country-region': 'SP',
  'x-vercel-ip-latitude': '-23.5475',
  'x-vercel-ip-longitude': '-46.6361',
  'x-vercel-ip-timezone': 'America/Sao_Paulo'
};

describe('GET /api/geo', () => {
  test('decodes the place and is never cached', async () => {
    const res = ask(SAO_PAULO);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({
      city: 'São Paulo',
      region: 'SP',
      country: 'BR',
      latitude: -23.5475,
      longitude: -46.6361,
      timeZone: 'America/Sao_Paulo'
    });
  });

  test('no location (a local build, an unknown address) is a 204', async () => {
    expect(ask({}).status).toBe(204);
    expect(ask({ ...SAO_PAULO, 'x-vercel-ip-latitude': 'north' }).status).toBe(204);
  });

  test('a malformed or overlong city is dropped or cut, not an error', async () => {
    expect((await ask({ ...SAO_PAULO, 'x-vercel-ip-city': '%E0%A4%A' }).json()).city).toBeNull();
    expect((await ask({ ...SAO_PAULO, 'x-vercel-ip-city': 'a'.repeat(500) }).json()).city).toHaveLength(100);
  });
});
