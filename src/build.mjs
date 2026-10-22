import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = __dirname;
const OUT = join(__dirname, "..", "public");

/* ------------------------------------------------------------------ */
/*  Clean generated output                                             */
/*  The build owns every HTML page, but NOT public/assets/shots: those  */
/*  are real screenshots captured separately by src/shoot.mjs and must  */
/*  survive a rebuild. Clearing the generated paths stops a renamed or  */
/*  removed page (e.g. a retired genre folder) from lingering as a      */
/*  stale duplicate that would still be deployed and indexed.           */
/*  Best effort: some sandboxes block file deletion, so a failure here  */
/*  is a warning, not a crash.                                          */
/* ------------------------------------------------------------------ */
const GENERATED_DIRS = ["browser-games", "games", "guides"];
const GENERATED_FILES = ["index.html", "404.html", "about.html", "privacy.html", "contact.html", "sitemap.xml", "robots.txt", "ads.txt", "favicon.svg"];
let cleaned = true;
try {
  for (const d of GENERATED_DIRS) rmSync(join(OUT, d), { recursive: true, force: true });
  for (const f of GENERATED_FILES) rmSync(join(OUT, f), { force: true });
} catch {
  cleaned = false;
}

/* ------------------------------------------------------------------ */
/*  CONFIG — edit these before you deploy                              */
/* ------------------------------------------------------------------ */
const CONFIG = {
  // Domain name written out. This site is the list, not the Windows product.
  siteName: "Radiant Optimizer List",
  mark: "RL",
  tagline: "Browser game projects, sorted by requirements and status",
  baseUrl: "https://radiantoptimizerlist.com",
  sourcePostUrl: "https://x.com/RadiantOpti/status/2108068628793082338",
  sourceReplyUrl: "https://x.com/RadiantOpti/status/2108068632991256995",
  // Official product site only. Leave antivirus empty until a real offer exists.
  affiliateAntivirus: "",
  affiliateRadiant: "https://radiantoptimizer.com/",
  // GA4 web-stream measurement ID (G-…). Read from the environment so it is
  // configured per deploy (Cloudflare Workers Builds variable) instead of
  // being hardcoded. When empty the build emits no analytics markup at all.
  ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || "",
  // AdSense publisher client (ca-pub-…). Same pattern as GA4: environment
  // first, empty → no ad loader in <head>, no ads.txt, and the privacy page
  // keeps its accurate "no ads" wording. Ads only ever display after Google
  // approves the site AND placements/auto ads are enabled in the account.
  // The first US-region account (pub-1367977665012576) was closed on
  // 2026-10-12; this default is the re-registered China-region account.
  adsenseClient: process.env.ADSENSE_CLIENT || "ca-pub-7087310872799317",
  // Plausible Analytics script URL (privacy-friendly pageview counting; the
  // account's proxy host serves the script, so no adblock-vs-domain churn).
  // Cookieless, so like Adsterra it sits outside Consent Mode and loads on
  // its own. Environment-first like GA4/AdSense; empty → no Plausible markup.
  plausibleScriptUrl:
    process.env.PLAUSIBLE_SCRIPT_URL ||
    "https://plausible.zombiecouplevideo.pro/js/pa-rp3GZF6PSoNRdBaI2jErO.js",
};
/* ------------------------------------------------------------------ */

// Join the base URL and a path with exactly one slash, so that a baseUrl
// without a trailing slash never produces "https://hostassets/...".
const abs = (p) => `${String(CONFIG.baseUrl).replace(/\/+$/, "")}/${String(p).replace(/^\/+/, "")}`;

// Public path matching the live host: index.html → `/`, dir/index.html → `/dir/`,
// page.html → `/page` (no extension, no trailing slash).
function publicPath(file) {
  let p = String(file || "").replace(/\\/g, "/");
  if (p === "" || p === "/" || p === "index.html") return "/";
  p = p.replace(/^\/+/, "");
  if (p.endsWith("/index.html")) return `/${p.slice(0, -"index.html".length)}`;
  if (p.endsWith(".html")) return `/${p.slice(0, -".html".length)}`;
  return `/${p}`;
}

function applyPartners(html) {
  let out = html.replaceAll("#partner-radiant", CONFIG.affiliateRadiant || "#partner-radiant");
  if (CONFIG.affiliateAntivirus) {
    out = out.replaceAll("#partner-antivirus", CONFIG.affiliateAntivirus);
  } else {
    out = out.replace(/<p>\s*<a\b[^>]*href="#partner-antivirus"[^>]*>[\s\S]*?<\/a>\s*<\/p>\s*/g, "");
    out = out.replace(/<a\b[^>]*href="#partner-antivirus"[^>]*>[\s\S]*?<\/a>/g, "");
  }
  return out;
}

// Normalise once so every `${CONFIG.baseUrl}/path` template below is safe
// whether or not the operator typed a trailing slash.
CONFIG.baseUrl = String(CONFIG.baseUrl).replace(/\/+$/, "");

// A malformed measurement ID must never reach the page: it would load a
// broken tag into every page head. Warn and build analytics-free instead.
CONFIG.ga4MeasurementId = String(CONFIG.ga4MeasurementId).trim();
if (CONFIG.ga4MeasurementId && !/^G-[A-Z0-9]{6,}$/.test(CONFIG.ga4MeasurementId)) {
  console.warn(`  WARNING: GA4_MEASUREMENT_ID "${CONFIG.ga4MeasurementId}" is not a valid measurement ID (expected G-XXXXXXXXXX); building without analytics.`);
  CONFIG.ga4MeasurementId = "";
}

// Same guard for the AdSense publisher ID — a malformed ca-pub would inject
// a broken ad loader into every page and break the AdSense site review.
CONFIG.adsenseClient = String(CONFIG.adsenseClient).trim();
if (CONFIG.adsenseClient && !/^ca-pub-\d{8,}$/.test(CONFIG.adsenseClient)) {
  console.warn(`  WARNING: ADSENSE_CLIENT "${CONFIG.adsenseClient}" is not a valid publisher ID (expected ca-pub-XXXXXXXXXXXXXXXX); building without AdSense code.`);
  CONFIG.adsenseClient = "";
}

// Same guard for the Plausible script URL — a malformed URL would inject a
// dead script tag into every page head.
CONFIG.plausibleScriptUrl = String(CONFIG.plausibleScriptUrl || "").trim();
if (CONFIG.plausibleScriptUrl && !/^https:\/\/[^/]+\/js\/[\w.-]+\.js$/.test(CONFIG.plausibleScriptUrl)) {
  console.warn(`  WARNING: PLAUSIBLE_SCRIPT_URL "${CONFIG.plausibleScriptUrl}" is not a valid script URL (expected https://host/js/name.js); building without Plausible.`);
  CONFIG.plausibleScriptUrl = "";
}

const sourceData = JSON.parse(readFileSync(join(SRC, "data", "games.json"), "utf8"));
const libraryData = JSON.parse(readFileSync(join(SRC, "data", "library.json"), "utf8"));
const SOURCE = sourceData.games.map((g) => ({ ...g, collection: "source" }));
const LIBRARY = libraryData.games.map((g) => ({ ...g, collection: "library" }));
const games = [...SOURCE, ...LIBRARY];
const bySlug = Object.fromEntries(games.map((g) => [g.slug, g]));

function isLaunchDisabled(g) {
  const manualMarker = Boolean(g.launchDisabled);
  const verificationMarker = g.verification?.status === "link-disabled";
  if (manualMarker !== verificationMarker) {
    throw new Error(`Conflicting launchDisabled and verification.status for ${g.slug}`);
  }
  return manualMarker;
}

for (const game of games) isLaunchDisabled(game);

