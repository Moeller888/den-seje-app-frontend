// D-110 tripwire diagnostics: every refusal is attributed to the test that was running, with sanitised
// facts only — and the fail-closed decision is exactly what it was.
//
// Pinned:
//   * the tripwire still refuses (403 / closed CONNECT) and `hits` is still the host-only record the runner
//     fails on; `events` adds time, kind and browser FAMILY — never a path, query, header value or the raw
//     User-Agent;
//   * the timeline reporter writes begin/end lines with a fixed, non-sensitive set of fields, only when the
//     runner names a file;
//   * attribution names the test running at a refusal, or says it fell before, between or after tests;
//   * run-suite: attribution is diagnostics inside try/catch, BEFORE the unchanged `hits` check that exits 1,
//     and the summary line other tools parse is unchanged; the suite config loads the reporter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect as netConnect } from "node:net";
import { startTripwire, agentFamily } from "../isolated/tripwire-proxy.mjs";
import { attributeEgress, parseTimeline, testIntervals } from "../isolated/egress-attribution.mjs";
import Reporter, { timelineEntry } from "../isolated/egress-timeline-reporter.mjs";
import { buildSuiteEnv, suiteViolations } from "../isolated/run-suite.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const UA = {
  chromium: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/146.0.0.0 Safari/537.36",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0",
  webkit: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
};

test("agentFamily: the browser family only, never the string", () => {
  assert.equal(agentFamily(UA.chromium), "chromium");
  assert.equal(agentFamily(UA.firefox), "firefox");
  assert.equal(agentFamily(UA.webkit), "webkit");
  assert.equal(agentFamily("curl/8.5.0"), "other");
  assert.equal(agentFamily(""), "none");
  assert.equal(agentFamily(undefined), "none");
});

// CI 2026-11-05 16:54 and 2026-11-06 05:22: a WebKit context closing resets the refused tunnel, the reset
// was an unhandled 'error' on the CONNECT socket, and it killed the runner before the summary. The probe
// runs in a child process, so a crash is a non-zero exit there rather than a crash of this test runner.
export const RESET_PROBE = `
  import { connect } from "node:net";
  const { startTripwire } = await import(process.argv[1]);
  const t = await startTripwire();
  const port = Number(new URL(t.url).port);
  for (let i = 0; i < 20; i++) {
    await new Promise((ok) => {
      const s = connect(port, "127.0.0.1", () => {
        s.write("CONNECT tjzbehwfagiwpwodsgwg.supabase.co:443 HTTP/1.1\\r\\nHost: tjzbehwfagiwpwodsgwg.supabase.co:443\\r\\n\\r\\n");
        // The proxy reads the request, records it and starts its 403; the browser is torn down before it
        // reads the answer and resets the connection.
        setTimeout(() => { s.resetAndDestroy(); setTimeout(ok, 20); }, 30);
      });
      s.on("error", () => {});
    });
  }
  await new Promise((ok) => setTimeout(ok, 200));
  console.log(JSON.stringify({ hits: t.hits.length }));
  await t.close();
`;

test("tripwire: a browser resetting a refused tunnel neither crashes the runner nor loses the refusal", async () => {
  const { spawnSync } = await import("node:child_process");
  const mod = new URL("../isolated/tripwire-proxy.mjs", import.meta.url).href;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", RESET_PROBE, mod], { encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 0, `the runner process survived (stderr: ${String(r.stderr).slice(0, 300)})`);
  const out = JSON.parse(String(r.stdout).trim().split("\n").pop());
  assert.ok(out.hits >= 1, "every reset tunnel that reached the proxy is still recorded — the run still fails");
});

