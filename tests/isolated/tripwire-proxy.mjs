// Browser-level egress tripwire for the isolated suite (D-110).
//
// Every browser the suite starts is configured with this server as its HTTP(S) proxy, with loopback
// bypassed (tests/isolated/playwright.suite.config.ts). So ANY browser request that is not to the
// local stack or the local bundle arrives here — and is refused (HTTP 403, or the CONNECT tunnel is
// closed) and recorded. Specs that fulfil *.supabase.co from fixtures via page.route never reach the
// network, so they never reach this proxy either.
//
// The runner asserts the record is empty after the suite. Only host names and ports are recorded,
// never paths, headers or bodies.
//
// ATTRIBUTION (diagnostics only — it never changes what is refused or whether the run fails):
// `hits` stays the fail-closed record the runner checks. `events` holds the same refusals with the
// time, the kind (CONNECT = an HTTPS tunnel, HTTP = a plain request) and the browser FAMILY derived
// from the User-Agent (chromium / firefox / webkit / other / none). The raw User-Agent is never kept.
// The suite runs one worker, so the time names the test that was running (run-suite.mjs).
import { createServer } from "node:http";

// The browser family behind a User-Agent string; never returns the string itself.
export function agentFamily(userAgent) {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (ua === "") return "none";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/(HeadlessChrome|Chrome|Chromium)\//.test(ua)) return "chromium";
  if (/AppleWebKit\//.test(ua)) return "webkit";
  return "other";
}

export function startTripwire({ port = 0, host = "127.0.0.1", now = () => Date.now() } = {}) {
  const hits = [];
  const events = [];
  const record = (kind, target, req) => {
    hits.push(target);
    events.push({ at: now(), kind, host: target, agent: agentFamily(req.headers?.["user-agent"]) });
  };
  const server = createServer((req, res) => {
    let target = "unknown";
    try { target = new URL(req.url).host; } catch { target = String(req.headers.host ?? "unknown"); }
    record("HTTP", target, req);
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("isolated E2E: egress refused");
  });
  server.on("connect", (req, socket) => {
    record("CONNECT", String(req.url ?? "unknown"), req);
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const { port: bound } = server.address();
      resolve({ url: `http://${host}:${bound}`, hits, events, close: () => new Promise((ok) => server.close(() => ok())) });
    });
  });
}