const hostOf = (g) => {
  if (g.host) return g.host;
  if (!g.sourceUrl) return "no destination";
  try {
    return new URL(g.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};

const REQ = {
  ready: { cls: "req-ready", label: "No extra files listed" },
  files: { cls: "req-files", label: "Bring your own files" },
  setup: { cls: "req-setup", label: "Check setup first" },
  archive: { cls: "req-archive", label: "Archive snapshot" },
  unavailable: { cls: "req-unavailable", label: "Link withheld" },
};

const COLLECTIONS = {
  source: { label: "From the list", hint: "Shared by @RadiantOpti on 8 Oct 2026" },
  library: { label: "Wider library", hint: "Independently collected browser ports" },
};

// Parent-keyword hubs. Each group maps to one or more categories.
const GROUPS = [
  {
    slug: "shooter-classics",
    name: "Classic & retro shooters",
    cats: [],
    title: "Classic and retro shooters in your browser",
    lede: "Doom, Duke Nukem, Wolfenstein and the N64 split-screen era, all running in a tab.",
    intro:
      "This is the oldest end of the browser shooter scene, and the most reliable. Doom, The Ultimate Doom, Duke Nukem 3D and Wolfenstein 3D run from genuine DOS executables inside a browser DOS environment, so the original behaviour is preserved rather than approximated. Alongside them sit the N64 and SNES clean-room builds, GoldenEye 007, Perfect Dark, Doom 64, Star Fox 64 and Duke Nukem: Zero Hour, which reconstruct the original console code instead of emulating a cartridge. Freedoom and OpenTyrian are the two entries here with entirely free assets, so nothing has to be supplied by you. None of these need an account, and all of them work as single-player.",
  },
  {
    slug: "shooter-online",
    name: "Online multiplayer shooters",
    cats: [],
    title: "Online multiplayer shooters in your browser",
    lede: "Quake, Half-Life and Counter-Strike projects that put you on a live server from a browser tab.",
    intro:
      "These entries are about playing against other people. The Quake family, Return to Castle Wolfenstein, Urban Terror and the two Half-Life and Counter-Strike builds all connect to live servers, and several of them are the same family of projects hosted under different addresses. Latency matters more here than anywhere else in the library, so expect the experience to depend on your connection and on how far the server is from you. CS Surf is the outlier: it drops the shooting in favour of movement, and it is one of the quickest entries to get into.",
  },
  {
    slug: "shooter-hosts",
    name: "Fan-hosted modern shooters",
    cats: [],
    title: "Fan-hosted modern shooters in your browser",
    lede: "Community hosts for Call of Duty and Halo entries, with the caveats stated up front.",
    intro:
      "This group is different from the rest of the library: these are community hosts for modern titles rather than self-contained ports, and they stream data to you as you play. Several of them were unreachable or unverified when we last checked, so read each status note before you invest an evening. Halo CE Mobile asks for your own disc data, and the Call of Duty zombie entries are single-map projects rather than full games. Treat this group as the most experimental part of the directory, and expect some links to come and go.",
  },
  {
    slug: "sandbox",
    name: "Sandbox & building",
    cats: ["Sandbox"],
    title: "Browser sandbox games",
    lede: "Voxel building, open-world driving and everything in between, running in a browser tab.",
    intro:
      "Sandbox games are the easiest genre to try in a browser because most of them start immediately. Minecraft Classic is Mojang's own free browser build, Eaglercraft is a community client, and Craft is a small open-source voxel game with free assets. The Grand Theft Auto entries are a different story: Vice City expects a game archive you build yourself, and the GTA 5 link in the original list only survives as a web archive.",
  },
  {
    slug: "platformer",
    name: "Platformer",
    cats: ["Platformer"],
    title: "Browser platformer games",
    lede: "Precision jumping from 1989 to the N64 era, rebuilt to run in a tab.",
    intro:
      "Platformers translate unusually well to the browser because they need a keyboard and almost nothing else. PrinceJS reimplements the original Prince of Persia in HTML5, sm64js is a JavaScript port built from the Super Mario 64 decompilation, and Sonic the Hedgehog 2 and Banjo-Kazooie arrive as clean-room builds. Most of these run at full speed on a laptop that would struggle to emulate the same hardware.",
  },
  {
    slug: "action-adventure",
    name: "Action & adventure",
    cats: ["Action", "Action-adventure", "Adventure", "RPG"],
    title: "Browser action and adventure games",
    lede: "Exploration-driven classics, dungeon crawlers and point-and-click adventures.",
    intro:
      "This group covers the slower, longer games: Ocarina of Time and Super Metroid for exploration, Castlevania: Symphony of the Night for action, Diablo for dungeon crawling, and Beneath a Steel Sky for point-and-click adventure. They are the entries most likely to ask for your own game files, so check the requirement badge before you start.",
  },
  {
    slug: "strategy",
    name: "Strategy & simulation",
    cats: ["Strategy", "Simulation"],
    title: "Browser strategy and simulation games",
    lede: "Real-time strategy, transport tycoons and park builders, without a launcher.",
    intro:
      "Strategy and simulation games are the ones that quietly eat entire afternoons. Red Alert runs from a browser DOS build with a multiplayer lobby, Chrono Divide recreates Red Alert 2, OpenTTD ships with free graphics so nothing is missing, and OpenRCT2 supplies the engine while expecting the original RollerCoaster Tycoon 2 data from a copy you own.",
  },
  {
    slug: "racing",
    name: "Racing",
    cats: ["Racing"],
    title: "Browser racing games",
    lede: "Kart racing, anti-gravity speed and DOS-era stunt driving, in a browser tab.",
    intro:
      "This group spans four eras now. The N64 clean-room builds, Mario Kart 64, F-Zero X, Diddy Kong Racing and Wave Race 64, are the strongest of them, and a gamepad makes a noticeable difference because input latency is what browser racing has historically struggled with. Open Skyways reconstructs the engine behind the 1993 arcade racer SkyRoads with its own thirty courses. Stunts and Wacky Wheels are genuine DOS builds from 1990 and 1994, emulated in the tab, with Wacky Wheels including its own battle mode. SuperTuxKart is the outlier: an open-source kart racer compiled to WebAssembly that wants a 120 MB download and roughly 500 MB of memory, so check your connection before you start it.",
  },
  {
    slug: "sports",
    name: "Sports",
    cats: ["Sports"],
    title: "Browser sports games",
    lede: "Snowboarding, skating and football classics, ported to run in a browser tab.",
    intro:
      "Sports ports are the most likely to ask for your own data, because the original games shipped with licensed asset libraries that cannot be redistributed: Skate 3 streams from a converted copy you make yourself, and PES 6 documents keyboard, gamepad and touch controls. Not everything here works that way. 1080° Snowboarding is a clean-room N64 build that regenerates its own textures, and International Sensible Soccer is the 1994 DOS game running in a browser DOS environment with nothing to supply. Read the requirement badge first, because it varies more in this group than in any other.",
  },
  {
    slug: "arcade",
    name: "Arcade & fighting",
    cats: ["Arcade", "Fighting", "Collection"],
    title: "Browser arcade and fighting games",
    lede: "Short-session arcade action, party and one-on-one fighters, and collection directories.",
    intro:
      "The arcade end of the library is where you find games you can finish in a coffee break. Super Smash Bros. is the quickest to pick up, Open Cadet is an open-source arcade shooter, and Open Digger rebuilds the 1983 maze-digger with eight new mazes and free assets. Mortal Kombat arrives as the 1993 DOS build with its original roster, though that build opens with the manual-based copy-protection word check, so you need the manual or the answer before you reach the character select screen. One entry is not a single game at all: WASM Arcade is a directory that leads to more projects, so treat it as a jumping-off point rather than a title.",
  },
];
const GROUP_OF = {};
for (const grp of GROUPS) for (const c of grp.cats) GROUP_OF[c] = grp;

// "Shooter" is 28 of 58 entries, far too broad for one page. Instead of one
// oversized group, those entries are assigned to three intent-based sub-groups
// by explicit slug override. Everything else still resolves by category.
const SUBGROUP = {
  // Classic DOS and retro PC shooters, plus the console clean-room builds.
  "doom-1993": "shooter-classics",
  "the-ultimate-doom": "shooter-classics",
  "doom-mod-collection": "shooter-classics",
  "duke-nukem-3d": "shooter-classics",
  "wolfenstein-3d": "shooter-classics",
  "freedoom": "shooter-classics",
  "opentyrian": "shooter-classics",
  "goldeneye-007": "shooter-classics",
  "perfect-dark": "shooter-classics",
  "doom-64": "shooter-classics",
  "star-fox-64": "shooter-classics",
  "duke-nukem-zero-hour": "shooter-classics",
  // Live online multiplayer projects.
  quake: "shooter-online",
  "quake-2": "shooter-online",
  "quake-3": "shooter-online",
  "return-to-castle-wolfenstein": "shooter-online",
  "urban-terror": "shooter-online",
  "cs-surf": "shooter-online",
  "half-life-pixelsuft": "shooter-online",
  "half-life-cs16-webxash": "shooter-online",
  // Community hosts for modern titles.
  "black-ops-zombies": "shooter-hosts",
  "moon-zombies": "shooter-hosts",
  "kino-der-toten": "shooter-hosts",
  "cheese-cube": "shooter-hosts",
  "black-ops-2-vibe-slops": "shooter-hosts",
  "modern-warfare-2": "shooter-hosts",
  "halo-ce": "shooter-hosts",
  "halo-ce-mobile": "shooter-hosts",
};

const groupOf = (g) =>
  SUBGROUP[g.slug] ? GROUPS.find((x) => x.slug === SUBGROUP[g.slug]) : GROUP_OF[g.category];
const gamesInGroup = (grp) => games.filter((g) => groupOf(g) === grp);

const GUIDES = [
  {
    slug: "how-to-use-the-list",
    title: "How to use the browser games list",
    description:
      "A plain-English walkthrough of the list shared by @RadiantOpti: what the four entry types mean and how to start a first session safely.",
    kicker: "Getting started",
    file: "how-to-use-the-list.html",
    nav: "howto",
  },
  {
    slug: "browser-ports-explained",
    title: "Browser ports explained: decompilation, emulation and clean-room builds",
    description:
      "Why some browser projects need no extra files and others ask you to supply game data. The four kinds of browser port, how they differ, and why links break so often.",
    kicker: "Background",
    file: "browser-ports-explained.html",
    nav: "howto",
  },
  {
    slug: "troubleshooting",
    title: "Browser game won't load? Troubleshooting guide",
    description:
      "Fix the most common failures in browser game projects: missing game data, blank canvas, certificate warnings, unresponsive controls and lost progress.",
    kicker: "Fix it",
    file: "troubleshooting.html",
    nav: "fix",
  },
  {
    slug: "is-it-safe",
    title: "Is the browser games list safe?",
    description:
      "Two separate questions answered: whether the browser game projects are safe to open, and whether the Radiant Optimizer utility is legitimate.",
    kicker: "Safety",
    file: "is-it-safe.html",
    nav: "safe",
  },
  {
    slug: "radiant-optimizer-review",
    title: "Radiant Optimizer review: what it does and who should skip it",
    description:
      "An independent look at the $57.77 one-time Windows tuning tool: what it actually changes, what it cannot do, and whether it is worth it.",
    kicker: "Review",
    file: "radiant-optimizer-review.html",
    nav: "review",
  },
];

/* ---------------- helpers ---------------- */

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const reqBadge = (r) => {
  const m = REQ[r] || REQ.setup;
  return `<span class="badge ${m.cls}">${esc(m.label)}</span>`;
};

function verificationLabel(g) {
  const verification = g.verification;
  if (!verification?.status || !verification.checkedAt) {
    throw new Error(`Missing verification status or date for ${g.slug}`);
  }
  if (isLaunchDisabled(g)) return "Link disabled";
  if (verification.status === "http-response" || verification.status === "content-navigation-hint") return "Page responded";
  if (verification.status === "possible-access-challenge") return "Access check needed";
  if (verification.status === "network-error" || verification.status === "timeout") return "Check inconclusive";
  if (verification.status === "missing-destination") return "No link";
  throw new Error(`Unknown verification status "${verification.status}" for ${g.slug}`);
}

function verificationDate(g) {
  const verification = g.verification;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${verification.checkedAt}T00:00:00Z`));
}

function verificationEvidence(g) {
  const verification = g.verification;
  const date = verificationDate(g);
  let observation;
  if (isLaunchDisabled(g)) {
    observation = `HTTP ${verification.httpStatus}; off-topic navigation hints appeared in the response HTML and were not followed`;
  } else if (verification.status === "http-response") {
    observation = `HTTP response ${verification.httpStatus}`;
  } else if (verification.status === "content-navigation-hint") {
    observation = `HTTP response ${verification.httpStatus}; page navigation hints were recorded but not followed`;
  } else if (verification.status === "possible-access-challenge") {
    observation = `HTTP response ${verification.httpStatus}; possible access or bot challenge`;
  } else if (verification.status === "network-error") {
    observation = `network error${verification.errorCode ? ` (${verification.errorCode})` : ""}; no HTTP response confirmed`;
  } else if (verification.status === "timeout") {
    observation = "request timed out; no HTTP response confirmed";
  } else if (verification.status === "missing-destination") {
    observation = "no destination URL was available, so no HTTP request was made";
  } else {
    throw new Error(`Unknown verification status "${verification.status}" for ${g.slug}`);
  }
  const dateLabel = verification.status === "missing-destination" ? "Catalog checked" : "Checked";
  return `${dateLabel} ${date}; ${observation}. Gameplay not tested.`;
}

function verificationCardNote(g) {
  const verification = g.verification;
  const date = verificationDate(g);
  const dateLabel = verification.status === "missing-destination" ? "Catalog checked" : "Checked";
  const scope = isLaunchDisabled(g)
    ? "off-topic page content; link withheld"
    : ["network-error", "timeout"].includes(verification.status)
      ? "no response confirmed"
      : verification.status === "missing-destination"
        ? "no destination URL to check"
        : verification.status === "possible-access-challenge"
          ? "page response only; access unclear"
          : "page response only";
  return `${dateLabel} ${date}; ${scope}. Gameplay not tested.`;
}

function verificationBadge(g) {
  const status = g.verification?.status;
  const cls = isLaunchDisabled(g)
    ? "verify-disabled"
    : ["network-error", "timeout", "missing-destination", "possible-access-challenge"].includes(status)
      ? "verify-unconfirmed"
      : "verify-http";
  return `<span class="badge verification ${cls}">${esc(verificationLabel(g))}</span>`;
}

const write = (relPath, content) => {
  const full = join(OUT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  return relPath;
};

/* ---------------- cover art ---------------- */

const PALETTE = {
  Shooter: ["#3b1220", "#e24b4a", "#f7c1c1"],
  Sports: ["#0d2b23", "#1d9e75", "#9fe1cb"],
  Sandbox: ["#1b2a10", "#639922", "#c0dd97"],
  RPG: ["#241c47", "#7f77dd", "#cecbf6"],
  Strategy: ["#0c2440", "#378add", "#b5d4f4"],
  Racing: ["#3a2606", "#ba7517", "#fac775"],
  Platformer: ["#3a1027", "#d4537e", "#f4c0d1"],
  Action: ["#3a1808", "#d85a30", "#f5c4b3"],
  "Action-adventure": ["#241c47", "#7f77dd", "#cecbf6"],
  Fighting: ["#3b1220", "#e24b4a", "#f7c1c1"],
  Simulation: ["#0d2b23", "#1d9e75", "#9fe1cb"],
  Arcade: ["#3a2606", "#ba7517", "#fac775"],
  Adventure: ["#0c2440", "#378add", "#b5d4f4"],
  Puzzle: ["#1e232b", "#888780", "#d3d1c7"],
  Collection: ["#1e232b", "#888780", "#d3d1c7"],
};

const initialsOf = (name) => {
  const stop = new Set(["the", "of", "a", "and", "in", "on", "for", "to", "your"]);
  const words = String(name)
    .replace(/[^\w\s'&:-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !stop.has(w.toLowerCase()));
  const pick = words.length >= 2 ? [words[0], words[1]] : [words[0] || name];
  return pick.map((w) => w[0]).join("").toUpperCase().slice(0, 2);
};

function coverSvg(g) {
  const [bg, mid, light] = PALETTE[g.category] || PALETTE.Collection;
  const ini = initialsOf(g.name);
  const rings = [0, 1, 2, 3]
    .map(
      (i) =>
        `<circle cx="960" cy="250" r="${90 + i * 78}" fill="none" stroke="${mid}" stroke-opacity="${(0.32 - i * 0.06).toFixed(2)}" stroke-width="1.5"/>`
    )
    .join("");
  const bars = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i) => {
      const h = 70 + ((i * 47) % 130);
      return `<rect x="${i * 160 - 40}" y="${720 - h}" width="52" height="${h}" fill="${mid}" fill-opacity="0.16"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${mid}" stop-opacity="0.16"/>
<stop offset="1" stop-color="${bg}" stop-opacity="0"/>
</linearGradient>
</defs>
<rect width="1280" height="720" fill="${bg}"/>
${bars}
${rings}
<rect x="0" y="0" width="1280" height="720" fill="url(#g)"/>
<text x="72" y="196" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="200" font-weight="800" fill="${mid}" fill-opacity="0.9" letter-spacing="-6">${esc(ini)}</text>
<text x="72" y="300" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="34" font-weight="600" fill="${light}" fill-opacity="0.75">${esc(g.category)}</text>
<rect x="72" y="336" width="96" height="4" fill="${mid}"/>
<text x="72" y="640" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="52" font-weight="700" fill="#ffffff" fill-opacity="0.94">${esc(g.name.length > 30 ? g.name.slice(0, 29) + "…" : g.name)}</text>
<text x="72" y="684" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="24" fill="${light}" fill-opacity="0.6">${esc(hostOf(g))}</text>
</svg>`;
}

const shotPath = (slug) => join(OUT, "assets", "shots", `${slug}.jpg`);
// Captures that only show a loading spinner or a bot-check wall. Fall back to cover art.
const SHOT_SKIP = new Set(["prince-of-persia", "modern-warfare-2", "simpsons-hit-and-run"]);
const hasShot = (slug) => !SHOT_SKIP.has(slug) && existsSync(shotPath(slug));

/* ---------------- chrome ---------------- */

const ICON_SEARCH = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const ICON_WARN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>`;

function header(active) {
  const nav = [
    ["/#directory", "Directory", "directory"],
    ["/browser-games/", "Browser games", "browser"],
    ["/guides/how-to-use-the-list", "How to use", "howto"],
    ["/guides/is-it-safe", "Is it safe?", "safe"],
    ["/guides/radiant-optimizer-review", "Radiant review", "review"],
  ];
  return `<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/"><span class="mark">${esc(CONFIG.mark)}</span><span class="name">${esc(CONFIG.siteName)}</span></a>
    <nav class="nav">${nav
      .map(([href, label, key]) => `<a href="${href}"${key === active ? ' style="color:var(--text)"' : ""}>${label}</a>`)
      .join("")}</nav>
  </div>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h5>${esc(CONFIG.siteName)}</h5>
        <p class="disclaimer">${esc(CONFIG.tagline)}. An independent directory of the browser-game projects shared by @RadiantOpti, plus a wider library. This site is not the Radiant Optimizer product, and it is not affiliated with its seller, the projects listed, or their publishers.</p>
        <a href="/about">About</a>
        <a href="/privacy">Privacy</a>
        <a href="/contact">Contact &amp; corrections</a>
      </div>
      <div>
        <h5>Browse</h5>
        <a href="/browser-games/">Browser games</a>
        <a href="/browser-games/no-download/">No download needed</a>
        <a href="/#directory">Original list</a>
      </div>
      <div>
        <h5>Genres</h5>
        ${GROUPS.slice(0, 6)
          .map((g) => `<a href="${publicPath(`browser-games/${g.slug}/index.html`)}">${esc(g.name)}</a>`)
          .join("")}
      </div>
      <div>
        <h5>Guides</h5>
        ${GUIDES.map((g) => `<a href="${publicPath(`guides/${g.slug}.html`)}">${esc(g.title.split(":")[0])}</a>`).join("")}
      </div>
    </div>
    <div class="footer-bottom">
      <p class="disclaimer">We link to original project destinations only. We do not host, mirror or provide game files, and we do not offer copies of commercial games. Projects marked "Bring your own files" expect data from a game you legally own. Screenshots are captured from the linked projects for identification purposes and remain the property of their creators. Never bypass a browser certificate warning, and never download an unfamiliar executable to play a browser game.</p>
    <p class="disclaimer" style="margin-top:12px">Source-list metadata reviewed ${esc(sourceData.source.checkedDate)}. Destination evidence is per entry and can change without notice.</p>
    </div>
  </div>
</footer>`;
}

// GA4 head snippet. Everything is queued in dataLayer before gtag.js loads.
// Consent Mode v2 starts fully denied; a stored "granted" choice is replayed
// synchronously so returning visitors keep full measurement, and
// assets/analytics.js offers new visitors an accept/decline banner. Ad
// signals stay denied for Google-managed measurement; the third-party
// banner strip in the layout is outside Consent Mode and loads on its own.
function ga4Head() {
  const id = CONFIG.ga4MeasurementId;
  if (!id) return "";
  return `<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
try{if(localStorage.getItem('rol-consent')==='granted')gtag('consent','update',{analytics_storage:'granted'});}catch(e){}
gtag('js',new Date());gtag('config','${id}');
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`;
}

// Plausible head snippet, kept verbatim from the Plausible dashboard (the
// init stub is the vendor's own queue shim). Cookieless pageview counting,
// so it needs no consent banner and is not gated by analytics.js.
function plausibleHead() {
  const url = CONFIG.plausibleScriptUrl;
  if (!url) return "";
  return `<!-- Privacy-friendly analytics by Plausible -->
<script async src="${esc(url)}"></script>
<script>
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()
</script>`;
}

// Third-party display banners (Adsterra snippets served from bauval.org),
// kept verbatim from the network's code. The 22/… pair reads the global
// `atOptions` and document.writes its iframe at the exact spot it occupies,
// so it must stay inline in the body — it cannot be injected after load.
// Rendered once per page in the layout's ad strip; noindex pages (404) stay
// ad-free, mirroring the AdSense guard.
const PARTNER_ADS = [
  {
    label: "adsterra 300x250 iframe",
    html: `<script>
  atOptions = {
    'key' : '8ea38e399c1e1a8bcb507c6a0d3c396d',
    'format' : 'iframe',
    'height' : 250,
    'width' : 300,
    'params' : {}
  };
</script>
<script src="https://bauval.org/22/8ea38e399c1e1a8bcb507c6a0d3c396d"></script>`,
  },
  {
    label: "adsterra container banner",
    html: `<script async="async" data-cfasync="false" src="https://bauval.org/21/f9fc95e67239e9ef9f34fb8a2a20eecd"></script>
<div id="container-f9fc95e67239e9ef9f34fb8a2a20eecd"></div>`,
  },
];

function adStrip() {
  if (!PARTNER_ADS.length) return "";
  return `<aside class="ad-strip wrap">
  <span class="ad-label">Advertisement</span>
  <div class="ad-row">
    ${PARTNER_ADS.map((ad) => `<div class="ad-slot">\n${ad.html}\n</div>`).join("\n    ")}
  </div>
</aside>`;
}

function layout({ title, description, canonical, active, body, jsonLd, image, robots }) {
  const isNoindex = Boolean(robots && robots.includes("noindex"));
  const ogImage = image || (!isNoindex ? imgSrc(SOURCE[0]) : "");
  const allowAds = Boolean(CONFIG.adsenseClient && !isNoindex);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(canonical)}">
${robots ? `<meta name="robots" content="${esc(robots)}">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="${esc(CONFIG.siteName)}">
${ogImage ? `<meta property="og:image" content="${abs(ogImage)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b0d12">
<link rel="stylesheet" href="/assets/style.css">
${ga4Head()}
${plausibleHead()}
${allowAds ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CONFIG.adsenseClient}" crossorigin="anonymous"></script>` : ""}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body>
<a class="sr-only" href="#main">Skip to content</a>
${header(active)}
<main id="main">
${body}
</main>
${!isNoindex ? adStrip() : ""}
${footer()}
<script src="/assets/app.js" defer></script>
${CONFIG.ga4MeasurementId ? `<script src="/assets/analytics.js" defer></script>` : ""}
</body>
</html>`;
}

/* ---------------- index ---------------- */

const catsOf = (list) => ["All", ...Array.from(new Set(list.map((g) => g.category))).sort()];
const cats = catsOf(games);
const imgSrc = (g) => (hasShot(g.slug) ? `/assets/shots/${g.slug}.jpg` : `/assets/covers/${g.slug}.svg`);
const imgAlt = (g) =>
  hasShot(g.slug) ? `Screenshot of ${g.name} running in a browser` : `Cover image for ${g.name}`;

function card(g) {
  const href = publicPath(`games/${g.slug}.html`);
  const search = [g.name, g.altName, g.category, g.device, g.summary, hostOf(g)].join(" ").toLowerCase();
  return `<article class="card" data-cat="${esc(g.category)}" data-dev="${esc(g.device)}" data-col="${g.collection}" data-search="${esc(search)}">
  <a class="thumb" href="${href}" aria-hidden="true" tabindex="-1">
    <img src="${imgSrc(g)}" alt="${esc(imgAlt(g))}" loading="lazy" width="1280" height="720">
    ${g.collection === "source" ? '<span class="pin">From the list</span>' : ""}
  </a>
  <div class="card-body">
    <div class="card-top">
      <span class="badge cat">${esc(g.category)}</span>
      ${reqBadge(g.requirement)}
      ${verificationBadge(g)}
    </div>
    <h3><a href="${href}">${esc(g.name)}</a></h3>
    <p>${esc(g.summary)}</p>
    <p class="verification-note">${esc(verificationCardNote(g))}</p>
    <div class="card-foot">
      <span class="badge dev">${esc(g.device)}</span>
      <a class="go" href="${href}">Details &rarr;</a>
    </div>
  </div>
</article>`;
}

const homeBody = `
<section class="hero">
  <div class="wrap">
    <span class="eyebrow">Updated ${esc(sourceData.source.checkedDate)}</span>
    <h1>The <span class="grad">Radiant Optimizer</span> browser games list, sorted and explained</h1>
    <p class="lede">In October 2026 the @RadiantOpti account shared a graphic of classic games described as browser projects, followed by a reply with project links. This page keeps the original ${SOURCE.length} entries, their available destinations and requirements, plus a real screenshot where one could be captured. The wider library of ${LIBRARY.length} other browser ports has its own page.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="#directory">Browse the original ${SOURCE.length}</a>
      <a class="btn btn-ghost" href="/browser-games/">Full library (${games.length})</a>
    </div>
    <div class="hero-stats">
      <div class="stat"><b>${games.length}</b><span>projects listed</span></div>
      <div class="stat"><b>${SOURCE.length}</b><span>from the original list</span></div>
      <div class="stat"><b>${LIBRARY.length}</b><span>in the wider library</span></div>
      <div class="stat"><b>${cats.length - 1}</b><span>categories</span></div>
    </div>
    <div class="notice">
      ${ICON_WARN}
      <div><strong>Not a download page.</strong> Available project links lead to third-party sites. We do not host game files, and projects marked "Bring your own files" expect data from a game you legally own. Requirements and destination evidence are separate; neither confirms gameplay.</div>
    </div>
  </div>
</section>

<section id="directory">
  <div class="wrap">
    <h2 class="sec">The original list</h2>
    <p class="sec-lede">The ${SOURCE.length} projects from the @RadiantOpti thread. Filter by category or device, or search by name. Each card shows a real screenshot where we could capture one, and what the project needs before you open it.</p>

    <div class="toolbar">
      <div class="search-box">
        ${ICON_SEARCH}
        <input id="game-search" type="search" placeholder="Search the original list, e.g. Quake, Skate, zombies..." aria-label="Search the original list">
      </div>
      <div class="filters">
        <span class="label">Category</span>
        ${catsOf(SOURCE).map((c) => `<button class="chip${c === "All" ? " active" : ""}" data-group="cat" data-value="${esc(c)}">${esc(c)}</button>`).join("")}
      </div>
      <div class="filters">
        <span class="label">Device</span>
        ${["All", "Desktop", "Mobile"].map((d) => `<button class="chip${d === "All" ? " active" : ""}" data-group="dev" data-value="${esc(d)}">${esc(d)}</button>`).join("")}
      </div>
      <p class="result-count" id="result-count">${SOURCE.length} projects shown</p>
    </div>

    <div class="grid" id="game-grid">
      ${SOURCE.map((g) => card(g)).join("\n      ")}
    </div>
  </div>
</section>

<section id="library">
  <div class="wrap">
    <h2 class="sec">The wider library is a separate page</h2>
    <p class="sec-lede">${LIBRARY.length} more browser ports were not on the original graphic: DOS classics, clean-room builds and open-source engines. They are listed with the original ${SOURCE.length} on the library page, which you can filter by collection.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="/browser-games/">Open the full library</a>
      <a class="btn btn-ghost" href="/guides/how-to-use-the-list">How to use the list</a>
    </div>
  </div>
</section>

<section id="entry-types">
  <div class="wrap">
    <h2 class="sec">How to read the badges</h2>
    <p class="sec-lede">The badges describe listed setup and file requirements. A separate project status note records what is known about each destination; it does not certify gameplay.</p>
    <div class="entry-types">
      <div class="etype"><h4>${reqBadge("ready")}</h4><p>No extra game files or installer are listed as requirements. The destination may still be unavailable, and gameplay is not implied.</p></div>
      <div class="etype"><h4>${reqBadge("setup")}</h4><p>Requirements or setup need checking. Use project instructions only if its destination is available.</p></div>
      <div class="etype"><h4>${reqBadge("files")}</h4><p>Expects data converted from a game you legally own. Browser access does not include those files.</p></div>
      <div class="etype"><h4>${reqBadge("archive")} ${reqBadge("unavailable")}</h4><p>An archive is historical context; an unavailable entry has no launch link. Neither indicates current gameplay.</p></div>
    </div>
  </div>
</section>

<section id="source">
  <div class="wrap">
    <h2 class="sec">Start with the original source</h2>
    <p class="sec-lede">We follow the thread rather than paraphrasing it. Compare the names in the graphic with the destinations they actually lead to.</p>
    <div class="link-cards">
      <a class="link-card" href="${CONFIG.sourcePostUrl}" target="_blank" rel="nofollow noopener">
        <span class="k">Original post &middot; ${esc(sourceData.source.postDate)}</span>
        <h4>The browser-games graphic</h4>
        <p>The image that started the search spike, shared by @RadiantOpti.</p>
      </a>
      <a class="link-card" href="${CONFIG.sourceReplyUrl}" target="_blank" rel="nofollow noopener">
        <span class="k">Links reply</span>
        <h4>The project links</h4>
        <p>The follow-up reply carrying the destinations the first collection is built from.</p>
      </a>
    </div>
  </div>
</section>

<section id="guides">
  <div class="wrap">
    <h2 class="sec">Guides</h2>
    <p class="sec-lede">Everything the list does not tell you.</p>
    <div class="link-cards">
      ${GUIDES.map(
        (g) => `<a class="link-card" href="${publicPath(`guides/${g.slug}.html`)}">
        <span class="k">${esc(g.kicker)}</span>
        <h4>${esc(g.title)}</h4>
        <p>${esc(g.description)}</p>
      </a>`
      ).join("\n      ")}
    </div>
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <h2 class="sec">Radiant Optimizer list: common questions</h2>
    <p class="sec-lede">Answers about the 25 original links, disabled hosts, file requirements and the Windows utility.</p>
    <div class="faq">
${[
  {
    q: "Where is the Radiant Optimizer full games list and links?",
    a: "The original Radiant Optimizer list shared by @RadiantOpti on 8 October 2026 contains 25 browser game links, all preserved in the directory above with their recorded destination domains, setup requirements and verification notes. A wider library of 42 additional browser ports (67 projects in total) is available on the Browser Games page.",
  },
  {
    q: "Why are some Radiant Optimizer game links disabled or not loading?",
    a: "Each entry points to an independent third-party host that can change or go offline. In our 11 October 2026 check, Moon Zombies (moon-zombies.pages.dev), Kino der Toten (kino-der-toten.pages.dev) and BO3 Cheese Cube (cheese-cube.pages.dev) returned off-topic navigation hints in their HTML, so their launch links are disabled here. Black Ops 2 / Vibe Slops (vibeslops.luckeysystems.com) and The Simpsons: Hit & Run (shar-wasm.cjoseph.workers.dev) returned network errors during the check, while GTA 5 resolves to a web.archive.org snapshot rather than a live game.",
  },
  {
    q: "Which games on the Radiant Optimizer list require your own game files?",
    a: "Entries badged 'Bring your own files'—including Skate 3 (skate.aaddpp.lol), Halo CE Mobile (hcemobile.com), GTA: Vice City WASM, Diablo Web, Half-Life (Pixelsuft) and WebXash (CS 1.6)—expect data converted from a copy you legally own. Entries badged 'No extra files listed'—such as CS Surf (surfd.net), PES 6 Web Online, Quake, Quake II, Return to Castle Wolfenstein and Urban Terror—do not list extra files as a requirement, though a reachable page still does not guarantee gameplay.",
  },
  {
    q: "Are these browser games part of the Radiant Optimizer Windows app?",
    a: "No. Radiant Optimizer is a separate Windows PC tuning utility (with a free tier and a $57.77 one-time Premium option), while the browser games are independent community projects that @RadiantOpti listed in a social post. You do not need to buy or install the Windows utility to open any browser project. Read our independent Radiant Optimizer review and safety guide for details.",
  },
  {
    q: "Is it spelled Radiant Optimizer, Radient Optimizer, or RadiantOpti?",
    a: "The account handle is @RadiantOpti and the full name is Radiant Optimizer (often searched as 'Radient Optimizer', 'Radian Optimizer' or 'Radiant Optimazer', or in Spanish as 'Radiant Optimizer lista de juegos'). All of those searches refer to the same 25-link browser game list indexed on this page.",
  },
]
  .map((f) => `      <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
  .join("\n")}
    </div>
  </div>
</section>
`;

const HOME_FAQ = [
  {
    q: "Where is the Radiant Optimizer full games list and links?",
    a: "The original Radiant Optimizer list shared by @RadiantOpti on 8 October 2026 contains 25 browser game links, all preserved in the directory above with their recorded destination domains, setup requirements and verification notes. A wider library of 42 additional browser ports (67 projects in total) is available on the Browser Games page.",
  },
  {
    q: "Why are some Radiant Optimizer game links disabled or not loading?",
    a: "Each entry points to an independent third-party host that can change or go offline. In our 11 October 2026 check, Moon Zombies (moon-zombies.pages.dev), Kino der Toten (kino-der-toten.pages.dev) and BO3 Cheese Cube (cheese-cube.pages.dev) returned off-topic navigation hints in their HTML, so their launch links are disabled here. Black Ops 2 / Vibe Slops (vibeslops.luckeysystems.com) and The Simpsons: Hit & Run (shar-wasm.cjoseph.workers.dev) returned network errors during the check, while GTA 5 resolves to a web.archive.org snapshot rather than a live game.",
  },
  {
    q: "Which games on the Radiant Optimizer list require your own game files?",
    a: "Entries badged 'Bring your own files'—including Skate 3 (skate.aaddpp.lol), Halo CE Mobile (hcemobile.com), GTA: Vice City WASM, Diablo Web, Half-Life (Pixelsuft) and WebXash (CS 1.6)—expect data converted from a copy you legally own. Entries badged 'No extra files listed'—such as CS Surf (surfd.net), PES 6 Web Online, Quake, Quake II, Return to Castle Wolfenstein and Urban Terror—do not list extra files as a requirement, though a reachable page still does not guarantee gameplay.",
  },
  {
    q: "Are these browser games part of the Radiant Optimizer Windows app?",
    a: "No. Radiant Optimizer is a separate Windows PC tuning utility (with a free tier and a $57.77 one-time Premium option), while the browser games are independent community projects that @RadiantOpti listed in a social post. You do not need to buy or install the Windows utility to open any browser project. Read our independent Radiant Optimizer review and safety guide for details.",
  },
  {
    q: "Is it spelled Radiant Optimizer, Radient Optimizer, or RadiantOpti?",
    a: "The account handle is @RadiantOpti and the full name is Radiant Optimizer (often searched as 'Radient Optimizer', 'Radian Optimizer' or 'Radiant Optimazer', or in Spanish as 'Radiant Optimizer lista de juegos'). All of those searches refer to the same 25-link browser game list indexed on this page.",
  },
];

write(
  "index.html",
  layout({
    title: "Radiant Optimizer Browser Games — Original List, Links & Setup",
    description: `The original Radiant Optimizer browser games list shared by @RadiantOpti: ${SOURCE.length} projects, their real destinations, screenshots and what each one needs. The wider library is on a separate page.`,
    canonical: "/",
    active: "directory",
    body: homeBody,
    image: imgSrc(SOURCE[0]),
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          name: "Radiant Optimizer Browser Games — Original List",
          description: `The ${SOURCE.length} browser-game projects from the @RadiantOpti thread.`,
          url: CONFIG.baseUrl + "/",
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: SOURCE.length,
            itemListElement: SOURCE.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: g.name,
              url: abs(publicPath(`games/${g.slug}.html`)),
            })),
          },
        },
        {
          "@type": "FAQPage",
          mainEntity: HOME_FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
      ],
    },
  })
);

