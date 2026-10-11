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
node src/check-external-links.mjs  # bounded, unauthenticated destination audit
node src/check-reliability.mjs [--report docs/link-audit-2026-10-11.json]  # local regression checks
```

The external audit writes `docs/link-audit-<Asia/Shanghai date>.json` and `.md` for all catalog records. It uses GET requests only, limits concurrency to 3, each request to 10 seconds, follows at most 6 HTTP redirects, and inspects at most 256 KiB of HTML. HTTP status codes describe responses only. Off-topic `lkgp.pro` HTTP redirect targets and page-level navigation hints are recorded without fetching the target; hints are not executed and do not establish that browser navigation occurred. The audit does not execute page scripts, download game assets, test gameplay, or certify safety. `launchDisabled` is an explicit catalog decision and is never automatically set or cleared by an audit. Missing destinations and login, access, rate-limit, TLS, timeout and other unresolved responses remain explicit in the report.

`src/check-reliability.mjs` is local-only: it checks the catalog against the selected saved audit snapshot and runs bounded HTTP fixtures. By default it reads the snapshot date recorded in catalog `verification.checkedAt`; pass `--report <path>` to select another JSON snapshot. It does not contact catalog destinations.

## Deploy

Pushing to `main` on GitHub triggers a Cloudflare Workers Builds deployment
(build: `node src/build.mjs`, deploy: `npx wrangler deploy`) — no action needed.

Manual deploy from a checkout: `npx wrangler deploy` (requires `wrangler login`).
