# radiant-optimizer-site

PlayVault — a browser games directory built around the @RadiantOpti browser-games
list. 89 static pages: hub, 10 genre pages, 67 game pages, 5 guides,
about/privacy/contact, plus sitemap / robots / 404. No npm dependencies; the
build script uses Node built-ins only.

Live: https://radiantoptimizerlist.com

## Layout

- `src/build.mjs` — generates everything into `public/`
- `src/data/` — games + library data (edit these to add/remove entries)
- `src/content/` — guide articles (HTML fragments)
- `src/assets/` — stylesheet + client JS (copied verbatim by the build)
- `public/` — generated output; `public/assets/shots/` holds real screenshots
  captured by `src/shoot.mjs` and survives rebuilds
- `src/worker.js` — Cloudflare Worker: serves static assets, 301s www → apex

## Local workflow

```bash
node src/build.mjs        # rebuild public/
node src/serve.mjs        # local preview
node src/checklinks.mjs   # verify internal links + sitemap
```

## Deploy

Pushing to `main` on GitHub triggers a Cloudflare Workers Builds deployment
(build: `node src/build.mjs`, deploy: `npx wrangler deploy`) — no action needed.

Manual deploy from a checkout: `npx wrangler deploy` (requires `wrangler login`).
