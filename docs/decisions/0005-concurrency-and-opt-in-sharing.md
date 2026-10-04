# 0005. Concurrency in every design; sharing is opt-in

- Date: 2026-09-26 (desktop lyrics 2026-09-28)
- Status: accepted

## Context

The desktop is shared: many visitors at once, and one visitor often in
several tabs. An audit found tabs overwriting each other's settings,
scores and installed applets, a draft the bot could add twice, and a
song start that sent every visitor to the database at once. Other
people's pointers moved across every screen by default.

## Decision

- Every design is checked for concurrency, with the checklist in
  [docs/agents/self-audit.md](../agents/self-audit.md): limits and claims
  hold under races, tabs don't overwrite each other, and fan-out stays
  small.
- No one's actions reach another's screen uninvited. Other people's
  pointers are off unless a visitor turns on "Show other people's
  pointers" (System Preferences > Sharing), and a pointer is sent only
  while someone else has it on. Desktop lyrics are off until the visitor
  turns them on, too.

## Consequences

- Left as they are, on purpose: open windows are per tab (the last
  writer wins, as browsers restore tabs), and past the free plan's 200
  Realtime connections, further visitors don't see presence, chat or
  listening along; the desktop works without them.
- The pointer setting has a new key (`showOthersPointers`), so the old
  default (on) doesn't carry over for visitors who saved settings.
