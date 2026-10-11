# External destination audit — 2026-10-11

## Packet progress

- **2026-10-11 13:51:34 +08:00 — inventory and contract review complete.** 25 source-list records plus 42 wider-library records; 65 current URLs and 2 missing destinations in the data. Three Pages.dev URLs were retained as historical inputs, each still has `requirement: setup`, and each now has an explicit `launchDisabled` marker. Their detail instructions no longer tell readers to open or play the links.
- **2026-10-11 13:54:13–13:54:53 +08:00 — external audit complete.** `process-run` startup: `entry_id=ca3535e54c7e4df096805537ddd62c5d`, PID `57310`, owner `Luna-link-reliability`, purpose `external-link-audit`. Completion summary: `SUCCESS`, exit code 0, `output_complete=true`, summary PID `57311`. Private logs: [stdout.log](../.codex-adaptive-agents/processes/fdea02d523e1467a99e7bbc158c322ad/ca3535e54c7e4df096805537ddd62c5d/stdout.log) and [stderr.log](../.codex-adaptive-agents/processes/fdea02d523e1467a99e7bbc158c322ad/ca3535e54c7e4df096805537ddd62c5d/stderr.log). Results: 62 HTTP 200 responses (51 plain response pages, 7 other pages with navigation hints, 1 possible access challenge and 3 off-topic navigation-hint pages), 2 network failures with concrete codes `ENOTFOUND` and `ECONNRESET`, 1 timeout and 2 missing URLs. No gameplay was tested. The saved errors have no nested `cause` data; the audit code now retains sanitized cause fields when the runtime supplies them. **Next:** complete generated verification labels and run build/internal/focused checks.
- **2026-10-11 13:59:26 +08:00 — report language tightened after review.** The three off-topic destinations are confirmed mismatches relative to their listed games and remain disabled. Their page-level hints were not executed or followed; the target sites' specific business was not assessed. Seven other entries contain ordinary page navigation hints; those do not establish that navigation occurred or constitute a risk conclusion. The saved transport errors retain `ENOTFOUND` and `ECONNRESET`; no cause object was available in that run. The audit was not rerun. **Next:** verify status-code and catalog evidence mapping.
- **2026-10-11 14:09:02 +08:00 — verification UI, snapshot-aware regression and build checks complete.** All 67 records now carry verification status/date data independent of requirements. Cards use player-facing labels (`Page responded`, `Access check needed`, `Check inconclusive`, `Link disabled`, `No link`) plus a short dated scope note; detail pages retain project notes and show exact HTTP evidence. `check-reliability.mjs` defaults to the snapshot date recorded in catalog data and accepts `--report <path>`; snapshot status counts are derived dynamically and local fixtures cover navigation classification and error causes. Build produced 89 pages; `checklinks` scanned 90 pages / 3,712 internal links with 0 broken; focused checks passed both default and explicit snapshot paths; syntax and `git diff --check` passed. No full external audit was rerun. **Next:** leaf stops writing; parent performs final diff acceptance and process-batch cleanup.

Checked at 2026-10-11T13:54:13+08:00 through 2026-10-11T13:54:53+08:00 (Asia/Shanghai).

## Scope and limits

- 67 catalog records across both collections; 65 known destinations requested; 2 destinations have no URL in the current data.
- Unauthenticated HTTP GET only, concurrency 3, 10000 ms per request, at most 6 redirects, and 262144 response bytes inspected per HTML page. No scripts, game assets, or gameplay were executed.
- HTTP codes describe only the response observed; they do not confirm a usable launcher, gameplay, safety, licensing, included files, or suitability. The run recorded 62 HTTP 200 responses and no 3xx, 4xx or 5xx status. lkgp.pro targets in page content were recorded but not fetched.

## Classifications

- http-response: 51
- off-topic-navigation-hint: 3
- network-error: 2
- possible-auth-or-bot-challenge: 1
- missing-destination: 2
- content-navigation-hint: 7
- timeout: 1

## HTTP status codes

- HTTP 200: 62
- No 3xx, 4xx or 5xx response status was observed in this run.

## Confirmed destination mismatches — link disabled

These three destinations are confirmed mismatches relative to the listed games. Each returned HTTP 200 with off-topic navigation instructions in its response HTML, so its launch link is disabled. The audit did not execute JavaScript or follow/fetch the target, did not observe an automatic jump, and did not assess the target site's specific business.

- **moon-zombies** — off-topic-navigation-hint; requested: https://moon-zombies.pages.dev/; status: 200; final response URL: https://moon-zombies.pages.dev/; content target(s), not followed: https://lkgp.pro/0aff63bc, https://lkgp.pro/0aff63bc, https://lkgp.pro/0aff63bc
- **kino-der-toten** — off-topic-navigation-hint; requested: https://kino-der-toten.pages.dev/; status: 200; final response URL: https://kino-der-toten.pages.dev/; content target(s), not followed: https://lkgp.pro/0aff63bc, https://lkgp.pro/0aff63bc, https://lkgp.pro/0aff63bc
- **cheese-cube** — off-topic-navigation-hint; requested: https://cheese-cube.pages.dev/; status: 200; final response URL: https://cheese-cube.pages.dev/; content target(s), not followed: https://lkgp.pro/0aff63bc, https://lkgp.pro/0aff63bc, https://lkgp.pro/0aff63bc

