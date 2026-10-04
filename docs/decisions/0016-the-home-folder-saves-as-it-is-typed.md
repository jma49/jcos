# 0016. The home folder saves as it's typed; private notes have their own commands

- Date: 2026-09-29
- Status: accepted

## Context

Jincheng's home folder (Users > jincheng) keeps documents and a diary in
the database, their only copy. Tiger's TextEdit saved through a Save
dialog. The Telegram bot already had `/note`, which posts to the public
Soapbox.

## Decision

- Documents open in a TextEdit that saves as it's typed; ⌘S saves at
  once, and a draft stays in the browser until a save lands. Throwing a
  document away asks first, since there's no Trash to take it back from.
- From Telegram, `/diary` and `/doc` write to the home folder. Not
  `/note`: a private note mustn't turn public by habit, or the other way
  round. A photo sent with either goes nowhere rather than onto the
  Soapbox.

## Consequences

- Each entry keeps the Telegram message it came from (never granted to
  the site), so editing the message edits it and a message delivered
  twice is saved once.
