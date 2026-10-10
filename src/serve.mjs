import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

// Same shape as the deployed worker: *.html 301s to an extensionless path,
// directory indexes keep a trailing slash, leaf pages do not.
function resolveRequest(urlPath) {
  const path = urlPath || "/";
  if (path.endsWith("/index.html")) {
    const dir = path.slice(0, -"index.html".length);
    return { redirect: dir || "/" };
  }
  if (path.endsWith(".html")) {
    const next = path.slice(0, -".html".length);
    return { redirect: next || "/" };
  }

  const rel = path.replace(/^\/+/, "");
  const inside = (candidate) => {
    const full = normalize(candidate);
    if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
    return full;
  };

  if (path !== "/" && path.endsWith("/")) {
    const dirIndex = inside(join(ROOT, rel, "index.html"));
    if (dirIndex && existsSync(dirIndex)) return { file: dirIndex, status: 200 };
    const asFile = inside(join(ROOT, rel.replace(/\/$/, "") + ".html"));
    if (asFile && existsSync(asFile)) return { redirect: path.replace(/\/$/, "") };
    return { missing: true };
  }

  if (path === "/") return { file: join(ROOT, "index.html"), status: 200 };

  const dirIndex = inside(join(ROOT, rel, "index.html"));
  if (dirIndex && existsSync(dirIndex)) return { redirect: path.endsWith("/") ? path : `${path}/` };
  const asFile = inside(join(ROOT, `${rel}.html`));
  if (asFile && existsSync(asFile)) return { file: asFile, status: 200 };

  const asset = inside(join(ROOT, rel));
  if (asset && existsSync(asset) && statSync(asset).isFile()) return { file: asset, status: 200 };
  return { missing: true };
}

createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let urlPath = decodeURIComponent(url.pathname);
  const resolved = resolveRequest(urlPath);
  if (resolved.redirect) {
    res.writeHead(301, { Location: resolved.redirect + url.search });
    res.end();
    return;
  }
  const file = resolved.file && existsSync(resolved.file) ? resolved.file : join(ROOT, "404.html");
  const status = resolved.file && existsSync(resolved.file) ? resolved.status || 200 : 404;
  try {
    const body = readFileSync(file);
    res.writeHead(status, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("error");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}/`);
});
