// Local HTTPS stand-in for the two CDN origins the frontend imports from (D-110).
//
// Specs that serve the repository's raw files from their own local server (avatar-r2-*, login-page,
// teacher-first-run, …) load @supabase/supabase-js straight from https://cdn.jsdelivr.net, exactly
// as production pages do. In the isolated job the runner's /etc/hosts maps cdn.jsdelivr.net and
// esm.sh to 127.0.0.1 (only after the mirror was fetched), loopback :443 is redirected to this
// server, and it answers with the mirrored bytes (cdn-mirror.mjs) — same URLs, same modules, no
// network. A URL that is not in the mirror is a 404. The certificate is self-signed for exactly these
// two names; the isolated suite config sets ignoreHTTPSErrors (all other traffic is plain-http
// loopback anyway).
//
//   node tests/isolated/cdn-https.mjs <mirror-dir> <cert.pem> <key.pem> <port>
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMirror, MIRRORED_ORIGINS } from "./cdn-mirror.mjs";

export const CDN_HOSTS = Object.freeze(MIRRORED_ORIGINS.map((o) => new URL(o).host));

// Host header + path → the mirrored module, or null.
export function lookup(mirror, host, path) {
  const h = String(host ?? "").toLowerCase().replace(/:443$/, "");
  if (!CDN_HOSTS.includes(h)) return null;
  const hit = mirror?.index[`https://${h}${path}`];
  return hit ? { body: mirror.read(hit.key), type: hit.type } : null;
}

export function startCdnServer({ mirror, cert, key, port, host = "127.0.0.1" }) {
  const server = createServer({ cert, key }, (req, res) => {
    const hit = lookup(mirror, req.headers.host, req.url || "/");
    if (!hit) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not in the CDN mirror"); return; }
    res.writeHead(200, { "content-type": hit.type || "text/javascript; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
    res.end(hit.body);
  });
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [dir, certPath, keyPath, port] = process.argv.slice(2);
  const mirror = loadMirror(dir);
  if (!mirror || !certPath || !keyPath || !port) { console.error("usage: cdn-https.mjs <mirror-dir> <cert.pem> <key.pem> <port>"); process.exit(1); }
  await startCdnServer({ mirror, cert: readFileSync(certPath), key: readFileSync(keyPath), port: Number(port) });
  console.log(`cdn stand-in: ${CDN_HOSTS.join(", ")} on 127.0.0.1:${port}, ${Object.keys(mirror.index).length} module(s)`);
}