/* ---------------- game pages ---------------- */

games.forEach((g) => {
  const related = (g.related || []).map((s) => bySlug[s]).filter(Boolean);
  const launchDisabled = isLaunchDisabled(g);
  // data-rol-outbound marks the game's original-project links for the
  // game_outbound_click event (see assets/analytics.js). click_location
  // distinguishes the primary button from the source-section link.
  const outboundAttrs = `data-rol-outbound data-game-slug="${esc(g.slug)}" data-game-category="${esc(g.category)}"`;
  const openBlock = launchDisabled
    ? `<span class="btn btn-ghost" aria-disabled="true">Launch link disabled</span>`
    : g.sourceUrl
      ? `<a class="btn btn-primary" href="${esc(g.sourceUrl)}" target="_blank" rel="nofollow noopener" ${outboundAttrs} data-click-location="primary_button">${g.requirement === "archive" ? "View archive snapshot" : "Open project page"} &nearr;</a>`
      : `<span class="btn btn-ghost" aria-disabled="true">Launch button withheld</span>`;
  const img = imgSrc(g);

  const grp = groupOf(g);
  const body = `
<div class="wrap">
  <nav class="crumbs">
    <a href="/browser-games/">Browser games</a><span>/</span>${
      grp ? `<a href="${publicPath(`browser-games/${grp.slug}/index.html`)}">${esc(grp.name)}</a><span>/</span>` : ""
    }${esc(g.name)}
  </nav>

  <div class="article-head">
    <div class="meta-row">
      <span class="badge cat">${esc(g.category)}</span>
      <span class="badge dev">${esc(g.device)}</span>
      ${reqBadge(g.requirement)}
      ${verificationBadge(g)}
      ${g.collection === "source" ? `<span class="badge dev">From the list</span>` : ""}
    </div>
    <h1>${esc(g.name)}</h1>
    <p class="lede">${esc(g.summary)}</p>
  </div>

  <figure class="shot">
    <img src="${img}" alt="${esc(imgAlt(g))}" width="1280" height="720">
    <figcaption>${hasShot(g.slug) ? `Screenshot captured from ${esc(hostOf(g))}. Belongs to the project's creators.` : `Cover art for ${esc(g.name)}. We could not capture a live screenshot of this project.`}</figcaption>
  </figure>

  <div class="article-body">
    <div class="btn-row" style="margin:6px 0 8px">
      ${openBlock}
      <a class="btn btn-ghost" href="/#directory">Back to the original list</a>
    </div>
    <h2>Verification status</h2>
    <p>${esc(verificationEvidence(g))}</p>
    <p style="font-size:13px;color:var(--muted-2);margin-top:14px"><strong>Project status / evidence:</strong> ${esc(g.statusNote)}</p>

    <h2>What it is</h2>
    <p>${esc(g.whatItIs)}</p>

    <h2>Requirement</h2>
    <p>${reqBadge(g.requirement)} ${(g.requirement === "ready" ? "No extra game files or installer are listed as requirements. This does not establish destination availability or gameplay." : g.requirement === "files" ? "The project lists game files as a requirement; use only files from a copy you legally own." : g.requirement === "setup" ? "Check the project-specific setup information if the destination is available; requirements may still be unknown." : g.requirement === "archive" ? "This is an archive snapshot, not a current launch requirement." : "The current launch link is withheld." )}</p>

    <h2>What you need</h2>
    <ul>${g.whatYouNeed.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>

    <h2>How to open it</h2>
    <ol>${g.howToOpen.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>

    <div class="callout warn">
      <h4>Before you click</h4>
      <p>We link to the original destination only and we do not host or provide game files. If the project asks for data, use files from a game you legally own. Never bypass a certificate warning and never install an unfamiliar executable to play a browser game.</p>
    </div>

    <h2>Source</h2>
    <p>${
      launchDisabled
        ? `No launch link is provided (${esc(hostOf(g))}). The supplied destination was disabled after off-topic navigation hints appeared in the response HTML; see the verification and project status above.`
        : g.sourceUrl
        ? `Original destination: <a class="inline" href="${esc(g.sourceUrl)}" target="_blank" rel="nofollow noopener" ${outboundAttrs} data-click-location="source_inline">${esc(g.sourceUrl.replace(/^https?:\/\//, ""))}</a> (${esc(hostOf(g))}).`
        : "No usable destination: the supplied link did not resolve to the named project, so we withhold it."
    }${
      g.collection === "source"
        ? ` Listed in the <a class="inline" href="${CONFIG.sourceReplyUrl}" target="_blank" rel="nofollow noopener">original links reply</a>.`
        : " Collected independently for the wider library."
    }</p>
    ${
      related.length
        ? `<h2>Related entries</h2>
    <div class="link-cards">
      ${related
        .map(
          (r) => `<a class="link-card" href="${publicPath(`games/${r.slug}.html`)}">
        <span class="k">${esc(r.category)}</span>
        <h4>${esc(r.name)}</h4>
        <p>${esc(r.summary)}</p>
      </a>`
        )
        .join("\n      ")}
    </div>`
        : ""
    }
  </div>
</div>
`;

  const srcRef = g.sourceUrl ? g.sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : hostOf(g);
  write(
    `games/${g.slug}.html`,
    layout({
      title: `${g.name} browser project — requirement & status`,
      description: `${g.summary} Source: ${srcRef} (${verificationLabel(g)}). Requirement: ${(REQ[g.requirement] || REQ.setup).label}. Category: ${g.category} (${g.device}).`,
      canonical: publicPath(`games/${g.slug}.html`),
      active: "directory",
      body,
      image: imgSrc(g),
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "VideoGame",
            name: g.name,
            alternateName: g.altName,
            genre: g.category,
            applicationCategory: "Browser game",
            description: g.summary,
            url: abs(publicPath(`games/${g.slug}.html`)),
            image: abs(imgSrc(g)),
            ...(g.sourceUrl && !isLaunchDisabled(g) ? { sameAs: g.sourceUrl } : {}),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Browser games", item: `${CONFIG.baseUrl}/browser-games/` },
              ...(grp
                ? [{ "@type": "ListItem", position: 2, name: grp.name, item: `${CONFIG.baseUrl}/browser-games/${grp.slug}/` }]
                : []),
              {
                "@type": "ListItem",
                position: grp ? 3 : 2,
                name: g.name,
                item: abs(publicPath(`games/${g.slug}.html`)),
              },
            ],
          },
        ],
      },
    })
  );
});

/* ---------------- guides ---------------- */

GUIDES.forEach((g) => {
  const raw = readFileSync(join(SRC, "content", g.file), "utf8");
  const withAff = applyPartners(raw);
  const body = `
<div class="wrap">
  <nav class="crumbs">
    <a href="/#directory">Directory</a><span>/</span><a href="/#guides">Guides</a><span>/</span>${esc(g.title.split(":")[0])}
  </nav>
  <div class="article-head">
    <span class="eyebrow">${esc(g.kicker)}</span>
    <h1>${esc(g.title)}</h1>
    <p class="lede">${esc(g.description)}</p>
  </div>
  <div class="article-body">
    ${withAff}
    <div class="callout cta" style="margin-top:34px">
      <h4>Browse the directory</h4>
      <p>The original thread is on the homepage. The full library, including everything added afterwards, is a separate page.</p>
      <p><a class="inline" href="/#directory">Original list &rarr;</a> &nbsp; <a class="inline" href="/browser-games/">Full library &rarr;</a></p>
    </div>
  </div>
</div>
`;
  write(
    `guides/${g.slug}.html`,
    layout({
      title: `${g.title} | ${CONFIG.siteName}`,
      description: g.description,
      canonical: publicPath(`guides/${g.slug}.html`),
      active: g.nav,
      body,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: g.title,
        description: g.description,
        author: { "@type": "Organization", name: CONFIG.siteName },
        publisher: { "@type": "Organization", name: CONFIG.siteName },
        datePublished: sourceData.source.checkedDate,
        dateModified: sourceData.source.checkedDate,
        mainEntityOfPage: abs(publicPath(`guides/${g.slug}.html`)),
      },
    })
  );
});

/* ---------------- browser games hub ---------------- */

const FAQ = [
  {
    q: "What counts as a browser game?",
    a: "Here it means a classic PC or console game project intended to run inside a browser tab. That covers four different approaches: native rewrites, decompilation builds, clean-room reimplementations and full emulation. Startup and availability depend on the specific project and host; some list no file requirements while others ask you to supply data.",
  },
  {
    q: "Are these browser games free?",
    a: "The projects in this directory are free to open. What they are not is officially licensed: nearly every one is a fan or community project, and none is endorsed by the original publisher. Some ask you to supply data from a game you already own, which is a separate purchase you may have made years ago.",
  },
  {
    q: "Do browser games need a download?",
    a: "Many projects do not list an installer or extra game files as requirements, but that says nothing about whether a destination is reachable or gameplay starts. A first load can still transfer a lot of data, and projects that ask for your own files expect you to prepare them yourself. Nothing in this directory requires an executable download; be suspicious of any browser project that does.",
  },
  {
    q: "Why do some browser games ask for my own game files?",
    a: "Because the engine and the content have different owners. A decompilation project rebuilds the code, which is the community's work, but the levels, textures and audio still belong to the publisher. Shipping those would be redistribution. Asking you to convert files from a copy you own keeps the project on the right side of that line.",
  },
  {
    q: "Are browser games safe to play?",
    a: "Running in a browser removes the need to install software, but it does not make every host trustworthy or prove a game works. Never bypass a certificate warning, never install an unfamiliar executable to play a supposed browser-only game, and only supply game files you legally own. Our safety guide covers the full checklist.",
  },
  {
    q: "Can I play these browser games on a phone?",
    a: "Some of them. Entries tagged Mobile are built with touch in mind, and a few projects explicitly document touch and gamepad support. A desktop-only build will not magically gain touch controls on a phone, so check the device badge on each entry before you try.",
  },
  {
    q: "Why did browser ports suddenly get popular in 2026?",
    a: "Two things converged. Decompilation projects matured to the point where a browser build was a small extra step rather than a research project, and a single post listing twenty of them went viral in October 2026. Mainstream coverage followed within days, which is what pushed the search interest you are probably responding to right now.",
  },
];

const faqBlock = `
<div class="faq">
${FAQ.map(
  (f) => `  <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`
).join("\n")}
</div>`;

const faqJsonLd = {
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const genreLinks = () =>
  GROUPS.map(
    (grp) => `<a class="link-card" href="${publicPath(`browser-games/${grp.slug}/index.html`)}">
        <span class="k">${gamesInGroup(grp).length} games</span>
        <h4>${esc(grp.name)}</h4>
        <p>${esc(grp.lede)}</p>
      </a>`
  ).join("\n      ");

const hubBody = `
<div class="wrap">
  <nav class="crumbs"><a href="/">Home</a><span>/</span>Browser games</nav>
</div>

<section class="hero">
  <div class="wrap">
    <span class="eyebrow">${games.length} projects &middot; updated ${esc(sourceData.source.checkedDate)}</span>
    <h1>Browser game projects, <span class="grad">sorted and explained</span></h1>
    <p class="lede">This is the full library: the ${SOURCE.length} projects from the @RadiantOpti thread, plus ${LIBRARY.length} others that were not on that graphic. It records each project's listed requirements, status notes and available destination links. A no-files requirement or HTTP response does not confirm that gameplay works.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="#all">Browse all ${games.length} games</a>
      <a class="btn btn-ghost" href="/browser-games/no-download/">No download needed</a>
    </div>
    <div class="hero-stats">
      <div class="stat"><b>${games.length}</b><span>games listed</span></div>
      <div class="stat"><b>${GROUPS.length}</b><span>genres</span></div>
      <div class="stat"><b>${games.filter((g) => g.requirement === "ready").length}</b><span>no extra files listed</span></div>
      <div class="stat"><b>${games.filter((g) => hasShot(g.slug)).length}</b><span>real screenshots</span></div>
    </div>
    <div class="notice">
      ${ICON_WARN}
      <div><strong>Not a download site.</strong> We link to original project destinations only. We do not host, mirror or provide game files, and we do not offer copies of commercial games. Projects marked "Bring your own files" expect data from a game you legally own.</div>
    </div>
  </div>
</section>

<section id="genres">
  <div class="wrap">
    <h2 class="sec">Browse by genre</h2>
    <p class="sec-lede">Eight groups, from fast arena shooters to afternoon-eating simulation games.</p>
    <div class="link-cards">
      ${genreLinks()}
    </div>
  </div>
</section>

<section id="all">
  <div class="wrap">
    <h2 class="sec">Every browser game in the directory</h2>
    <p class="sec-lede">Search by name, or filter by collection, genre and device.</p>
    <div class="toolbar">
      <div class="search-box">
        ${ICON_SEARCH}
        <input id="game-search" type="search" placeholder="Search games, e.g. Quake, Doom, Mario, zombies..." aria-label="Search games">
      </div>
      <div class="filters">
        <span class="label">Collection</span>
        <button class="chip active" data-group="col" data-value="All">All</button>
        <button class="chip" data-group="col" data-value="source">${esc(COLLECTIONS.source.label)} (${SOURCE.length})</button>
        <button class="chip" data-group="col" data-value="library">${esc(COLLECTIONS.library.label)} (${LIBRARY.length})</button>
      </div>
      <div class="filters">
        <span class="label">Genre</span>
        ${cats.map((c) => `<button class="chip${c === "All" ? " active" : ""}" data-group="cat" data-value="${esc(c)}">${esc(c)}</button>`).join("")}
      </div>
      <div class="filters">
        <span class="label">Device</span>
        ${["All", "Desktop", "Mobile"].map((d) => `<button class="chip${d === "All" ? " active" : ""}" data-group="dev" data-value="${esc(d)}">${esc(d)}</button>`).join("")}
      </div>
      <p class="result-count" id="result-count">${games.length} games shown</p>
    </div>
    <div class="grid" id="game-grid">
      ${games.map((g) => card(g)).join("\n      ")}
    </div>
  </div>
</section>

<section id="how">
  <div class="wrap">
    <h2 class="sec">How a browser game actually works</h2>
    <p class="sec-lede">"Playable in your browser" covers four different things, and knowing which one you are looking at explains most of the surprises.</p>
    <div class="entry-types">
      <div class="etype"><h4>Native rewrite</h4><p>The game's code is rewritten for the web. It may avoid a separate emulator, while loading and startup still depend on the project and host.</p></div>
      <div class="etype"><h4>Decompilation build</h4><p>Fans reverse-engineer the original into source, then rebuild it for the browser. These builds often ask for original game files; availability depends on the host.</p></div>
      <div class="etype"><h4>Clean-room build</h4><p>An engine is rebuilt with replacement assets. The asset requirement may be lighter, but startup still depends on the implementation and host.</p></div>
      <div class="etype"><h4>Emulation</h4><p>A full emulator can run the original machine's code in a tab. Loading demands and current availability depend on the project.</p></div>
    </div>
    <p class="sec-lede" style="margin-top:22px">
      <a class="inline" href="/guides/browser-ports-explained">Read the full explanation, including why links break so often &rarr;</a>
    </p>
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <h2 class="sec">Browser games: common questions</h2>
    <p class="sec-lede">The things people ask before they click.</p>
    ${faqBlock}
    <p class="sec-lede" style="margin-top:22px">
      Want the full safety checklist? Read <a class="inline" href="/guides/is-it-safe">is the browser games list safe</a>, or see <a class="inline" href="/guides/troubleshooting">what to do when a game will not load</a>.
    </p>
  </div>
</section>

<section id="radiant">
  <div class="wrap">
    <h2 class="sec">Looking for the Radiant Optimizer list?</h2>
    <p class="sec-lede">The homepage is only the ${SOURCE.length} projects shared by @RadiantOpti on 8 October 2026, with the original graphic, the links reply and every status note. This page is the full library.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="/#directory">Open the original list</a>
    </div>
  </div>
</section>
`;

write(
  "browser-games/index.html",
  layout({
    title: `Browser Games: ${games.length} Classic Games You Can Play in a Tab`,
    description: `The full library of ${games.length} browser games: the original @RadiantOpti list plus a wider set of classic PC and console titles rebuilt or emulated to run in a browser tab.`,
    canonical: "/browser-games/",
    active: "browser",
    body: hubBody,
    image: imgSrc(games[0]),
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          name: "Browser Games Directory",
          description: `A directory of ${games.length} classic browser-game projects with requirement and destination notes.`,
          url: `${CONFIG.baseUrl}/browser-games/`,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: games.length,
            itemListElement: games.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: g.name,
              url: abs(publicPath(`games/${g.slug}.html`)),
            })),
          },
        },
        faqJsonLd,
      ],
    },
  })
);

/* ---------------- genre pages ---------------- */

GROUPS.forEach((grp) => {
  const list = gamesInGroup(grp);
  if (!list.length) return;
  const others = GROUPS.filter((x) => x.slug !== grp.slug);
  const body = `
<div class="wrap">
  <nav class="crumbs">
    <a href="/">Home</a><span>/</span><a href="/browser-games/">Browser games</a><span>/</span>${esc(grp.name)}
  </nav>
  <div class="article-head">
    <span class="eyebrow">${list.length} games</span>
    <h1>${esc(grp.title)}</h1>
    <p class="lede">${esc(grp.lede)}</p>
  </div>
  <div class="article-body">
    <p>${esc(grp.intro)}</p>
  </div>
</div>

<section style="padding-top:12px">
  <div class="wrap">
    <h2 class="sec">${esc(grp.name)} games in the directory</h2>
    <div class="grid">
      ${list.map((g) => card(g)).join("\n      ")}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2 class="sec">Other genres</h2>
    <p class="sec-lede">Or browse the <a class="inline" href="/browser-games/">full browser games library</a>.</p>
    <div class="link-cards">
      ${genreLinks()}
    </div>
  </div>
</section>
`;
  write(
    `browser-games/${grp.slug}/index.html`,
    layout({
      title: `${grp.title} — ${list.length} browser-game entries`,
      description: `${grp.lede} ${list.length} projects with screenshots where available, destination notes and setup requirements.`,
      canonical: `/browser-games/${grp.slug}/`,
      active: "browser",
      body,
      image: imgSrc(list[0]),
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "CollectionPage",
            name: grp.title,
            description: grp.intro,
            url: `${CONFIG.baseUrl}/browser-games/${grp.slug}/`,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: list.length,
              itemListElement: list.map((g, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: g.name,
                url: abs(publicPath(`games/${g.slug}.html`)),
              })),
            },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Browser games", item: `${CONFIG.baseUrl}/browser-games/` },
              { "@type": "ListItem", position: 2, name: grp.name, item: `${CONFIG.baseUrl}/browser-games/${grp.slug}/` },
            ],
          },
        ],
      },
    })
  );
});

/* ---------------- no-download page ---------------- */

const readyGames = games.filter((g) => g.requirement === "ready");
write(
  "browser-games/no-download/index.html",
  layout({
    title: `Browser Games With No Download — ${readyGames.length} With No Files Listed`,
    description: `${readyGames.length} browser-game entries whose listed requirements include no installer or extra game files. This does not verify destination availability or gameplay.`,
    canonical: "/browser-games/no-download/",
    active: "browser",
    body: `
<div class="wrap">
  <nav class="crumbs">
    <a href="/">Home</a><span>/</span><a href="/browser-games/">Browser games</a><span>/</span>No download
  </nav>
  <div class="article-head">
    <span class="eyebrow">${readyGames.length} games</span>
    <h1>Browser games with no download</h1>
    <p class="lede">These entries list no installer or extra game files as requirements. That describes setup only; it does not mean the destination is reachable or that gameplay has been verified.</p>
  </div>
  <div class="article-body">
    <p>These are projects whose listed requirement does not include extra game files or an installer. Check each project's status evidence before opening its link. "No download" does not mean "no data": several projects can transfer a large amount on first load, and one lists an initial load of around 380&nbsp;MB.</p>
    <p>If you want the projects that expect your own game files instead, filter the <a class="inline" href="/browser-games/">full library</a> by the "Bring your own files" badge.</p>
  </div>
</div>

<section style="padding-top:12px">
  <div class="wrap">
    <h2 class="sec">No extra files listed</h2>
    <div class="grid">
      ${readyGames.map((g) => card(g)).join("\n      ")}
    </div>
  </div>
</section>
`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Browser games with no download",
      url: `${CONFIG.baseUrl}/browser-games/no-download/`,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: readyGames.length,
        itemListElement: readyGames.map((g, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: g.name,
          url: abs(publicPath(`games/${g.slug}.html`)),
        })),
      },
    },
  })
);

/* ---------------- retired group redirects ---------------- */

// Groups that were renamed or retired. A noindex stub is written at the old
// path so a URL that was already shared still resolves, and so any stale copy
// left behind on disk (when output cannot be deleted) is overwritten rather
// than deployed as a duplicate page.
const RETIRED_GROUPS = { shooter: "shooter-classics" };

for (const [oldSlug, newSlug] of Object.entries(RETIRED_GROUPS)) {
  write(
    `browser-games/${oldSlug}/index.html`,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved &middot; ${esc(CONFIG.siteName)}</title>
<link rel="canonical" href="${abs(`/browser-games/${newSlug}/`)}">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=/browser-games/${newSlug}/">
</head>
<body>
<p>This category was split up and now lives at <a href="/browser-games/${newSlug}/">${esc(newSlug)}</a>.</p>
</body>
</html>
`
  );
}

/* ---------------- 404 ---------------- */

write(
  "404.html",
  layout({
    title: `Page not found | ${CONFIG.siteName}`,
    description: "That page does not exist. Browse the full browser games directory instead.",
    canonical: "/404",
    robots: "noindex",
    active: "",
    body: `<div class="wrap"><div class="article-head"><h1>Page not found</h1><p class="lede">That link does not exist. Head back to the directory to find your project.</p></div><div class="article-body"><a class="btn btn-primary" href="/#directory">Browse the original list</a></div></div>`,
  })
);

/* ---------------- trust pages ---------------- */

// The privacy page must describe the analytics state this build actually
// ships: a GA4 paragraph when a measurement ID is configured, a Plausible
// paragraph when its script URL is, and an explicit "no analytics" statement
// only when neither is. One placeholder keeps the states from drifting apart.
const GA4_PRIVACY = CONFIG.ga4MeasurementId
  ? `<p>This site uses Google Analytics to count page views, searches, filter use and clicks on game links. Google sets cookies (names starting with <code>_ga</code>) to tell returning visitors apart. Analytics is off until you accept it in the banner: declined visits are still counted in aggregate, but without cookies and without anything that identifies you. Your choice is stored in your browser (localStorage key <code>rol-consent</code>) and you can change it any time by clearing this site's data and reloading. Measurement is processed under <a class="inline" href="https://policies.google.com/technologies/partner-sites" rel="nofollow noopener" target="_blank">Google's policies</a>, including the <a class="inline" href="https://business.safety.google/adsettings/" rel="nofollow noopener" target="_blank">Google Ads settings</a> you can review. We collect no names, emails or accounts, and we never send search text or click data anywhere else.</p>`
  : "";
const PLAUSIBLE_PRIVACY = CONFIG.plausibleScriptUrl
  ? `<p>Page views are ${CONFIG.ga4MeasurementId ? "also " : ""}counted by Plausible Analytics, a cookieless statistics service. It sets no cookies, stores nothing in your browser, and does not track you across other sites, which is why it runs without a consent banner. Each visit sends only the page address, the referring site, your approximate country and your browser and device type; a daily-rotating hash stands in for any identifier and cannot be traced back to you. Processing is covered by <a class="inline" href="https://plausible.io/privacy" rel="nofollow noopener" target="_blank">Plausible's privacy policy</a>.</p>`
  : "";
const ANALYTICS_PARAGRAPHS = [GA4_PRIVACY, PLAUSIBLE_PRIVACY].filter(Boolean);
const ANALYTICS_PRIVACY = ANALYTICS_PARAGRAPHS.length
  ? `<h2>Analytics</h2>\n${ANALYTICS_PARAGRAPHS.join("\n")}`
  : `<h2>Analytics</h2>
<p>This build of the site runs no visitor analytics or first-party statistics service.</p>`;

// AdSense disclosure, also generated per build state so the page is only ever
// accurate: the advertising paragraph exists exactly when the AdSense loader
// does. Mirrors Google's AdSense privacy-disclosure guidance.
const ADSENSE_PRIVACY = CONFIG.adsenseClient
  ? `<h2>Advertising</h2>
<p>Ads, when shown, are served through Google AdSense. Third-party vendors including Google use cookies to serve ads based on your prior visits to this site or other websites, and to measure ad performance. You can review or change personalized-ad settings at <a class="inline" href="https://www.google.com/settings/ads" rel="nofollow noopener" target="_blank">Google Ads Settings</a> and opt out of many third-party vendor cookies at <a class="inline" href="https://www.aboutads.info/choices/" rel="nofollow noopener" target="_blank">aboutads.info/choices</a>. Where consent is required (for example in the EEA and UK) ad and analytics cookies are only set after you accept them in the site banner, and you can withdraw that choice any time by clearing this site's data. See also <a class="inline" href="https://policies.google.com/technologies/ads" rel="nofollow noopener" target="_blank">How Google uses cookies</a>.</p>`
  : "";
const ADSENSE_CLAIM = CONFIG.adsenseClient
  ? `<li>Some ads come through Google AdSense, disclosed in the next section.</li>`
  : "";
// Disclosure for the third-party banner strip (PARTNER_ADS). It ships on
// every non-noindex page regardless of the AdSense account state, so its
// privacy wording must be unconditional too.
const NETWORK_ADS_PRIVACY = PARTNER_ADS.length
  ? `<p>Banner placements are also served by independent advertising networks (scripts loaded from bauval.org). Those networks may use their own cookies or similar technologies to deliver and measure ads and operate under their own privacy policies. You can opt out of many third-party vendor cookies at <a class="inline" href="https://www.aboutads.info/choices/" rel="nofollow noopener" target="_blank">aboutads.info/choices</a>.</p>`
  : "";
const ADS_CLAIMS = [
  PARTNER_ADS.length
    ? `<li>Banner placements on this site are served by third-party advertising networks, which may use cookies or similar technologies to deliver and measure ads — see the advertising section below.</li>`
    : "",
  ADSENSE_CLAIM,
  `<li>We do not sell or share your data with data brokers.</li>`,
]
  .filter(Boolean)
  .join("\n  ");

const TRUST = [
  {
    slug: "about",
    title: "About this directory",
    description:
      "Radiant Optimizer List is an independent directory of browser-game projects shared by @RadiantOpti, plus a wider library. It is not the Radiant Optimizer product.",
    kicker: "About",
    file: "about.html",
  },
  {
    slug: "privacy",
    title: "Privacy",
    description: `What Radiant Optimizer List does with information about you: no accounts, ${
      [CONFIG.ga4MeasurementId && "declinable analytics", CONFIG.plausibleScriptUrl && "cookieless visit counting"]
        .filter(Boolean)
        .join(" plus ") || "no analytics"
    }, no game files, and how third-party services work.`,
    kicker: "Privacy",
    file: "privacy.html",
  },
  {
    slug: "contact",
    title: "Contact and corrections",
    description:
      "How to report a wrong link on Radiant Optimizer List, and where to go for the Radiant Optimizer product or a game host.",
    kicker: "Contact",
    file: "contact.html",
  },
];

for (const page of TRUST) {
  const raw = applyPartners(readFileSync(join(SRC, "content", page.file), "utf8"))
    .replaceAll("<!-- analytics-policy -->", ANALYTICS_PRIVACY)
    .replaceAll("<!-- ads-policy -->", ADSENSE_PRIVACY + NETWORK_ADS_PRIVACY)
    .replaceAll("<!-- ads-claims -->", ADS_CLAIMS);
  write(
    `${page.slug}.html`,
    layout({
      title: `${page.title} | ${CONFIG.siteName}`,
      description: page.description,
      canonical: publicPath(`${page.slug}.html`),
      active: "",
      body: `
<div class="wrap">
  <nav class="crumbs">
    <a href="/">Home</a><span>/</span>${esc(page.title)}
  </nav>
  <div class="article-head">
    <span class="eyebrow">${esc(page.kicker)}</span>
    <h1>${esc(page.title)}</h1>
    <p class="lede">${esc(page.description)}</p>
  </div>
  <div class="article-body">
    ${raw}
  </div>
</div>`,
    })
  );
}

/* ---------------- sitemap + robots + covers ---------------- */

const urls = [
  { loc: "/", pri: "1.0" },
  { loc: "/browser-games/", pri: "0.9" },
  { loc: "/browser-games/no-download/", pri: "0.8" },
  ...GROUPS.map((g) => ({ loc: `/browser-games/${g.slug}/`, pri: "0.8" })),
  ...games.map((g) => ({ loc: publicPath(`games/${g.slug}.html`), pri: "0.8" })),
  ...GUIDES.map((g) => ({ loc: publicPath(`guides/${g.slug}.html`), pri: "0.7" })),
  ...TRUST.map((p) => ({ loc: publicPath(`${p.slug}.html`), pri: "0.4" })),
];

write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${CONFIG.baseUrl}${u.loc}</loc><lastmod>${sourceData.source.checkedDate}</lastmod><priority>${u.pri}</priority></url>`)
  .join("\n")}
</urlset>
`
);

write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${CONFIG.baseUrl}/sitemap.xml\n`);

write(
  "favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<defs>
<linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7c5cff"/>
<stop offset="1" stop-color="#22d3ee"/>
</linearGradient>
</defs>
<rect width="64" height="64" rx="16" fill="url(#fg)"/>
<text x="32" y="42" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="28" font-weight="800" fill="#0b0d12" letter-spacing="-1">RL</text>
</svg>\n`
);

