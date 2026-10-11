import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC, "..");
const MAX_REDIRECTS = 6;
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY = 3;
const CONFIRMED_OFF_TOPIC_HOSTS = new Set(["lkgp.pro"]);

function localTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}+08:00`;
}

function isConfirmedOffTopic(url) {
  const host = new URL(url).hostname.toLowerCase();
  return [...CONFIRMED_OFF_TOPIC_HOSTS].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&#x2f;", "/").replaceAll("&#47;", "/");
}

function absoluteTarget(value, baseUrl) {
  try {
    const target = new URL(decodeHtml(value.trim()), baseUrl);
    return ["http:", "https:"].includes(target.protocol) ? target.href : null;
  } catch {
    return null;
  }
}

export function inspectRedirectHints(html, baseUrl) {
  const hints = [];
  const add = (kind, rawTarget) => {
    const target = absoluteTarget(rawTarget, baseUrl);
    if (target && !hints.some((hint) => hint.kind === kind && hint.target === target)) {
      hints.push({ kind, target, followed: false, confirmedOffTopic: isConfirmedOffTopic(target) });
    }
  };

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if ((attribute(tag, "http-equiv") || "").toLowerCase() !== "refresh") continue;
    const content = attribute(tag, "content") || "";
    const target = content.match(/(?:^|;)\s*url\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i);
    if (target) add("meta-refresh", target[1] ?? target[2] ?? target[3]);
  }

  const scriptPatterns = [
    ["javascript-location-assignment", /(?:window\s*\.\s*|document\s*\.\s*)?location(?:\s*\.\s*href)?\s*=\s*["']([^"']+)["']/gi],
    ["javascript-location-call", /(?:window\s*\.\s*)?location\s*\.\s*(?:assign|replace)\s*\(\s*["']([^"']+)["']\s*\)/gi],
  ];
  for (const [kind, pattern] of scriptPatterns) {
    for (const match of html.matchAll(pattern)) add(kind, match[1]);
  }

  if (/redirecting\s*,?\s*please wait/i.test(html)) {
    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = attribute(match[0], "href");
      if (href) add("redirect-page-link", href);
    }
  }
  return hints;
}

function errorDetails(error) {
  const code = error?.code || error?.cause?.code || null;
  const safeMessage = (value) => String(value || "").slice(0, 240)
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[redacted]@")
    .replace(/([?&](?:token|key|auth|session|password)=)[^&\s]*/gi, "$1[redacted]");
  const message = safeMessage(error?.message || error);
  const cause = error?.cause
    ? {
        name: String(error.cause.name || "Error").slice(0, 80),
        code: error.cause.code || null,
        message: safeMessage(error.cause.message),
      }
    : null;
  const isTls = Boolean(code && /CERT|TLS|SSL/i.test(code)) || /certificate|tls|ssl handshake/i.test(message);
  const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError" || code === "ETIMEDOUT";
  return {
    kind: isTls ? "tls-error" : isTimeout ? "timeout" : "network-error",
    code,
    message: message.slice(0, 240),
    ...(cause ? { cause } : {}),
  };
}

async function readBoundedBody(response, limit) {
  if (!response.body) return { html: "", bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  while (bytes < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limit - bytes;
    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(Buffer.from(chunk));
    bytes += chunk.byteLength;
    if (chunk.byteLength < value.byteLength) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  if (!truncated && bytes === limit) {
    truncated = true;
    await reader.cancel();
  }
  return { html: Buffer.concat(chunks).toString("utf8"), bytes, truncated };
}

function classifyStatus(status, html, hints) {
  if (hints.some((hint) => hint.confirmedOffTopic)) return "off-topic-navigation-hint";
  if (hints.length) return "content-navigation-hint";
  if ([401, 403, 407, 429].includes(status)) return "access-or-rate-limit-block";
  if (/sign in to continue|log in to continue|verify you are human|checking your browser|captcha/i.test(html)) {
    return "possible-auth-or-bot-challenge";
  }
  if (status >= 400) return "http-error";
  return "http-response";
}

export async function checkDestination(requestedUrl, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const chain = [];
  const seen = new Set();
  let current = requestedUrl;
  let response;

  try {
    if (!["http:", "https:"].includes(new URL(requestedUrl).protocol)) {
      return { requestedUrl, finalUrl: null, httpStatus: null, redirectChain: chain, contentRedirectHints: [], error: { kind: "unsupported-url-scheme", message: "Only HTTP and HTTPS destinations are audited." }, classification: "unsupported-url-scheme" };
    }
  } catch {
    return { requestedUrl, finalUrl: null, httpStatus: null, redirectChain: chain, contentRedirectHints: [], error: { kind: "invalid-url", message: "Destination is not a valid URL." }, classification: "invalid-url" };
  }

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (seen.has(current)) {
      return { requestedUrl, finalUrl: current, httpStatus: null, redirectChain: chain, contentRedirectHints: [], error: { kind: "redirect-loop", message: "Redirect loop detected." }, classification: "redirect-loop" };
    }
    seen.add(current);

    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "identity",
          "cache-control": "no-cache",
          "user-agent": "RadiantOptimizerLinkAudit/1.0 (+https://radiantoptimizerlist.com/)",
        },
      });
    } catch (error) {
      const detail = errorDetails(error);
      chain.push({ url: current, status: null, location: null, followed: false, error: detail.kind });
      return { requestedUrl, finalUrl: current, httpStatus: null, redirectChain: chain, contentRedirectHints: [], error: detail, classification: detail.kind };
    }

    const rawLocation = response.headers.get("location");
    let location = null;
    if (rawLocation) {
      try {
        location = new URL(rawLocation, current).href;
      } catch {
        if (response.body) await response.body.cancel();
        const item = { url: current, status: response.status, location: rawLocation, followed: false, stopReason: "invalid-redirect-target" };
        chain.push(item);
        return { requestedUrl, finalUrl: current, httpStatus: response.status, redirectChain: chain, contentRedirectHints: [], error: { kind: "invalid-redirect-target", message: "Redirect target is not a valid URL." }, classification: "invalid-redirect-target" };
      }
    }
    const item = { url: current, status: response.status, location, followed: false };
    chain.push(item);

    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      if (response.body) await response.body.cancel();
      if (!["http:", "https:"].includes(new URL(location).protocol)) {
        item.stopReason = "unsupported-redirect-scheme";
        return { requestedUrl, finalUrl: current, httpStatus: response.status, redirectChain: chain, contentRedirectHints: [], error: { kind: "unsupported-redirect-scheme", message: "Only HTTP and HTTPS redirect targets are followed." }, classification: "unsupported-redirect-scheme" };
      }
      if (isConfirmedOffTopic(location)) {
        item.stopReason = "confirmed-off-topic-target-not-fetched";
        return { requestedUrl, finalUrl: current, httpStatus: response.status, redirectChain: chain, contentRedirectHints: [], error: null, classification: "confirmed-off-topic-redirect" };
      }
      if (hop === maxRedirects) {
        item.stopReason = "redirect-limit";
        return { requestedUrl, finalUrl: current, httpStatus: response.status, redirectChain: chain, contentRedirectHints: [], error: { kind: "redirect-limit", message: `Stopped after ${maxRedirects} redirects.` }, classification: "redirect-limit" };
      }
      item.followed = true;
      current = location;
      continue;
    }

    let body = { html: "", bytes: 0, truncated: false };
    const contentType = response.headers.get("content-type") || "";
    if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      try {
        body = await readBoundedBody(response, maxResponseBytes);
      } catch (error) {
        const detail = errorDetails(error);
        return { requestedUrl, finalUrl: current, httpStatus: response.status, redirectChain: chain, contentRedirectHints: [], contentType, responseBytesCaptured: 0, bodyTruncated: false, error: detail, classification: detail.kind };
      }
    } else {
      if (response.body) await response.body.cancel();
    }
    const contentRedirectHints = inspectRedirectHints(body.html, current);
    const authEvidence = [401, 403, 407, 429].includes(response.status) || /sign in to continue|log in to continue|verify you are human|checking your browser|captcha/i.test(body.html);
    const classification = classifyStatus(response.status, body.html, contentRedirectHints);
    return {
      requestedUrl,
      finalUrl: current,
      httpStatus: response.status,
      redirectChain: chain,
      contentRedirectHints,
      contentType,
      responseBytesCaptured: body.bytes,
      bodyTruncated: body.truncated,
      authEvidence,
      error: null,
      classification,
    };
  }

  return { requestedUrl, finalUrl: current, httpStatus: null, redirectChain: chain, contentRedirectHints: [], error: { kind: "redirect-limit", message: "Redirect limit reached." }, classification: "redirect-limit" };
}

function loadRecords() {
  const source = JSON.parse(readFileSync(join(SRC, "data", "games.json"), "utf8"));
  const library = JSON.parse(readFileSync(join(SRC, "data", "library.json"), "utf8"));
  return [
    ...source.games.map((game) => ({ ...game, collection: "source" })),
    ...library.games.map((game) => ({ ...game, collection: "library" })),
  ];
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  }));
  return results;
}

function summarize(records) {
  const counts = {};
  for (const record of records) counts[record.classification] = (counts[record.classification] || 0) + 1;
  return counts;
}

function summarizeHttpStatus(records) {
  const counts = {};
  for (const record of records) {
    if (record.httpStatus !== null) counts[record.httpStatus] = (counts[record.httpStatus] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b)));
}

function markdownReport(report) {
  const counts = Object.entries(report.summary.classifications).map(([name, count]) => `- ${name}: ${count}`).join("\n");
  const statusCodes = Object.entries(report.summary.httpStatusCodes).map(([status, count]) => `- HTTP ${status}: ${count}`).join("\n") || "- No HTTP responses";
  const unresolved = report.records.filter((record) => ["missing-destination", "confirmed-off-topic-redirect", "off-topic-navigation-hint", "content-navigation-hint", "access-or-rate-limit-block", "possible-auth-or-bot-challenge", "http-error", "timeout", "tls-error", "network-error", "redirect-limit", "redirect-loop", "unsupported-redirect-scheme", "invalid-redirect-target"].includes(record.classification));
  const details = unresolved.length
    ? unresolved.map((record) => `- **${record.slug}** — ${record.classification}; requested: ${record.requestedUrl || "missing"}; status: ${record.httpStatus ?? "none"}; final response URL: ${record.finalUrl || "none"}${record.contentRedirectHints?.length ? `; content-level navigation hint target(s), not followed: ${record.contentRedirectHints.map((hint) => hint.target).join(", ")}` : ""}${record.error ? `; ${record.error.kind} (${record.error.code || "no code"}): ${record.error.message}${record.error.cause ? `; cause ${[record.error.cause.name, record.error.cause.code].filter(Boolean).join(" ")}: ${record.error.cause.message || ""}` : ""}` : ""}`).join("\n")
    : "- None reported by this bounded HTTP audit.";
  return `# External destination audit — ${report.auditDate}\n\nChecked at ${report.startedAt} through ${report.finishedAt} (Asia/Shanghai).\n\n## Scope and limits\n\n- ${report.summary.records} catalog records across both collections; ${report.summary.requested} known destinations requested; ${report.summary.missing} destinations have no URL in the current data.\n- Unauthenticated HTTP GET only, concurrency ${report.settings.concurrency}, ${report.settings.timeoutMs} ms per request, at most ${report.settings.maxRedirects} redirects, and ${report.settings.maxResponseBytes} response bytes inspected per HTML page. No scripts, game assets, or gameplay were executed.\n- HTTP codes describe the responses observed; they do not confirm a usable launcher, gameplay, safety, licensing, included files, or suitability. Off-topic lkgp.pro targets were recorded and not fetched.\n- Content-level meta/JavaScript/anchor navigation hints were recorded as hints only. Client-side behavior was not executed, and those hint targets do not establish that navigation occurred or imply a risk finding.\n\n## HTTP status codes\n\n${statusCodes}\n\n## Classifications\n\n${counts}\n\n## Unresolved or blocked cases\n\n${details}\n\nFull requested URLs, response statuses, final response URLs, followed HTTP redirect chains, content-level navigation hints, errors (including available cause codes/details), and per-record timestamps are in [link-audit-${report.auditDate}.json](./link-audit-${report.auditDate}.json).\n`;
}

