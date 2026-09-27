// Serves the production build the way Vercel does: dist/, plus the
// functions in api/ run in this process (Node strips their types), so
// everything can be checked locally, lyrics from NetEase included,
// without deploying.
//
// Usage: npm run build && npm run serve    (PORT=4321 by default)
//
// Supabase isn't configured locally, so a production build hides the
// social features; `npm run dev` has a stand-in for them.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const PORT = Number(process.env.PORT ?? 4321);
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    const fn = url.pathname.match(/^\/api\/(\w+)$/)?.[1];
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
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) {
    if (url.pathname.startsWith('/api/')) console.error(url.pathname, e.message);
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`JM/OS at http://localhost:${PORT}/`));
