# 0008. Keep the secondary greys

- Date: 2026-09-27
- Status: accepted

## Context

Secondary text in the light theme (Finder's metadata, dates, empty
states) is about `rgb(128,128,128)` on light grey: 3.2 to 3.9:1, against
the 4.5:1 that text needs. The sidebar headings are 3.7:1 in the light
theme and 2.9:1 in the dark one.

## Decision

The greys stay. Meeting 4.5:1 means greys near `#6a6a6a`, a visibly
heavier look than the Mac OS X one the desktop copies.

## Consequences

- An audit for contrast will flag this secondary text; it's known and
  accepted.
