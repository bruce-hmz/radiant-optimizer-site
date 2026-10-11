import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { checkDestination } from "./check-external-links.mjs";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC = join(ROOT, "public");
const source = JSON.parse(readFileSync(join(ROOT, "src/data/games.json"), "utf8"));
const library = JSON.parse(readFileSync(join(ROOT, "src/data/library.json"), "utf8"));
const records = [...source.games.map((game) => ({ ...game, collection: "source" })), ...library.games.map((game) => ({ ...game, collection: "library" }))];
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--report")) {
  throw new Error("Usage: node src/check-reliability.mjs [--report <path>]");
}
const checkedDates = new Set(records.map((game) => game.verification?.checkedAt).filter(Boolean));
if (checkedDates.size !== 1) throw new Error("Catalog verification fields must share one audit date to select the default snapshot");
const reportPath = resolve(ROOT, args.length === 2 ? args[1] : join("docs", `link-audit-${[...checkedDates][0]}.json`));
if (!existsSync(reportPath)) throw new Error(`Audit report not found: ${reportPath}`);

function expectedVerificationStatus(game, audit) {
  if (game.launchDisabled) return "link-disabled";
  if (["content-navigation-hint", "off-topic-navigation-hint"].includes(audit.classification)) return "content-navigation-hint";
  if (["possible-auth-or-bot-challenge", "access-or-rate-limit-block"].includes(audit.classification)) return "possible-access-challenge";
  if (["network-error", "tls-error"].includes(audit.classification)) return "network-error";
  if (audit.classification === "timeout") return "timeout";
  if (audit.classification === "missing-destination") return "missing-destination";
  if (audit.httpStatus !== null) return "http-response";
  throw new Error(`Cannot map audit classification ${audit.classification} for ${game.slug}`);
}

