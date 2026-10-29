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
import { createServer } from "node:http";

export function startTripwire({ port = 0, host = "127.0.0.1" } = {}) {
  const hits = [];
  const server = createServer((req, res) => {
    let target = "unknown";
    try { target = new URL(req.url).host; } catch { target = String(req.headers.host ?? "unknown"); }
    hits.push(target);
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("isolated E2E: egress refused");
  });
  server.on("connect", (req, socket) => {
    hits.push(String(req.url ?? "unknown"));
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const { port: bound } = server.address();
      resolve({ url: `http://${host}:${bound}`, hits, close: () => new Promise((ok) => server.close(() => ok())) });
    });
  });
}
