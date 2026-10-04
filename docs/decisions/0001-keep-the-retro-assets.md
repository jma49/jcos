# 0001. Keep the retro Mac OS X assets

- Date: 2026-09-28
- Status: accepted

## Context

The icons, the fonts (Lucida Grande, Apple Garamond, Monaco) and the
stones wallpaper are copied from ryOS, and through it from Mac OS X.
Using them was a deliberate choice, made after discussing the Apple and
Adobe copyright risk. Replacing them with original drawings was later
proposed: a greyhound mark in place of the apple (in Aqua, Graphite and
natural finishes) and five icons redrawn in SVG.

## Decision

The assets stay as they are: the apple, the icons, the fonts and the
pictures. Jincheng judged the redrawn drafts worse than the originals,
and the idea was dropped. Don't propose replacing them again.

## Consequences

- `NOTICE` records where each asset comes from.
- The `src/os` code is original and only borrows architecture ideas from
  ryOS (AGPL-3.0); only the assets are copied.
- Icons for apps ryOS doesn't have (Stickies, Soapbox) are still drawn
  here, in `core/icons.tsx`, to match the set.
