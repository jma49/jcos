---
title: majincheng.com
description: This site. A bilingual personal page built with Astro that ships almost no JavaScript.
date: 2026-09
status: live
stack: [Astro, TypeScript, Tailwind CSS, Vercel]
repo: https://github.com/jma49/Jincheng-Protafolio
cover: ../covers/majincheng-com.png
demo: https://majincheng.com
---

I wanted a personal site that reads like a page rather than a dashboard, and that stays easy to update as I add projects.

## Design

The layout follows [leerob.com](https://leerob.com): one serif reading face, a 600px text column, and an illustration pinned beside it on wide screens. There is no navigation bar, no hero section and no card grid. The bio has a short and a long version, and experience details stay collapsed until you open them.

## Content

Both languages live in one TypeScript file, so the English and Chinese pages always have the same structure. Projects are Markdown files with typed frontmatter, and each one gets its own page in both languages.

## Performance

- No client-side framework on the page. The theme toggle, bio switch and copy button are a few lines of inline script.
- The illustration is served as AVIF or WebP at the width each screen needs, about 18 KB on a phone.
- The Chinese web font loads only on Chinese pages, and only where the system has no Chinese serif.

## Deployment

Vercel builds every push. Pull requests get a preview URL, and merging to `main` updates the live site.
