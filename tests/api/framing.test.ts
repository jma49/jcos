import { createServer, type IncomingHttpHeaders } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { createServer as createTlsServer } from 'node:tls';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { askHeaders, type Ask, checkFraming, framingAllowed, isPrivateAddress, publicUrl } from '../../api/framing';

// Whether a page can be shown in the Browser's frame. The function asks
// other sites, so it must never be turned on addresses inside a network.

const resolveTo = (addresses: string[]) => async () => addresses;
const h = (entries: Record<string, string>) => new Headers(entries);

describe('isPrivateAddress', () => {
  test('private, loopback and link-local addresses', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  test('public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '151.101.1.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe('publicUrl', () => {
  test('refuses what it must not ask', async () => {
    const pub = resolveTo(['93.184.216.34']);
    for (const raw of ['file:///etc/passwd', 'ftp://example.com', 'http://user:pw@example.com', 'http://localhost/', 'http://printer.local/', 'http://127.0.0.1/', 'http://[::1]/', 'http://example.com:8080/', 'not a url', 'http://intranet/']) {
      expect(await publicUrl(raw, pub), raw).toBeNull();
    }
  });
  test('refuses a public-looking name that resolves inside a network', async () => {
    expect(await publicUrl('https://sneaky.example.com/', resolveTo(['10.1.2.3']))).toBeNull();
    expect(await publicUrl('https://half.example.com/', resolveTo(['93.184.216.34', '127.0.0.1']))).toBeNull();
  });
  test('accepts a public site', async () => {
    expect((await publicUrl('https://example.com/a?b=1', resolveTo(['93.184.216.34'])))?.href).toBe('https://example.com/a?b=1');
  });
});

describe('framingAllowed', () => {
  test('no headers: allowed', () => expect(framingAllowed(h({}))).toBe(true));
  test('X-Frame-Options blocks', () => {
    expect(framingAllowed(h({ 'x-frame-options': 'DENY' }))).toBe(false);
    expect(framingAllowed(h({ 'x-frame-options': 'SAMEORIGIN' }))).toBe(false);
  });
  test('frame-ancestors decides, over X-Frame-Options', () => {
    expect(framingAllowed(h({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }))).toBe(false);
    expect(framingAllowed(h({ 'content-security-policy': "frame-ancestors 'self'" }))).toBe(false);
    expect(framingAllowed(h({ 'content-security-policy': 'frame-ancestors *' }))).toBe(true);
    expect(framingAllowed(h({ 'content-security-policy': 'frame-ancestors https:' }))).toBe(true);
    expect(framingAllowed(h({ 'content-security-policy': "frame-ancestors 'self' https://*.majincheng.com https://majincheng.com", 'x-frame-options': 'DENY' }))).toBe(true);
    expect(framingAllowed(h({ 'content-security-policy': 'frame-ancestors https://www.majincheng.com' }))).toBe(true);
    expect(framingAllowed(h({ 'content-security-policy': 'frame-ancestors https://example.com http://www.majincheng.com' }))).toBe(false);
  });
});

describe('GET /api/framing', () => {
  const answer = (status: number, headers: Record<string, string> = {}) => ({ status, headers: new Headers(headers) });
  const ask = (url: string, asker: Ask) =>
    checkFraming(new Request(`https://www.majincheng.com/api/framing?${new URLSearchParams({ url })}`), resolveTo(['93.184.216.34']), asker);

  test('a refused address is a 400, without asking anyone', async () => {
    const asker = vi.fn<Ask>();
    const res = await checkFraming(new Request('https://www.majincheng.com/api/framing?url=http://169.254.169.254/latest'), resolveTo(['169.254.169.254']), asker);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That isn’t a public web address.' });
    expect(asker).not.toHaveBeenCalled();
  });

  test('reads the headers', async () => {
    const res = await ask('https://example.com/', async () => answer(200, { 'x-frame-options': 'DENY' }));
    expect(await res.json()).toEqual({ embeddable: false, url: 'https://example.com/' });
  });

  test('a site that doesn’t answer is a 502, logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await ask('https://example.com/', async () => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'The site didn’t answer.' });
    expect(log).toHaveBeenCalledWith('/api/framing: the site didn’t answer:', 'example.com', 'timed out');
    log.mockRestore();
  });

  test('a redirect to a private address is refused', async () => {
    const res = await ask('https://example.com/', async () => answer(302, { location: 'http://10.0.0.5/' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The site redirects to an address that isn’t public.' });
  });

  // DNS rebinding: a name that answers a public address to the check and a
  // private one to the next lookup. The page is asked at the address that was
  // checked, and the name isn't looked up again (#201).
  test('asks at the address that was checked, not a second lookup', async () => {
    const answers = [['93.184.216.34'], ['127.0.0.1']];
    const resolve = vi.fn(async () => answers.shift() ?? []);
    const asker = vi.fn<Ask>(async () => answer(200));
    const res = await checkFraming(new Request('https://www.majincheng.com/api/framing?url=https://rebind.example/'), resolve, asker);
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(asker).toHaveBeenCalledTimes(1);
    expect(asker.mock.calls[0][0].url.href).toBe('https://rebind.example/');
    expect(asker.mock.calls[0][0].addresses).toEqual(['93.184.216.34']);
  });

  test('each redirect hop is checked and asked at its own checked address', async () => {
    const dns: Record<string, string[]> = { 'a.example': ['93.184.216.34'], 'b.example': ['151.101.1.1'] };
    const resolve = vi.fn(async (host: string) => dns[host] ?? []);
    const asker = vi.fn<Ask>(async ({ url }) => (url.hostname === 'a.example' ? answer(301, { location: 'https://b.example/x' }) : answer(200)));
    const res = await checkFraming(new Request('https://www.majincheng.com/api/framing?url=https://a.example/'), resolve, asker);
    expect(await res.json()).toEqual({ embeddable: true, url: 'https://b.example/x' });
    expect(resolve.mock.calls.map(([host]) => host)).toEqual(['a.example', 'b.example']);
    expect(asker.mock.calls.map(([v]) => [v.url.href, v.addresses])).toEqual([
      ['https://a.example/', ['93.184.216.34']],
      ['https://b.example/x', ['151.101.1.1']]
    ]);
  });
});

// askHeaders against a server on this machine: the vetted address is
// 127.0.0.1 here only because the private-address check is vet()'s job, not
// askHeaders'. The system's resolver is replaced with one that records and
// fails, so any second lookup of the name would show.
describe('askHeaders', () => {
  const dns = createRequire(import.meta.url)('node:dns') as { lookup: unknown };
  const original = dns.lookup;
  let systemLookups: string[];
  // Once the test's server is listening (listen() looks its host up too).
  const recordSystemLookups = () => {
    systemLookups = [];
    dns.lookup = (host: string, opts: unknown, cb?: (error: Error) => void) => {
      systemLookups.push(host);
      (typeof opts === 'function' ? opts : cb)?.(Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' }));
    };
  };
  afterEach(() => {
    dns.lookup = original;
  });

  test('http: connects to the vetted address, sends the name as Host, reads only the headers', async () => {
    let seen: { url?: string; headers?: IncomingHttpHeaders } = {};
    const server = createServer((req, res) => {
      seen = { url: req.url, headers: req.headers };
      res.writeHead(200, [
        ['Content-Security-Policy', "frame-ancestors 'none'"],
        ['X-Frame-Options', 'DENY'],
        ['X-Frame-Options', 'SAMEORIGIN']
      ]);
      res.write('<html>');
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;
    recordSystemLookups();
    try {
      const res = await askHeaders({ url: new URL(`http://rebind.example:${port}/a?b=1`), addresses: ['127.0.0.1'] });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
      expect(res.headers.get('x-frame-options')).toBe('DENY, SAMEORIGIN');
      expect(seen.url).toBe('/a?b=1');
      expect(seen.headers?.host).toBe(`rebind.example:${port}`);
      expect(systemLookups).toEqual([]);
    } finally {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  });

  test('https: connects to the vetted address with the name as SNI', async () => {
    let servername: string | undefined;
    const server = createTlsServer({
      SNICallback: (name, cb) => {
        servername = name;
        cb(new Error('no certificate here'), undefined);
      }
    });
    server.on('tlsClientError', () => {});
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;
    recordSystemLookups();
    try {
      await expect(askHeaders({ url: new URL(`https://rebind.example:${port}/`), addresses: ['127.0.0.1'] })).rejects.toThrow();
      expect(servername).toBe('rebind.example');
      expect(systemLookups).toEqual([]);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});
