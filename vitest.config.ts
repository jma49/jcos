import { defineConfig } from 'vitest/config';

// Unit tests (npm test): the parts of JM/OS with rules worth pinning down,
// the Vercel Functions (tests/api/: Vercel would deploy a test inside api/
// as a function), and the Soapbox bot. The database's rules are tested
// separately, against Postgres (supabase/tests).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'supabase/functions/**/*.test.mjs'],
    environment: 'node'
  }
});
