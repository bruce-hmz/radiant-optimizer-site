import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const pages = walk(ROOT);
let checked = 0;
const broken = [];

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  for (const link of [...hrefs, ...srcs]) {
    if (/^(https?:|mailto:|#|data:)/.test(link)) continue;
    const clean = link.split("#")[0].split("?")[0];
    if (!clean) continue;
    checked++;
    const target = clean.startsWith("/") ? join(ROOT, clean) : resolve(dirname(page), clean);
    const hit = existsSync(target) || existsSync(join(target, "index.html"));
    if (!hit) broken.push({ page: relative(ROOT, page), link });
  }
}

console.log(`pages scanned: ${pages.length}`);
console.log(`internal links checked: ${checked}`);
console.log(`broken: ${broken.length}`);
for (const b of broken.slice(0, 40)) console.log(`  ${b.page}  ->  ${b.link}`);
