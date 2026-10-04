# 0017. YouTube's play button is covered, not shown

- Date: 2026-09-29
- Status: accepted

## Context

The rule is that YouTube's own chrome never shows. YouTube's embed now
shows its own play/pause button for about 4.3 s after every start, seek
and resume, and no setting turns it off. The iPod and Karaoke keep their
artwork over the video for those seconds. DVD Player covered its picture
the same way, with the chapter's frame, and Jincheng found the picture
stopping at every pause and play "not smooth".

## Decision

Asked to choose, Jincheng picked a picture that never stops. DVD Player
keeps the picture, paused or not, masks only the button with one of its
own, and lets YouTube's darkening of the picture show for those seconds.

## Consequences

- That darkening is the one exception to "YouTube's chrome never shows"
  ([docs/agents/pitfalls.md](../agents/pitfalls.md)).
