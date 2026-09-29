import { describe, expect, test } from 'vitest';
import { framingAllowed, GET, isPrivateAddress, publicUrl } from '../../api/framing';

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
  test('a refused address is a 400, without asking anyone', async () => {
    const res = await GET(new Request('https://www.majincheng.com/api/framing?url=http://169.254.169.254/latest'), resolveTo(['169.254.169.254']));
    expect(res.status).toBe(400);
  });
});
