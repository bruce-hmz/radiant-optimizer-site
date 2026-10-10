import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "assets", "shots");
mkdirSync(OUT, { recursive: true });

const EXE = "C:/Users/EDY/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";

const arg = process.argv[2] || "[]";
const targets = arg.trim().startsWith("[") ? JSON.parse(arg) : JSON.parse(readFileSync(arg, "utf8"));
const results = [];

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--disable-gpu", "--no-sandbox"] });

for (const t of targets) {
  const dest = join(OUT, `${t.slug}.jpg`);
  if (existsSync(dest) && !t.force) {
    results.push({ slug: t.slug, ok: true, skipped: true });
    continue;
  }
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(t.url, { waitUntil: "load", timeout: 40000 });
    if (t.click) {
      await page.mouse.click(640, 400).catch(() => {});
    }
    await page.waitForTimeout(t.wait || 6000);
    const buf = await page.screenshot({ type: "jpeg", quality: 72, animations: "disabled" });
    writeFileSync(dest, buf);
    results.push({ slug: t.slug, ok: true, bytes: buf.length });
  } catch (e) {
    results.push({ slug: t.slug, ok: false, error: String(e.message || e).slice(0, 120) });
  } finally {
    await ctx.close().catch(() => {});
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
