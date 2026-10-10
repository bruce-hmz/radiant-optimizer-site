// Serves the static site from Workers Assets. The only dynamic behaviour is
// canonicalising the host: www is 301-redirected to the apex domain so both
// custom domains don't serve duplicate content. Everything else (including
// the 404 page) is handled by the assets binding.
const APEX = "radiantoptimizerlist.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${APEX}`) {
      url.hostname = APEX;
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