test("tripwire: still refuses and records host-only hits; events add time, kind and family — nothing else", async () => {
  let clock = 1000;
  const t = await startTripwire({ now: () => clock++ });
  const port = Number(new URL(t.url).port);
  const status = await new Promise((ok, ko) => {
    const r = request({ host: "127.0.0.1", port, method: "GET", path: "http://example.org/secret/path?token=abc",
      headers: { "user-agent": UA.firefox, authorization: "Bearer xyz", cookie: "sb=1" } }, (res) => { res.resume(); ok(res.statusCode); });
    r.on("error", ko); r.end();
  });
  assert.equal(status, 403);
  const reply = await new Promise((ok, ko) => {
    const s = netConnect(port, "127.0.0.1", () => s.write(`CONNECT tjzbehwfagiwpwodsgwg.supabase.co:443 HTTP/1.1\r\nHost: tjzbehwfagiwpwodsgwg.supabase.co:443\r\nUser-Agent: ${UA.chromium}\r\n\r\n`));
    let buf = ""; s.on("data", (d) => { buf += d; }); s.on("end", () => ok(buf)); s.on("error", ko);
  });
  assert.match(reply, /^HTTP\/1\.1 403/, "the tunnel is refused");
  assert.deepEqual(t.hits, ["example.org", "tjzbehwfagiwpwodsgwg.supabase.co:443"], "the fail-closed record is unchanged");
  assert.deepEqual(t.events, [
    { at: 1000, kind: "HTTP", host: "example.org", agent: "firefox" },
    { at: 1001, kind: "CONNECT", host: "tjzbehwfagiwpwodsgwg.supabase.co:443", agent: "chromium" },
  ]);
  const json = JSON.stringify(t.events);
  for (const leak of ["secret", "token", "Bearer", "xyz", "sb=1", "Mozilla", "Gecko"]) assert.equal(json.includes(leak), false, leak);
  await t.close();
});

const T = (at, ev, title, extra = {}) => ({ at, ev, project: "webkit", file: "tests/a.spec.ts", line: 10, title, retry: 0, worker: 0, ...extra });

test("attribution: during a test, between two, before the first, after the last, and with no timeline", () => {
  const timeline = [T(100, "begin", "one"), T(200, "end", "one", { status: "passed" }), T(250, "begin", "two"), T(400, "end", "two", { status: "passed" })];
  const ev = (at) => ({ at, kind: "CONNECT", host: "x.supabase.co:443", agent: "webkit" });
  const [during, between, before, after] = attributeEgress([ev(150), ev(220), ev(50), ev(450)], timeline, { t0: 0 });
  assert.equal(during.where, "during [webkit] tests/a.spec.ts:10 › one");
  assert.equal(attributeEgress([ev(150)], timeline, { t0: -1850 })[0].text, "CONNECT x.supabase.co:443 from webkit at +2.0 s — during [webkit] tests/a.spec.ts:10 › one");
  assert.equal(between.where, "between tests: 20 ms after [webkit] tests/a.spec.ts:10 › one ended, 30 ms before [webkit] tests/a.spec.ts:10 › two");
  assert.match(before.where, /^before the first test \(\[webkit\] tests\/a\.spec\.ts:10 › one\)$/);
  assert.match(after.where, /^after the last test \(\[webkit\] tests\/a\.spec\.ts:10 › two, 50 ms after its end\)$/);
  assert.equal(attributeEgress([ev(1)], [])[0].where, "no test timeline recorded");
  // A test without an end line (the run was killed) is open-ended; a retry is named.
  const open = attributeEgress([ev(999)], [T(900, "begin", "three", { retry: 1 })]);
  assert.equal(open[0].where, "during [webkit] tests/a.spec.ts:10 › three (retry 1)");
});

test("timeline parsing skips torn lines and keeps time order; intervals pair begin and end per test run", () => {
  const text = [JSON.stringify(T(300, "end", "one")), "{torn", "", JSON.stringify(T(100, "begin", "one")), JSON.stringify({ at: "x", ev: "begin" })].join("\n");
  const tl = parseTimeline(text);
  assert.deepEqual(tl.map((e) => e.at), [100, 300]);
  assert.deepEqual(testIntervals(tl).map((i) => [i.begin, i.end]), [[100, 300]]);
});

