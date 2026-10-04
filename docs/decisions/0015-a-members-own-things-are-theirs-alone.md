# 0015. A member's own things are theirs alone

- Date: 2026-09-29
- Status: accepted

## Context

The design board had stickies on Jincheng's desktop for Jincheng alone,
beside the visitors' Stickies guestbook, and an iCal of the same kind.

## Decision

There's nothing to tell apart: every account keeps its own stickies and
its own iCal (events and to-dos), which only it sees. Row-level security
enforces it; not even the owner reads another account's.

## Consequences

- Stickies has two views: Everyone's (the guestbook wall) and Yours. A
  member's own notes sit on their own desktop, or in Yours on a phone.
- iCal starts as Tiger's did, with Home and Work and no repeating or
  multi-day events yet; times are where the member is, as on a paper
  calendar.
- Deleting asks first, since there's no Undo.
