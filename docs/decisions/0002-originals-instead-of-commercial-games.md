# 0002. Originals instead of commercial games

- Date: 2026-09-26
- Status: accepted

## Context

King of Fighters '98 was proposed for the desktop. A Neo Geo emulator
runs well in the browser (EmulatorJS with the FBNeo core), but the game
ROM and the BIOS belong to SNK and can't be hosted here.

## Decision

No King of Fighters '98, and no other commercial game or ROM. The only
lawful version would make visitors bring their own ROM, which isn't
worth having when the game can't simply be played. Games are built as
originals in the spirit of the old ones, as Pinball is.

## Consequences

- No emulators on the desktop.
- New games are written here, with their rules in plain modules
  (`applets/spider/rules.ts`, `applets/pinball/table.ts`).
