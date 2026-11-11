// Runs *.isolated.spec.mjs specs (tests/isolated/playwright.isolated.config.mjs) with EVERY browser
// behind the tripwire proxy, like run-suite.mjs does for the main suite (D-110). Test branch
// test/f07-strategy-a-prodlike only (D-362 / F-07, strategy A): it gives the F-07 browser chain its
// own tripwire count.
//
//   node tests/isolated/run-isolated-tripwire.mjs <spec files…>
//
// 1. The runner's environment must pass the isolation guard.
// 2. The tripwire proxy starts on loopback; ISOLATED_TRIPWIRE_PROXY and ISOLATED_REQUIRE_TRIPWIRE=1
//    are passed to Playwright, and the config refuses to start without the proxy.
// 3. A positive control BEFORE the specs: one request through the proxy to a non-loopback host must
//    be refused and recorded; otherwise the tripwire is not proven to work and the run fails.
// 4. After the specs: any refused browser request fails the run, even if every test passed.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertIsolated } from "./isolation-guard.mjs";
import { startTripwire } from "./tripwire-proxy.mjs";

// The address a proxied request names; it is never contacted (the proxy only records the host).
export const CONTROL_HOST = "tripwire-control.invalid";

export function controlRequest(proxyUrl) {
  const { hostname, port } = new URL(proxyUrl);
  return new Promise((ok, fail) => {
    const req = httpRequest({ host: hostname, port, method: "GET", path: `http://${CONTROL_HOST}/`, headers: { host: CONTROL_HOST } }, (res) => {
      res.resume();
      res.on("end", () => ok(res.statusCode));
    });
    req.on("error", fail);
    req.end();
  });
}

async function main(args) {
  if (args.length === 0) throw new Error("usage: run-isolated-tripwire.mjs <spec files…> (refusing to run every isolated spec)");
  assertIsolated(process.env);
  const tripwire = await startTripwire();

  const status = await controlRequest(tripwire.url).catch(async (e) => { await tripwire.close(); throw e; });
  if (status !== 403 || tripwire.hits.length !== 1 || tripwire.hits[0] !== CONTROL_HOST) {
    await tripwire.close();
    throw new Error(`tripwire positive control failed (status ${status}, hits ${tripwire.hits.length}) — the proxy is not proven to refuse`);
  }
  console.log(`tripwire positive control: a request to ${CONTROL_HOST} was refused (403) and recorded`);
  tripwire.hits.length = 0;
  tripwire.events.length = 0;

  const env = { ...process.env, ISOLATED_TRIPWIRE_PROXY: tripwire.url, ISOLATED_REQUIRE_TRIPWIRE: "1" };
  const t0 = Date.now();
  const code = await new Promise((ok) => {
    const child = spawn("npx", ["playwright", "test", "-c", "tests/isolated/playwright.isolated.config.mjs", ...args], { env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (c, sig) => ok(c ?? (sig ? 1 : 0)));
  });
  await tripwire.close();
  const hosts = [...new Set(tripwire.hits)].sort();
  const md = [
    "### isolated specs behind the tripwire (F-07 strategy A)",
    "",
    "| measure | value |",
    "|---|---|",
    `| specs | ${args.join(", ")} |`,
    `| Playwright exit | ${code} |`,
    "| tripwire positive control | refused and recorded |",
    `| browser requests refused by the tripwire | ${tripwire.hits.length}${hosts.length ? " — " + hosts.join(", ") : ""} |`,
    `| time | ${Math.round((Date.now() - t0) / 1000)} s |`,
    "",
  ].join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (tripwire.events.length) {
    for (const e of tripwire.events) console.error(`tripwire refusal: ${e.kind} ${e.host} (${e.agent})`);
  }
  if (tripwire.hits.length) { console.error(`tripwire: ${tripwire.hits.length} browser request(s) left loopback — failing the run`); process.exit(1); }
  process.exit(code);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
