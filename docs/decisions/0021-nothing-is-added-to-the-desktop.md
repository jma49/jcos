# 0021. Nothing is added to the desktop

- Date: 2026-09-29
- Status: accepted

## Context

Tiger puts a mounted disc on the desktop, and new features could each
want an icon there. The desktop holds four (Macintosh HD, About Me,
Résumé, Projects), and the desktop picture is most of the first screen.

## Decision

Nothing is added to the desktop or the Dock: not even a disc
in DVD Player's drive. A disc is ejected from the Controller or with ⌘E.

## Consequences

- `media/drive.ts` and DVD Player keep the disc off the desktop
  ([docs/agents/desktop.md](../agents/desktop.md)).
- A phone's home screen lists every app, so nothing is out of reach
  there.
