import { defineConfig } from 'vitest/config';

// Unit tests (npm test): the parts of JM/OS with rules worth pinning down,
// and the Soapbox bot. The database's rules are tested separately, against
// Postgres (supabase/tests).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.mjs'],
    environment: 'node'
  }
});
