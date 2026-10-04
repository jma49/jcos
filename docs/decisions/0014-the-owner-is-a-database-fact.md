# 0014. The owner is a database fact

- Date: 2026-09-29
- Status: accepted

## Context

Some rooms are Jincheng's alone. ryOS gates its admin by username in
code.

## Decision

`private.owners` holds Jincheng's account id, and `public.is_owner()`
answers for the caller. Row-level security locks the owner's rooms, and
nothing in the browser decides who the owner is.

## Consequences

- `is_owner()` is callable by everyone, on purpose: it only says whether
  the caller is the owner.
- Details: [docs/agents/supabase.md](../agents/supabase.md), The owner.