## Other unresolved or blocked cases

Seven other entries contain page-level meta/JavaScript/anchor navigation hints in the retrieved HTML. The hints were not executed or followed, so they do not establish that navigation occurred or support a risk conclusion. There is no observation of an actual automatic jump for these entries.
- **black-ops-2-vibe-slops** — network-error (`ENOTFOUND`); requested: https://vibeslops.luckeysystems.com/; status: none; final response URL: https://vibeslops.luckeysystems.com/; fetch failed. The saved record has no nested cause details.
- **modern-warfare-2** — possible-auth-or-bot-challenge; requested: https://ovz-game-production.up.railway.app/; status: 200; final response URL: https://ovz-game-production.up.railway.app/
- **skate-rust** — missing-destination; requested: missing; status: none; final response URL: none
- **halo-ce** — content-navigation-hint; requested: https://mitchellhynes.com/halo; status: 200; final response URL: https://mitchellhynes.com/halo/; content-level hint target: https://mitchellhynes.com/halo/halo.html (not followed)
- **gta-5** — timeout; requested: https://web.archive.org/web/20261006055917/https://playgta5.com/; status: none; final response URL: https://web.archive.org/web/20261006055917/https://playgta5.com/; timeout: The operation was aborted due to timeout
- **simpsons-hit-and-run** — network-error (`ECONNRESET`); requested: https://shar-wasm.cjoseph.workers.dev/?skipmovie; status: none; final response URL: https://shar-wasm.cjoseph.workers.dev/?skipmovie; fetch failed. The saved record has no nested cause details.
- **quake** — content-navigation-hint; requested: https://q1.pieter.com/; status: 200; final response URL: https://q1.pieter.com/; content-level hint target: https://q1.pieter.com/play (not followed)
- **quake-2** — content-navigation-hint; requested: https://q2.pieter.com/; status: 200; final response URL: https://q2.pieter.com/; content-level hint target: https://q2.pieter.com/play (not followed)
- **quake-3** — content-navigation-hint; requested: https://q3.pieter.com/; status: 200; final response URL: https://q3.pieter.com/; content-level hint target: https://q3.pieter.com/game2/game?host=q3.pieter.com&proxyPort=443&fs_game=baseq3&name= (not followed)
- **return-to-castle-wolfenstein** — content-navigation-hint; requested: https://rtcw.pieter.com/; status: 200; final response URL: https://rtcw.pieter.com/; content-level hint target: https://rtcw.pieter.com/play?name= (not followed)
- **urban-terror** — content-navigation-hint; requested: https://ut.pieter.com/; status: 200; final response URL: https://ut.pieter.com/; content-level hint target: https://ut.pieter.com/play?name= (not followed)
- **half-life-pixelsuft** — content-navigation-hint; requested: https://pixelsuft.github.io/hl/; status: 200; final response URL: https://pixelsuft.github.io/hl/; content-level hint targets: https://github.com/FWGS/xash3d/, https://pixelsuft.github.io/hl/xash.html# (not followed)
- **hedgewars-webwars** — missing-destination; requested: missing; status: none; final response URL: none

Full requested URLs, response statuses, final response URLs, followed HTTP redirect chains, content-level navigation hints, errors and per-record timestamps are in [link-audit-2026-10-11.json](./link-audit-2026-10-11.json). The initial fetch failures exposed top-level transport codes only; their original runtime errors did not include a saved cause object, so cause detail cannot be recovered without rerunning those requests.
- **2026-10-11 14:16:23 +08:00 — bounded final closeout complete.** Restored comma-space formatting for source arrays, removing unrelated library array churn; confirmed mismatched destinations are described separately from seven unexecuted navigation hints. Build guard now rejects disagreement between manual `launchDisabled` and `verification.status`, and all launch-related outputs share that guard. Redirect response bodies are released before following redirects, and release failures remain visible. `node src/build.mjs` built 89 pages; `node src/checklinks.mjs` scanned 90 pages / 3,712 internal links with 0 broken; `node src/check-reliability.mjs` and the explicit `--report docs/link-audit-2026-10-11.json` invocation both passed for all 67 records and local fixtures; JSON parsing and `git diff --check` passed. One initial focused assertion failed on capitalization in the report; its case-insensitive check now passes. No external audit was rerun. Parent reports the previously closed process batch was independently checked and cleaned: `CLEAN`, no active entries; this closeout did not use that batch. **Next:** leaf stops writing; parent performs final acceptance.
