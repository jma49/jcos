---
title: JM/OS
description: "This site: a Mac OS X–style desktop in the browser, with accounts, chat and a guestbook on Supabase."
date: 2026-09
status: live
order: 3
stack: [Astro, React, TypeScript, Supabase, Vercel]
repo: https://github.com/jma49/jmos
cover: ../covers/majincheng-com.jpg
capture: /
demo: https://www.majincheng.com
---

This site is JM/OS: a Mac OS X–style desktop that runs in the browser. My résumé, projects and photos are apps you open from the Dock. Around them is a working desktop: windows you can drag, stack, minimize with the Genie effect and spread out with Exposé, plus Spotlight, a Dashboard and screen savers. There are also things to do together with whoever else is here: a chat room, a guestbook, and AirDrop between visitors.

It started from [ryOS](https://github.com/ryokun6/ryos), whose icons, fonts and desktop pictures it uses. Everything else is written for this site, and it's open source under the AGPL.

## How it's built

The page is one Astro route with a single React island. All content is assembled at build time: the text, the project pages and a snapshot of my Unsplash photos. For visitors without JavaScript, and for crawlers, the same content ships as plain HTML.

- **The window manager** is a small zustand store: a map of windows and a stacking order. Windows render in the order they opened and stack with `z-index`, because moving DOM nodes would reload an embedded video.
- **Apps are data.** Each app is one entry in a registry: name, icon, sizes, where it appears, and a lazily imported component. The Dock, Spotlight, the Terminal, Finder and `/?open=` links all read from it, so adding an app is one entry.
- **Each window is isolated.** If an app throws, or its code is gone after a deploy, only its own window shows the error, and the rest of the desktop keeps working.
- **The desktop follows the visitor's world.** The sky tints the wallpaper with the time of day and the weather where they are. The accent colour is sampled from the desktop picture, and the menu bar's text turns white or black depending on what's behind it.

## The backend

Accounts, the chat room, the guestbook and presence run on Supabase. The browser only holds the public key, so the database enforces every rule:

- row-level security with column-level grants on every table;
- private data (recovery addresses, reset tokens) in a schema the API can't reach;
- per-member limits (three guestbook notes a day, a chat flood guard) that take an advisory lock first. Before that, six notes sent at once all got through a "three a day" check.

A test suite runs about fifty of these rules against a real Postgres in CI, and races concurrent sessions against every limit. New notes and messages reach me on Telegram with a button to hide them, and the same bot publishes my Soapbox posts.

## Performance

A desktop full of apps can still load like a page:

- about 155 KB of JavaScript (gzipped) on a first visit, under a 160 KB budget, with every app loaded only when it's opened;
- 0.95 MB of images, down from 2.2 MB after I found the desktop picture being downloaded twice;
- dragging a window with six apps open went from 640 ms of script to 210 ms, once only the dragged window re-rendered.

These are budgets, and `npm run perf` checks them in a real browser.

## Testing

Every pull request is type-checked, unit-tested and built. Then a browser opens every app in the production build and fails on any error. Game rules (Spider Solitaire, and a Pinball table played by bots) and the Telegram bot have unit tests of their own.
