import { defineConfig } from 'vitest/config';

// Unit tests (npm test): the parts of JM/OS with rules worth pinning down,
// the Vercel Functions (tests/api/: Vercel would deploy a test inside api/
// as a function), and the Soapbox bot. The database's rules are tested
// separately, against Postgres (supabase/tests).
//
// npm run coverage runs the same tests and reports how much of the code
// they run (V8's own count), over every file that ships, tested or not:
// a summary in the terminal (and in CI's log), the rest in coverage/. It's
// reported, not yet held to a threshold.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts', 'supabase/functions/**/*.ts'],
      // Tests and what only tests use (the contract tests' backends), and
      // types alone.
      exclude: ['**/*.test.{ts,tsx,mjs}', 'src/os/social/contract/**', 'src/lib/database.types.ts', 'src/env.d.ts'],
      reporter: ['text-summary', 'json-summary', 'html']
    }
  }
});
