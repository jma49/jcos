// Serves the production build (dist/) the way Vercel would, for the
// scripts that open it in a browser (test:smoke, perf, preview:capture)
// and for `npm run serve`. Unlike `astro preview`, it runs in this process
// and stops with it. With `api`, the functions in api/ answer too, run
// from source in this process (serve.mjs sets that up). Every file comes
// with the headers vercel.json gives every path, the Content Security
// Policy among them, so what runs here meets the same rules as the site.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

/** The headers vercel.json sets on every path ("/(.*)"). */
const HEADERS = Object.fromEntries(
  JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
    .headers.filter((rule) => rule.source === '/(.*)')
    .flatMap((rule) => rule.headers.map(({ key, value }) => [key, value]))
);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml'
};

/**
 * Starts a server; resolves to its address and a way to stop it. By
 * default it takes a free port on 127.0.0.1 and serves dist/ alone.
 * `port` picks the port, `host: null` listens on every interface, and
 * `api` answers /api/<name> with api/<name>.ts.
 */
export function serveDist({ port = 0, host = '127.0.0.1', api = false } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    try {
      const fn = api ? url.pathname.match(/^\/api\/(\w+)$/)?.[1] : null;
      if (fn) {
        const { GET } = await import(join(ROOT, 'api', `${fn}.ts`));
        const answer = await GET(new Request(url, { headers: req.headers }));
        res.writeHead(answer.status, Object.fromEntries(answer.headers));
        res.end(Buffer.from(await answer.arrayBuffer()));
        console.log(`${answer.status} ${url.pathname}${url.search}`);
        return;
      }
      let file = join(DIST, normalize(decodeURIComponent(url.pathname)));
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      if (api && url.pathname.startsWith('/api/')) console.error(url.pathname, e.message);
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    const listening = () => resolve({ url: `http://${host ?? 'localhost'}:${server.address().port}/`, close: () => server.close() });
    if (host === null) server.listen(port, listening);
    else server.listen(port, host, listening);
  });
}
