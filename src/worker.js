// Serves the static site from Workers Assets.
// www → apex is a 301, plain HTTP is 301'd to HTTPS (the zone's edge
// "Always Use HTTPS" is off, so the worker owns that hop). Requests for
// *.html are 301'd to the extensionless path the rest of the site already
// uses (index.html → directory slash, page.html → page). Asset
// html_handling still 307s trailing-slash variants; those are upgraded to
// 301 here so canonicals are one hop.
const APEX = "radiantoptimizerlist.com";

function extensionlessPath(pathname) {
  if (pathname.endsWith("/index.html")) {
    const dir = pathname.slice(0, -"index.html".length);
    return dir || "/";
  }
  if (pathname.endsWith(".html")) {
    const next = pathname.slice(0, -".html".length);
    return next || "/";
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let redirect = false;
    const isSiteHost = url.hostname === APEX || url.hostname === `www.${APEX}`;
    // Guarded by hostname so `wrangler dev` on localhost keeps plain HTTP.
    if (url.protocol === "http:" && isSiteHost) {
      url.protocol = "https:";
      redirect = true;
    }
    if (url.hostname === `www.${APEX}`) {
      url.hostname = APEX;
      redirect = true;
    }
    const clean = extensionlessPath(url.pathname);
    if (clean && clean !== url.pathname) {
      url.pathname = clean;
      redirect = true;
    }
    if (redirect) return Response.redirect(url.toString(), 301);

    const response = await env.ASSETS.fetch(request);
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("Location");
      if (loc) {
        const dest = new URL(loc, url);
        if (dest.origin === url.origin && dest.href !== url.href) {
          await response.body?.cancel();
          return Response.redirect(dest.toString(), 301);
        }
      }
    }
    return response;
  },
};
