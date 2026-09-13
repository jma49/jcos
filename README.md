# Jincheng Ma — Portfolio

Personal site. Astro + React islands + Tailwind, static output, English at `/` and
Chinese at `/zh/`.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
npm run preview
```

## Where things live

- `src/i18n/content.ts` — every string on the site, in both languages. Copy edits
  happen here, not in the components.
- `src/components/` — one `.astro` file per section; `react/` holds the only
  client-side island (`CopyEmail`).
- `src/styles/global.css` — Tailwind 4 `@theme` tokens (colors, fonts) and the
  `.shell` / `.label` / `.reveal` utilities the sections share.
- `public/Jincheng_Ma_Resume.pdf` — linked from the nav, hero and contact card.

Adding a language means adding a key to `content` and a page under `src/pages/`.

## Derived images

Both live in `public/` and are checked in; regenerate only when the source
photo or the card design changes.

```bash
# public/portrait.jpg — 4:5 crop of the full-resolution source frame
node scripts/build-portrait.mjs /path/to/CA_00355.JPG

# public/og.png — 1200x630 share card
# 1. serve the repo:  python3 -m http.server 4399
# 2. open scripts/og-card.html, let the fonts load, screenshot the window
# 3. crop + downsample the screenshot:
node scripts/build-og.mjs /path/to/screenshot.png

# public/favicon.ico + favicon-32x32.png + apple-touch-icon.png
node scripts/build-favicon.mjs
```

`scripts/og-card.html` scales its 1200x630 artboard to the window width and pins
it to the viewport origin, so `build-og.mjs` can take the full-width top slice of
any screenshot without measuring anything.
