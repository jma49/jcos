# 0022. Handled errors are reported

- Date: 2026-10-03
- Status: accepted (replaces the crash-report item of
  [0019](0019-sized-to-a-personal-site.md))

## Context

The desktop gets past many errors on its own: a read that fails keeps
what's shown, a save that fails is put back, an app that crashes stays
in its window. Seven empty `catch` blocks and about forty
`.catch(() => {})` left no trace of them, in development or in
production, so a fault that only visitors met couldn't be seen.
[0019](0019-sized-to-a-personal-site.md) had turned down crash reports
because they meant a table, a public write path and abuse limits of our
own.

## Decision

- Every caught error either goes to `report(error, where)`
  (`src/os/core/report.ts`) or has a comment saying why it's expected
  (storage blocked, full screen refused, an animation cancelled, a
  third-party service down with a fallback).
- In development `report()` warns in the console with the place. In
  production it sends to Sentry's free plan, but only when the build has
  `PUBLIC_SENTRY_DSN`: without it nothing is sent or loaded. Sentry
  holds the data, so there's no table or write path of ours.
- The SDK (`@sentry/browser`, about 20 KB gzipped) is imported on the
  first report, never in the first load, as a client of its own: no
  global handlers, breadcrumbs, tracing or replay.
- Client errors only, one in five, and nothing personal: no user,
  cookies, headers or bodies, every URL without its query string or hash,
  and a Supabase error reduced to its code and message.
- Not reported: anything while offline, an aborted or timed-out
  request, a refusal the interface explains (a `SocialError` other than
  `failed`), and an app's code failing to download (the window already
  says to reload).

## Consequences

- Turning it on is the owner's: a Sentry project, its DSN in Vercel as
  `PUBLIC_SENTRY_DSN`, and the DSN's ingest origin added to `connect-src`
  in both CSP headers in `vercel.json` (README, Configuration).
- A new `catch` that carries on reports or says why; AGENTS.md has the
  rule.
