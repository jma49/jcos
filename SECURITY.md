# Security policy

JM/OS is a personal website, [www.majincheng.com](https://www.majincheng.com),
run by one person. It has member accounts, Chat, Stickies and AirDrop on
Supabase, so a security problem can affect other visitors. Thank you for
taking the time to report one.

## Reporting a vulnerability

Please report it privately, not in a public issue, pull request or
discussion:

1. Open [Report a vulnerability](https://github.com/jma49/jmos/security/advisories/new)
   (the repository's **Security** tab, then **Report a vulnerability**).
   This uses GitHub's private vulnerability reporting: only you and the
   maintainer can see the report.
2. If you can't use GitHub, email the address on the
   [résumé](https://www.majincheng.com) with "JM/OS security" in the
   subject.

A useful report says what is affected (a URL, a file, a table or
function), how to reproduce it, and what an attacker could do with it.

## What to expect

This is maintained in spare time, so these are aims, not guarantees:

- an acknowledgement within a week;
- an assessment, and a plan or a fix for a confirmed problem, within
  about a month, sooner when visitors' data is at risk;
- credit in the advisory and the fix, if you'd like it.

There is no bug bounty. Please give a fix the chance to ship before
you disclose the problem publicly; the advisory is published once it
has.

## Scope

Only the current `main` branch and the live site are supported; there
are no older releases.

In scope:

- the site and its code in this repository: the desktop in `src/`, the
  Vercel Functions in `api/`, the response headers in `vercel.json`;
- the Supabase backend in `supabase/`: row-level security, column
  grants, functions, limits and the Edge Functions (for example reading
  or changing another member's data, a private conversation, or getting
  past a rate limit);
- the GitHub Actions workflows in `.github/`, and secrets exposed in
  the repository or the built site.

Out of scope:

- the services the site uses (Supabase, Vercel, GitHub, YouTube,
  Unsplash, Open-Meteo): report those to them;
- the projects it links to (ocra, Assay and others), which have their
  own repositories;
- denial of service by volume, spam, and social engineering;
- findings from automated scanners without a demonstrated impact, such
  as a missing header or a version number.

## Testing

Use your own accounts, and stop as soon as you can show the problem.
Don't read, change or delete other people's data, don't post where
others will see it, and don't run load or flooding tests against the
live site. A local copy is the place for those: `npm run dev` runs
without any setup, and `npm run test:db` loads the database's schema
into a local Postgres (see the README).