// Authorized-sellers file for the AdSense account; absent until the
// publisher ID is configured. Google requires the pub ID without the
// ca- prefix and the standard Google TAG ID.
if (CONFIG.adsenseClient) {
  write("ads.txt", `google.com, ${CONFIG.adsenseClient.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
}

for (const g of games) {
  write(`assets/covers/${g.slug}.svg`, coverSvg(g));
}

mkdirSync(join(OUT, "assets"), { recursive: true });
for (const f of ["style.css", "app.js", "analytics.js"]) {
  writeFileSync(join(OUT, "assets", f), readFileSync(join(SRC, "assets", f)));
}

const shots = games.filter((g) => hasShot(g.slug)).length;
const orphans = games.filter((g) => !groupOf(g));
console.log(`Built ${3 + GROUPS.length + games.length + GUIDES.length + TRUST.length + 1} pages`);
console.log(`  index.html`);
console.log(`  browser-games/  (hub + ${GROUPS.length} genres + no-download)`);
console.log(`  games/   (${games.length}: ${SOURCE.length} source + ${LIBRARY.length} library)`);
console.log(`  guides/  (${GUIDES.length})`);
console.log(`  about, privacy, contact`);
console.log(`  covers/  (${games.length} generated)`);
console.log(`  shots/   (${shots} real screenshots)`);
console.log(`  sitemap.xml, robots.txt, 404.html`);

// Guard against stale output: a genre folder left behind by an earlier build
// would still be deployed and could be indexed as a duplicate page.
const bgDir = join(OUT, "browser-games");
if (!cleaned) {
  console.log("  NOTE: could not clear previous output in this environment.");
  console.log(`  Delete public/{${GENERATED_DIRS.join(",")}} plus index.html/404.html/sitemap.xml/robots.txt before deploying.`);
} else if (existsSync(bgDir)) {
  const expected = new Set([...GROUPS.map((g) => g.slug), ...Object.keys(RETIRED_GROUPS)]);
  const stale = readdirSync(bgDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "no-download" && !expected.has(e.name))
    .map((e) => e.name);
  if (stale.length) console.log(`  WARNING: stale genre folders still present: ${stale.join(", ")}`);
}
if (orphans.length) console.log(`  WARNING: ${orphans.length} games match no group: ${orphans.map((g) => g.slug).join(", ")}`);
