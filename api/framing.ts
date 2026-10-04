// GET /api/framing?url=: whether a page lets majincheng.com show it in a
// frame, so the Browser can say so instead of showing a blank window. A
// browser can't read another site's headers, so this asks for the page
// and reads its X-Frame-Options and Content-Security-Policy. It answers
// yes or no and nothing else: no content is passed on, so it can't be
// used as a proxy.
//
// Only public http(s) addresses are asked: names that resolve to a private,
// loopback or link-local address are refused, at every redirect. The
// request then connects to the addresses that were checked, not to a
// second lookup of the name, which could answer differently (DNS
// rebinding). Answers are cached at the edge for a day.
//
// { embeddable: boolean, url: string } (url after redirects); 400 for an
// address it won't ask (or a redirect to one), 502 when the site doesn't
// answer in five seconds or redirects more than five times. Errors are
// { error } and are logged.

import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

/** Where the Browser runs (majincheng.com redirects here), which a page's frame-ancestors has to allow. */
const OURS = new URL('https://www.majincheng.com');
const MAX_REDIRECTS = 5;

/** Whether an IP address is private, loopback, link-local or otherwise not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

type Lookup = (host: string) => Promise<string[]>;
const dnsLookup: Lookup = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/** A public http(s) address, with the addresses its name was found to resolve to. */
export type Vetted = { url: URL; addresses: string[] };

/** The address and what its name resolves to if it's a public http(s) one, else null. */
export async function vet(raw: string, resolve: Lookup = dnsLookup): Promise<Vetted | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !isIP(host)) return null;
  if (/\.(local|internal|localhost|home\.arpa)$/i.test(host) || host === 'localhost') return null;
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (!addresses.length || addresses.some(isPrivateAddress)) return null;
  return { url, addresses };
}

/** The address as a URL if it's a public http(s) one, else null. */
export async function publicUrl(raw: string, resolve: Lookup = dnsLookup): Promise<URL | null> {
  return (await vet(raw, resolve))?.url ?? null;
}

/** A DNS lookup that answers only with these addresses, whatever the name. */
function pinnedLookup(addresses: string[]): LookupFunction {
  const all = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_host, options, callback) => {
    if (options.all) callback(null, all);
    else callback(null, all[0].address, all[0].family);
  };
}

type Answer = { status: number; headers: Headers };
export type Ask = (vetted: Vetted) => Promise<Answer>;

/**
 * Asks for the page and reads the status and headers, connecting only to the
 * vetted addresses: the name still goes in the Host header and TLS's SNI, and
 * the certificate is checked against it. A fresh connection each time, so no
 * pooled socket from another lookup is reused; the body is never read.
 */
export const askHeaders: Ask = ({ url, addresses }) =>
  new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      {
        method: 'GET',
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; majincheng.com frame check)', accept: 'text/html' },
        lookup: pinnedLookup(addresses),
        agent: false,
        signal: AbortSignal.timeout(5000)
      },
      (res) => {
        const headers = new Headers();
        for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
          try {
            headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
          } catch {
            // A header fetch() wouldn't accept either; the frame check doesn't need it.
          }
        }
        // Only the headers matter; don't download the page.
        res.destroy();
        resolve({ status: res.statusCode ?? 0, headers });
      }
    );
    req.on('error', reject);
    req.end();
  });

/** Whether one frame-ancestors source allows `origin`. */
function sourceAllows(source: string, origin: URL): boolean {
  if (source === '*') return true;
  if (source === "'none'") return false;
  if (source === 'https:') return origin.protocol === 'https:';
  const m = source.match(/^(?:(https?):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?\/?$/i);
  if (!m) return false;
  const [, scheme, wildcard, host] = m;
  if (scheme && `${scheme.toLowerCase()}:` !== origin.protocol) return false;
  const name = host.toLowerCase();
  return wildcard ? origin.hostname.endsWith(`.${name}`) : origin.hostname === name;
}

/** Whether a page with these response headers can be framed by our site. */
export function framingAllowed(headers: Headers): boolean {
  const xfo = headers.get('x-frame-options')?.trim().toLowerCase();
  // SAMEORIGIN means the page's own site, never ours; DENY and the obsolete ALLOW-FROM block too.
  const xfoBlocks = !!xfo;
  const csp = headers.get('content-security-policy') ?? '';
  const directive = csp
    .split(/[;,]/)
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name?.toLowerCase() === 'frame-ancestors');
  // frame-ancestors, where present, takes precedence over X-Frame-Options.
  if (directive) {
    const sources = directive.slice(1);
    return sources.some((s) => sourceAllows(s, OURS));
  }
  return !xfoBlocks;
}

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

/** The handler, with the lookup and the request passed in so tests needn't touch the network. */
export async function checkFraming(request: Request, resolve: Lookup = dnsLookup, ask: Ask = askHeaders) {
  const asked = new URL(request.url).searchParams.get('url')?.trim() ?? '';
  let vetted = asked.length <= 2000 ? await vet(asked, resolve) : null;
  if (!vetted) return json({ error: 'That isn’t a public web address.' }, 400, 'public, s-maxage=86400');
  let url = vetted.url;
  try {
    for (let hop = 0; ; hop++) {
      // Redirects are followed by hand, so each hop is checked and pinned too.
      const res = await ask(vetted);
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!next) {
        return json({ embeddable: framingAllowed(res.headers), url: url.href }, 200, 'public, s-maxage=86400, stale-while-revalidate=604800');
      }
      if (hop >= MAX_REDIRECTS) {
        console.error('/api/framing: too many redirects:', url.hostname);
        return json({ error: 'The site redirects too many times.' }, 502, 'public, s-maxage=3600');
      }
      vetted = await vet(new URL(next, url).href, resolve);
      if (!vetted) return json({ error: 'The site redirects to an address that isn’t public.' }, 400, 'public, s-maxage=3600');
      url = vetted.url;
    }
  } catch (error) {
    console.error('/api/framing: the site didn’t answer:', url.hostname, error instanceof Error ? error.message : error);
    return json({ error: 'The site didn’t answer.' }, 502, 'public, s-maxage=300');
  }
}

// Only the request: whatever else the runtime passes mustn't stand in for the lookup.
export function GET(request: Request) {
  return checkFraming(request);
}
