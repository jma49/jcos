# 0012. The Browser frames the Internet Archive directly

- Date: 2026-09-28
- Status: accepted

## Context

ryOS's Internet Explorer sends every page through its own proxy, which
forwards to any public address: an open relay to keep safe and pay for.

## Decision

No proxy. The Internet Archive allows framing, so the Browser asks it
directly. `/api/framing` only reads a page's headers and answers whether
it may be framed; it passes on no content.

## Consequences

- Pages that refuse framing aren't shown in the Browser.
- `/api/framing` is described in [docs/agents/api.md](../agents/api.md).
