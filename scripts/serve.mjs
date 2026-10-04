// Serves the production build the way Vercel does: dist/, plus the
// functions in api/ run in this process (Node strips their types), so
// everything can be checked locally, lyrics from NetEase included,
// without deploying. The server is serve-dist.mjs's, which the browser
// scripts use without the functions.
//
// Usage: npm run build && npm run serve    (PORT=4321 by default)
//
// Supabase isn't configured locally, so a production build hides the
// social features; `npm run dev` has a stand-in for them.
import { registerHooks } from 'node:module';
import { serveDist } from './serve-dist.mjs';

// The functions import TypeScript by its compiled name (`../src/lib/
// library.js`), which is what Vercel's builder emits and what Node needs
// in production. Run from source here, a local .js that isn't on disk is
// its .ts.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.') || !specifier.endsWith('.js')) throw error;
      return next(specifier.replace(/\.js$/, '.ts'), context);
    }
  }
});

const { url } = await serveDist({ port: Number(process.env.PORT ?? 4321), host: null, api: true });
console.log(`JM/OS at ${url}`);
