# 0018. Job Hunt is read from Gmail by hand and public only as totals

- Date: 2026-09-29
- Status: accepted

## Context

Job Hunt is a board of every company Jincheng has applied to, kept up
from what Gmail says. Jincheng wanted others to see it too.

## Decision

- The site and Supabase hold no Gmail credentials and read no mail.
  Claude reads Gmail when Jincheng asks, only reading (nothing labelled,
  drafted, sent or deleted), and Jincheng checks what it found before
  `scripts/job-hunt-import.mjs` writes it.
- Anyone else sees the numbers only: how many at each stage, how far they
  got and when it last changed, never a company or a role.
- Jincheng's own moves stand: an import moves an application on, never
  back, and reopens nothing closed.

## Consequences

- The totals come from `job_hunt_totals()`, callable by everyone on
  purpose; `npm run test:db` checks that it names no company.
- What's imported never goes into this repository.
