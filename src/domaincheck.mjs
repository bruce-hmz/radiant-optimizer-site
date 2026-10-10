// Domain availability checker.
// .com/.net/.org/.dev/.xyz/.site/.online/... route via the IANA RDAP bootstrap.
// .io has no bootstrap entry, so it is queried against the registry RDAP directly.
// Usage:  node domaincheck.mjs a.com b.io c.net

const EXTRA = {
  io: ["https://rdap.identitydigital.services/rdap"],
};

const DOMAINS = process.argv.slice(2);
if (!DOMAINS.length) {
  console.log("usage: node domaincheck.mjs <domain> [domain...]");
  process.exit(1);
}

const boot = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(20000) }).then((r) => r.json());
const tldServers = {};
for (const [tlds, urls] of boot.services) for (const t of tlds) tldServers[t] = urls;
Object.assign(tldServers, EXTRA);

async function check(domain) {
  const tld = domain.split(".").pop();
  const servers = tldServers[tld];
  if (!servers) return "no rdap for ." + tld;
  for (const base of servers) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/domain/${domain}`, {
        headers: { accept: "application/rdap+json" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 200) return "TAKEN";
      if (res.status === 404) return "AVAILABLE";
    } catch {
      /* try the next server */
    }
  }
  return "unknown";
}

for (const d of DOMAINS) console.log(`${(await check(d)).padEnd(11)} ${d}`);
