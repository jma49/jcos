# 0007. A full Content Security Policy, Report-Only first

- Date: 2026-09-26, amended 2026-10-03
- Status: amended (the 2026-09-26 decision, no script CSP, is replaced)

## Context

A Content Security Policy for scripts limits what a page may run. Astro's
inline hydration scripts and the YouTube player would both need it
loosened.

## Decision

No full script CSP: loosened far enough for those two, it wouldn't
protect anything. The other security headers stay, in `vercel.json`.

### Amended 2026-10-03

Jincheng decided to follow best practice and have a full policy (#239).
Neither reason above holds once it's measured: the build's inline scripts
are four fixed snippets (the theme script, Astro's island loader and its
`client:only` directive, the project pages' theme toggle), which a
policy allows by their SHA-256 hashes, and YouTube needs only its host
(`https://www.youtube.com`) for the iframe API, not `'unsafe-inline'` or
`'unsafe-eval'`. So the policy allows scripts from the site itself, those
hashes and YouTube, and lists every origin the site fetches from (its
Supabase project, Open-Meteo, lrclib, GitHub's API, YouTube's oEmbed and
pictures). Styles keep `'unsafe-inline'` (the page's own `<style>`
elements, and the fallback where adopted stylesheets aren't supported);
images may come from any `https:` host (album covers, photos, Soapbox
pictures) and frames too (the Browser frames any page).

It ships as `Content-Security-Policy-Report-Only` beside the enforced
policy, which stays as it was (`frame-ancestors`, `base-uri`,
`object-src`, `form-action`). There's no endpoint collecting reports, so
it's watched another way: `npm run test:smoke` serves the build with
`vercel.json`'s headers and fails on any violation, the Report-Only
policy's included, and the policy was checked against the live site
with every smoke target opened and none reported. Once it has run
without surprises, the same value moves to `Content-Security-Policy` and
the Report-Only header goes.

## Consequences

- What visitors write renders as text, and the database enforces every
  rule, so the policy is a second line, not what stands between one
  visitor and others.
- An inline script that changes (an Astro upgrade, an edit to the theme
  script) has a new hash: the smoke test names it, and its hash goes in
  `vercel.json` in the same pull request. A new origin the site fetches
  from is added to the policy the same way.
- The Supabase project's address is in the policy, so moving the project
  means changing it there too; the smoke test can't see that one, since
  it runs without Supabase.