function tally(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function badgeLabel(game) {
  if (game.launchDisabled || game.verification.status === "link-disabled") return "Link disabled";
  if (["http-response", "content-navigation-hint"].includes(game.verification.status)) return "Page responded";
  if (game.verification.status === "possible-access-challenge") return "Access check needed";
  if (["network-error", "timeout"].includes(game.verification.status)) return "Check inconclusive";
  if (game.verification.status === "missing-destination") return "No link";
  throw new Error(`Unknown verification status ${game.verification.status} for ${game.slug}`);
}

function walkHtml(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkHtml(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

async function checkAuditFixtures() {
  const requestedPaths = [];
  const server = createServer((request, response) => {
    requestedPaths.push(request.url);
    if (request.url === "/chain") {
      response.writeHead(302, { location: "/plain" }).end();
    } else if (request.url === "/unsafe-scheme") {
      response.writeHead(302, { location: "file:///etc/passwd" }).end();
    } else if (request.url === "/plain") {
      response.writeHead(200, { "content-type": "text/html" }).end("<h1>Project page</h1>");
    } else if (request.url === "/meta") {
      response.writeHead(200, { "content-type": "text/html" }).end('<meta http-equiv="refresh" content="0;url=https://example.invalid/next">');
    } else if (request.url === "/js") {
      response.writeHead(200, { "content-type": "text/html" }).end("<script>window.location.replace('https://example.invalid/next')</script>");
    } else if (request.url === "/off-topic") {
      response.writeHead(200, { "content-type": "text/html" }).end('<p>Redirecting, please wait...</p><a href="https://lkgp.pro/path">continue</a>');
    } else if (request.url === "/off-topic-http") {
      response.writeHead(302, { location: "https://lkgp.pro/path" }).end();
    } else if (request.url === "/not-found") {
      response.writeHead(404, { "content-type": "text/html" }).end("missing");
    } else if (request.url === "/slow") {
      setTimeout(() => response.writeHead(200, { "content-type": "text/html" }).end("late"), 250);
    } else if (request.url === "/large") {
      response.writeHead(200, { "content-type": "text/html" }).end(`<p>${"x".repeat(2048)}</p>`);
    } else {
      response.writeHead(500).end("unexpected fixture path");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const guardedFetch = (url, options) => {
    assert.ok(url.startsWith(base), `fixture attempted an external request: ${url}`);
    return fetch(url, options);
  };
  try {
    const chain = await checkDestination(`${base}/chain`, { fetchImpl: guardedFetch });
    assert.deepEqual(chain.redirectChain.map((item) => item.status), [302, 200]);
    assert.equal(chain.redirectChain[0].followed, true);
    const unsafe = await checkDestination(`${base}/unsafe-scheme`, { fetchImpl: guardedFetch });
    assert.equal(unsafe.classification, "unsupported-redirect-scheme");
    assert.equal(requestedPaths.filter((path) => path === "/unsafe-scheme").length, 1);
    const meta = await checkDestination(`${base}/meta`, { fetchImpl: guardedFetch });
    assert.equal(meta.contentRedirectHints[0]?.kind, "meta-refresh");
    assert.equal(meta.contentRedirectHints[0]?.followed, false);
    const js = await checkDestination(`${base}/js`, { fetchImpl: guardedFetch });
    assert.equal(js.contentRedirectHints[0]?.kind, "javascript-location-call");
    const offTopic = await checkDestination(`${base}/off-topic`, { fetchImpl: guardedFetch });
    assert.equal(offTopic.classification, "off-topic-navigation-hint");
    assert.equal(offTopic.contentRedirectHints[0]?.confirmedOffTopic, true);
    assert.equal(offTopic.contentRedirectHints[0]?.followed, false);
    assert.equal(requestedPaths.filter((path) => path === "/off-topic").length, 1);
    const offTopicHttp = await checkDestination(`${base}/off-topic-http`, { fetchImpl: guardedFetch });
    assert.equal(offTopicHttp.classification, "confirmed-off-topic-redirect");
    assert.equal(offTopicHttp.redirectChain[0]?.followed, false);
    assert.equal(offTopicHttp.redirectChain[0]?.stopReason, "confirmed-off-topic-target-not-fetched");
    let cancelFetches = 0;
    await assert.rejects(checkDestination("https://fixture.invalid/start", {
      fetchImpl: async () => {
        cancelFetches += 1;
        return { status: 302, headers: new Headers({ location: "https://example.invalid/next" }), body: { cancel: async () => { throw new Error("fixture body cancel failure"); } } };
      },
    }), /fixture body cancel failure/);
    assert.equal(cancelFetches, 1, "failed body release must be observable and stop redirect following");
    const notFound = await checkDestination(`${base}/not-found`, { fetchImpl: guardedFetch });
    assert.equal(notFound.httpStatus, 404);
    assert.equal(notFound.classification, "http-error");
    const timeout = await checkDestination(`${base}/slow`, { fetchImpl: guardedFetch, timeoutMs: 30 });
    assert.equal(timeout.classification, "timeout");
    const bounded = await checkDestination(`${base}/large`, { fetchImpl: guardedFetch, maxResponseBytes: 32 });
    assert.equal(bounded.responseBytesCaptured, 32);
    assert.equal(bounded.bodyTruncated, true);
    const tls = await checkDestination("https://fixture.invalid/", {
      fetchImpl: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("self-signed certificate"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }) }); },
    });
    assert.equal(tls.classification, "tls-error");
    assert.equal(tls.error.cause.code, "DEPTH_ZERO_SELF_SIGNED_CERT");
    const network = await checkDestination("https://fixture.invalid/", {
      fetchImpl: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("request https://user:secret@example.invalid/?token=secret failed"), { code: "ENOTFOUND" }) }); },
    });
    assert.equal(network.classification, "network-error");
    assert.equal(network.error.code, "ENOTFOUND");
    assert.equal(network.error.cause.code, "ENOTFOUND");
    assert.doesNotMatch(network.error.cause.message, /secret/);
    console.log("audit fixtures: HTTP vs content hints, off-topic block, errors/causes, timeout, TLS, redirect chain and response bound passed");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const buildSource = readFileSync(join(ROOT, "src/build.mjs"), "utf8");
  const launchGuardSource = buildSource.match(/function isLaunchDisabled\(g\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(launchGuardSource, "build must define the shared launch-state guard");
  const isLaunchDisabled = runInNewContext(`(${launchGuardSource})`);
  assert.equal(isLaunchDisabled({ launchDisabled: true, verification: { status: "link-disabled" } }), true);
  assert.equal(isLaunchDisabled({ launchDisabled: false, verification: { status: "http-response" } }), false);
  assert.throws(() => isLaunchDisabled({ launchDisabled: false, verification: { status: "link-disabled" } }), /Conflicting launchDisabled and verification.status/);
  assert.match(buildSource, /for \(const game of games\) isLaunchDisabled\(game\)/);
  assert.match(buildSource, /const openBlock = launchDisabled/);
  assert.match(buildSource, /!isLaunchDisabled\(g\).*sameAs/s);
  assert.equal(records.length, 67);
  assert.equal(report.summary.records, records.length);
  assert.equal(report.records.length, records.length);
  assert.equal(new Set(report.records.map((record) => record.slug)).size, records.length);
  assert.equal(report.settings.gameplayTested, false);
  assert.ok(report.records.every((record) => record.gameplayVerified === false));
  assert.deepEqual([...report.records.map((record) => record.slug)].sort(), [...records.map((record) => record.slug)].sort());
  assert.deepEqual(report.summary.classifications, tally(report.records.map((record) => record.classification)));
  assert.deepEqual(report.summary.httpStatusCodes, tally(report.records.filter((record) => record.httpStatus !== null).map((record) => record.httpStatus)));
  assert.equal(report.summary.missing, records.filter((record) => !(record.sourceUrl || record.historicalSourceUrl)).length);
  assert.ok(report.records.filter((record) => record.requestedUrl).every((record) => record.checkedAt && record.redirectChain.length > 0));
  for (const audit of report.records) {
    assert.ok(audit.contentRedirectHints.every((hint) => hint.followed === false), `${audit.slug} content navigation must not be executed`);
    if (audit.classification === "off-topic-navigation-hint") assert.ok(audit.contentRedirectHints.some((hint) => hint.confirmedOffTopic), `${audit.slug} off-topic hint classification needs target evidence`);
    if (audit.classification === "network-error") assert.ok(audit.error?.code, `${audit.slug} network error should retain a concrete error code`);
    if (audit.error?.cause?.code) assert.equal(audit.error.code, audit.error.cause.code, `${audit.slug} cause code should be retained`);
  }

  const disabled = ["moon-zombies", "kino-der-toten", "cheese-cube"];
  const htmlFiles = walkHtml(PUBLIC);
  const publicHtml = htmlFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.ok(!/href=["']https?:\/\/lkgp\.pro(?:\/|["'])/i.test(publicHtml), "off-topic lkgp.pro destination must not be a generated link");
  for (const slug of disabled) {
    const game = source.games.find((entry) => entry.slug === slug);
    const page = readFileSync(join(PUBLIC, "games", `${slug}.html`), "utf8");
    assert.equal(game.requirement, "setup");
    assert.equal(game.launchDisabled, true);
    assert.equal(game.verification.status, "link-disabled");
    assert.equal(game.verification.checkedAt, report.auditDate);
    assert.ok(page.includes("Launch link disabled"));
    assert.ok(page.includes(`Checked ${formatDate(game.verification.checkedAt)}; HTTP ${game.verification.httpStatus}; off-topic navigation hints appeared in the response HTML and were not followed. Gameplay not tested.`));
    assert.ok(page.includes("Project status / evidence:"));
    assert.ok(!/redirected to unrelated|the supplied destination was disabled after an off-topic redirect/i.test(page));
    assert.ok(!page.includes(`href="${game.sourceUrl}"`));
    assert.ok(!page.includes(`"sameAs":"${game.sourceUrl}"`));
    assert.ok(!htmlFiles.some((file) => readFileSync(file, "utf8").includes(`href="${game.sourceUrl}"`)), `${slug} destination must not be linked anywhere in generated HTML`);
    assert.ok(!game.howToOpen.some((step) => /^\s*(?:open|play|launch)\b/i.test(step)));
  }
  assert.equal(source.games.filter((game) => game.launchDisabled).length, 3);
  assert.ok(source.games.every((game) => readFileSync(join(PUBLIC, "games", `${game.slug}.html`), "utf8").includes(game.name)));

  for (const game of records) {
    const audit = report.records.find((record) => record.slug === game.slug);
    const page = readFileSync(join(PUBLIC, "games", `${game.slug}.html`), "utf8");
    assert.equal(audit.requirement, game.requirement, `${game.slug} requirement must match the selected snapshot`);
    assert.equal(Boolean(audit.launchDisabled), Boolean(game.launchDisabled), `${game.slug} launch disable must remain an explicit data decision`);
    assert.ok(game.verification?.status && game.verification.checkedAt, `${game.slug} must have structured verification evidence`);
    assert.equal(game.verification.checkedAt, audit.checkedAt?.slice(0, 10) || report.auditDate);
    assert.equal(game.verification.status, expectedVerificationStatus(game, audit), `${game.slug} verification must match the selected snapshot and launch policy`);
    assert.equal(game.verification.httpStatus, audit.httpStatus ?? undefined, `${game.slug} HTTP status must match the selected snapshot`);
    const expectedErrorCode = ["network-error", "tls-error"].includes(audit.classification) ? audit.error?.code : undefined;
    assert.equal(game.verification.errorCode, expectedErrorCode, `${game.slug} network error code must match the selected snapshot`);
    assert.ok(page.includes("Verification status") && page.includes("Gameplay not tested."), `${game.slug} detail must display scope-limited verification`);
    assert.ok(page.includes(`<strong>Project status / evidence:</strong> ${escapeHtml(game.statusNote)}`), `${game.slug} project-specific status note must remain visible`);
    assert.ok(page.includes(`class="badge verification`) && page.includes(`>${badgeLabel(game)}</span>`), `${game.slug} detail badge missing`);
    if (audit.httpStatus !== null) assert.ok(page.includes(`HTTP response ${audit.httpStatus}`) || page.includes(`HTTP ${audit.httpStatus};`), `${game.slug} exact HTTP status missing`);
    if (["network-error", "tls-error"].includes(audit.classification) && audit.error?.code) assert.ok(page.includes(audit.error.code), `${game.slug} transport code missing`);
    if (game.launchDisabled) assert.ok(page.includes("Link disabled"));
  }
  const home = readFileSync(join(PUBLIC, "index.html"), "utf8");
  assert.equal((home.match(/class="badge verification verify-disabled">Link disabled<\/span>/g) || []).length, disabled.length);
  const cards = home.match(/<article class="card"[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, source.games.length, "original-list cards must render for all source records");
  for (const game of source.games) {
    const card = cards.find((entry) => entry.includes(escapeHtml(game.name)));
    assert.ok(card?.includes(`>${badgeLabel(game)}</span>`), `${game.slug} card must show a clear player-facing status`);
    assert.ok(card.includes(`Checked ${formatDate(game.verification.checkedAt)}`) || card.includes(`Catalog checked ${formatDate(game.verification.checkedAt)}`), `${game.slug} card must show its check date`);
    assert.ok(!/HTTP \d{3}|page hint|challenge\?/i.test(card), `${game.slug} card should keep technical evidence out of the main status`);
  }
  const reportMarkdown = readFileSync(join(ROOT, "docs", `link-audit-${report.auditDate}.md`), "utf8");
  assert.ok(reportMarkdown.includes("confirmed mismatches relative to the listed games"));
  assert.ok(reportMarkdown.includes("did not assess the target site's specific business"));
  assert.match(reportMarkdown, /seven other entries/i);

  const noDownload = readFileSync(join(PUBLIC, "browser-games/no-download/index.html"), "utf8");
  assert.ok(noDownload.includes("No extra files listed"));
  assert.ok(noDownload.includes("does not mean the destination is reachable"));
  assert.ok(!/start instantly|open the link, press start, play/i.test(noDownload));
  assert.ok(!/play right now|That Start Instantly|playable instantly/i.test(publicHtml));
  for (const game of records.filter((entry) => entry.requirement === "ready")) {
    const page = readFileSync(join(PUBLIC, "games", `${game.slug}.html`), "utf8");
    assert.ok(page.includes("No extra files listed"), `${game.slug} requirement label missing`);
    assert.ok(page.includes("Project status / evidence:"), `${game.slug} evidence label missing`);
  }
  assert.ok(htmlFiles.length > 0);

  await checkAuditFixtures();
  console.log(`catalog checks: ${records.length} records match ${report.auditDate} snapshot at ${reportPath}; ${disabled.length} disabled cards, verification dates/statuses, requirements and preserved project notes passed`);
}

await main();
