// Runner-level egress guard for the isolated E2E environment.
//
// The browser tripwire (isolation-guard.mjs) only sees browser requests. This blackholes production
// and outbound-mail/AI host names for EVERY process on the runner that resolves through the system
// resolver (Node, curl, Playwright's API client, the browsers), by mapping them to 0.0.0.0 and :: in
// /etc/hosts — and then PROVES it: each name must resolve to 0.0.0.0 / :: (IPv4 / IPv6) and an HTTPS
// request to it must fail. Exact names only (/etc/hosts has no wildcards); the env guard still refuses any variable that
// mentions *.supabase.co.
//
// Known limit, stated rather than hidden: containers on their own Docker network resolve through
// Docker's DNS, not this file. The current stack runs no container that makes outbound calls
// (edge-runtime is excluded); adding Edge Functions requires a container-level egress rule first.
//
//   node tests/isolated/egress-blackhole.mjs --hosts-lines   → print the /etc/hosts lines
//   node tests/isolated/egress-blackhole.mjs --verify        → exit 1 unless every name is blocked
import { lookup } from "node:dns/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROD_PROJECT_REF } from "./isolation-guard.mjs";

export const BLACKHOLE_HOSTS = Object.freeze([
  // production Supabase project and the platform API
  `${PROD_PROJECT_REF}.supabase.co`,
  `db.${PROD_PROJECT_REF}.supabase.co`,
  `${PROD_PROJECT_REF}.functions.supabase.co`,
  "api.supabase.com",
  // production site
  "xn--lrlig-sra.dk",
  "www.xn--lrlig-sra.dk",
  // outbound mail providers
  "api.resend.com",
  "smtp.resend.com",
  "api.sendgrid.com",
  "smtp.sendgrid.net",
  "api.postmarkapp.com",
  // AI / speech providers
  "api.anthropic.com",
  "api.openai.com",
]);

// Both address families: with an IPv4 line only, an IPv6 (AAAA) lookup of the same name is not
// answered by /etc/hosts and falls through to DNS — the real address (seen in CI 2026-10-28).
export function hostsLines(hosts = BLACKHOLE_HOSTS) {
  return ["# isolated E2E: production and outbound-mail/AI hosts are unreachable",
    ...hosts.flatMap((h) => [`0.0.0.0 ${h}`, `:: ${h}`])].join("\n") + "\n";
}

const BLACKHOLED = { 4: "0.0.0.0", 6: "::" };

export async function verify(hosts = BLACKHOLE_HOSTS, { timeoutMs = 4000 } = {}) {
  const failures = [];
  for (const host of hosts) {
    for (const family of [4, 6]) {
      let address = null;
      try { address = (await lookup(host, { family })).address; } catch { address = null; }
      if (address !== null && address !== BLACKHOLED[family]) failures.push(`${host} resolves to a routable IPv${family} address`);
    }
    let reached = false;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      await fetch(`https://${host}/`, { signal: ctl.signal, redirect: "manual" });
      clearTimeout(t);
      reached = true;
    } catch {
      reached = false;
    }
    if (reached) failures.push(`${host} answered an HTTPS request`);
  }
  return failures;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const mode = process.argv[2];
  if (mode === "--hosts-lines") {
    process.stdout.write(hostsLines());
  } else if (mode === "--verify") {
    const failures = await verify();
    if (failures.length) {
      console.error("✖ egress blackhole NOT effective:\n  " + failures.join("\n  "));
      process.exit(1);
    }
    console.log(`egress blackhole verified for ${BLACKHOLE_HOSTS.length} host names (resolve to 0.0.0.0 and ::, HTTPS fails)`);
  } else {
    console.error("usage: egress-blackhole.mjs --hosts-lines | --verify");
    process.exit(2);
  }
}
