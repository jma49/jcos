# 0011. API conventions

- Date: 2026-09-29
- Status: accepted

## Context

The site's own server code is small: four GET Vercel Functions and two
Edge Functions. ryOS's API design guide, written for dozens of
endpoints, was compared with it.

## Decision

Taken: `{ error }` bodies of one sentence, the usual status codes, no
CORS on the Vercel Functions, `publicUrl` for any URL fetched, a log line
on every failure, tests for every function, and a firewall rate limit on
the functions that call other sites.

Not taken: a shared handler, Zod, an origin allowlist on the Vercel
Functions, or auth headers. ryOS needs its many endpoints because its
Redis store has no permissions; here Supabase's REST API and the
database's rules do that work.

## Consequences

- The conventions are in [docs/agents/api.md](../agents/api.md),
  Conventions.
