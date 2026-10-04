# 0019. Sized to a personal site

- Date: 2026-09-26 and 2026-09-27
- Status: accepted

## Context

Audits on 2026-09-26 and 27 proposed things a larger product would have.

## Decision

Left out, for a personal site:

- Crash reports from visitors' browsers: a table, a public write path
  with abuse limits and a bot change aren't worth it. Each window's error
  boundary keeps a crash to that window, and crashes show only in the
  visitor's console.
- A review step for Stickies: posting is for members only, with a daily
  limit, and every new note reaches Jincheng on Telegram with Hide and
  Show again.
- A "continue playing" prompt for hidden tabs, more reduced-motion
  fallbacks, a spec template for changes, `llms.txt` in `robots.txt` (no
  crawler reads it there) and splitting the largest app components.
- The "Ask me" AI assistant is on hold.

## Consequences

- `knip` reports the documented one-off scripts (favicon, portrait, the
  reset email preview) as unused files, and the applet kit's types and
  test helpers as unused exports. They aren't dead code.
