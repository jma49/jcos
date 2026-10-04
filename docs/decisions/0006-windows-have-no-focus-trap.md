# 0006. Windows have no focus trap

- Date: 2026-09-26 (amended with #194)
- Status: accepted

## Context

A focus trap keeps Tab inside a modal dialog. Windows on the desktop
aren't modal: several are open at once, beside the menu bar and the
Dock.

## Decision

Windows don't trap focus; Tab moves on to the rest of the desktop. What
covers the whole desktop is modal: the Dashboard and a full-screen app
(Time Machine) make the rest of the page `inert` while they're up.

## Consequences

- Keyboard users reach the Dock and the menu bar from any window.
- How focus moves is in [docs/agents/desktop.md](../agents/desktop.md),
  Windows and the shell.