test("reporter: a fixed set of non-sensitive fields, written only when the runner names a file", () => {
  const fakeTest = { title: "a test", location: { file: join(process.cwd(), "tests", "x.spec.ts"), line: 7 }, parent: { project: () => ({ name: "firefox" }) } };
  const e = timelineEntry("end", fakeTest, { retry: 2, workerIndex: 0, status: "passed", stdout: ["secret"] }, { now: 5 });
  assert.deepEqual(e, { at: 5, ev: "end", project: "firefox", file: "tests/x.spec.ts", line: 7, title: "a test", retry: 2, worker: 0, status: "passed" });
  const before = process.env.ISOLATED_TIMELINE_FILE;
  delete process.env.ISOLATED_TIMELINE_FILE;
  assert.equal(new Reporter().file, null, "no file named: writes nothing");
  const dir = mkdtempSync(join(tmpdir(), "egress-"));
  process.env.ISOLATED_TIMELINE_FILE = join(dir, "t.jsonl");
  const r = new Reporter();
  r.onTestBegin(fakeTest, { retry: 0, workerIndex: 0 });
  r.onTestEnd(fakeTest, { retry: 0, workerIndex: 0, status: "failed" });
  const lines = parseTimeline(readFileSync(process.env.ISOLATED_TIMELINE_FILE, "utf8"));
  assert.deepEqual(lines.map((l) => [l.ev, l.title, l.status ?? null]), [["begin", "a test", null], ["end", "a test", "failed"]]);
  if (before === undefined) delete process.env.ISOLATED_TIMELINE_FILE; else process.env.ISOLATED_TIMELINE_FILE = before;
  assert.equal(r.printsToStdio(), false);
});

test("runner: the timeline file is a local temp path set only when given, and the suite environment stays valid", () => {
  const RUNNER = {
    ISOLATED_E2E: "1", ISOLATED_BASE_URL: "http://127.0.0.1:8788", ISOLATED_SUPABASE_URL: "http://127.0.0.1:54321",
    ISOLATED_SUPABASE_SERVICE_KEY: "s".repeat(40), ISOLATED_SUPABASE_ANON_KEY: "a".repeat(40),
  };
  const file = join(tmpdir(), "isolated-timeline-abcd1234.jsonl");
  const env = buildSuiteEnv(RUNNER, { runId: "abcd1234", tripwire: "http://127.0.0.1:41000", timelineFile: file });
  assert.equal(env.ISOLATED_TIMELINE_FILE, file);
  assert.deepEqual(suiteViolations(env), []);
  assert.equal("ISOLATED_TIMELINE_FILE" in buildSuiteEnv(RUNNER, { tripwire: "http://127.0.0.1:41000" }), false);
});

test("runner: attribution is diagnostics only — the unchanged hits check still fails the run, after it", () => {
  const src = read("../isolated/run-suite.mjs");
  const fail = 'if (tripwire.hits.length) { console.error(`tripwire: ${tripwire.hits.length} browser request(s) left loopback — failing the run`); process.exit(1); }';
  assert.ok(src.includes(fail), "the fail-closed line is unchanged");
  const att = src.indexOf("attributeEgress(tripwire.events");
  assert.ok(att > 0 && att < src.indexOf(fail), "attribution runs before the decision");
  const block = src.slice(src.indexOf("if (tripwire.events.length) {"), src.indexOf(fail));
  assert.match(block, /try \{[\s\S]*\} catch \(e\) \{[\s\S]*the run still fails below/);
  assert.equal(/process\.exit\(0\)|return;|hits\.length = 0|hits\.splice/.test(block), false, "the diagnostics cannot end the run early or clear the record");
  // The summary line that measure-parallel.mjs parses keeps its exact form.
  assert.ok(src.includes("`| browser requests refused by the tripwire | ${tripwire.hits.length}${hosts.length ? \" — \" + hosts.join(\", \") : \"\"} |`"));
  const cfg = read("../isolated/playwright.suite.config.ts");
  assert.match(cfg, /\[resolve\(ROOT, "tests", "isolated", "egress-timeline-reporter\.mjs"\)\]/);
  assert.match(cfg, /bypass: "127\.0\.0\.1,localhost,::1,cdn\.jsdelivr\.net,esm\.sh"/, "the bypass list is unchanged");
});