export async function createAuditReport(records = loadRecords(), now = new Date()) {
  const startedAt = localTimestamp(now);
  const auditDate = startedAt.slice(0, 10);
  const audited = await mapWithConcurrency(records, CONCURRENCY, async (game) => {
    const requestedUrl = game.sourceUrl || game.historicalSourceUrl || null;
    const base = {
      slug: game.slug,
      name: game.name,
      collection: game.collection,
      requirement: game.requirement,
      launchDisabled: Boolean(game.launchDisabled),
      requestedUrl,
      checkedAt: null,
      httpStatus: null,
      finalUrl: null,
      redirectChain: [],
      contentRedirectHints: [],
      gameplayVerified: false,
      classification: requestedUrl ? null : "missing-destination",
    };
    if (!requestedUrl) return base;
    let result;
    try {
      result = await checkDestination(requestedUrl);
    } catch (error) {
      const detail = errorDetails(error);
      result = { requestedUrl, finalUrl: requestedUrl, httpStatus: null, redirectChain: [], contentRedirectHints: [], error: detail, classification: detail.kind };
    }
    return { ...base, ...result, checkedAt: localTimestamp(), gameplayVerified: false };
  });
  const finishedAt = localTimestamp();
  const summary = {
    records: records.length,
    requested: audited.filter((record) => record.requestedUrl).length,
    missing: audited.filter((record) => !record.requestedUrl).length,
    classifications: summarize(audited),
    httpStatusCodes: summarizeHttpStatus(audited),
  };
  return {
    schemaVersion: 1,
    auditDate,
    startedAt,
    finishedAt,
    scope: "Every current source-list and wider-library record; known sourceUrl or historicalSourceUrl only.",
    settings: { method: "GET", authenticated: false, concurrency: CONCURRENCY, timeoutMs: REQUEST_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS, maxResponseBytes: MAX_RESPONSE_BYTES, scriptsExecuted: false, gameplayTested: false, blockedOffTopicHosts: [...CONFIRMED_OFF_TOPIC_HOSTS] },
    summary,
    records: audited,
  };
}

async function main() {
  const records = loadRecords();
  const report = await createAuditReport(records);
  const docsDir = join(ROOT, "docs");
  mkdirSync(docsDir, { recursive: true });
  const jsonPath = join(docsDir, `link-audit-${report.auditDate}.json`);
  const markdownPath = join(docsDir, `link-audit-${report.auditDate}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, markdownReport(report));
  console.log(JSON.stringify({ auditDate: report.auditDate, summary: report.summary, jsonPath, markdownPath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
