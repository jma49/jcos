# 0003. Apps are self-contained

- Date: 2026-09-26
- Status: accepted

## Context

The desktop grows one app or applet at a time, and every one of them
competes with the first load's budget. Apps that import each other, or
an OS that imports apps directly, would pull their code into the first
visit and make each one hard to remove.

## Decision

Each app is a folder with a manifest, listed once in `src/os/catalog.ts`.
Its code and styles load the first time it opens, an applet's once it's
got in the Applet Store, never on a first visit. Applets use the OS only
through `src/os/kit`, apps don't import each other, and the OS reaches
apps only through the catalog.

## Consequences

- The lint enforces the boundaries, and `npm run perf` checks that no
  app lands in the first load.
- Removing an applet keeps what it saved.
- How to add one is in [docs/agents/adding.md](../agents/adding.md).
