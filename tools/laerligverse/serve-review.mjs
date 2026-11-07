// D-341: serve the teacher review page LOCALLY so it can be opened with one URL.
//
//   node tools/laerligverse/serve-review.mjs        → http://127.0.0.1:4340/
//
// Binds to 127.0.0.1 ONLY (never 0.0.0.0): the page shows the answer key and must not be reachable from the
// network. It serves exactly one file — the generated review page — and refuses every other path. Nothing is
// stored on the server: decisions are saved by the page as a file the teacher downloads.
// The page also works without this server: open docs/laerligverse/kildekritik-laerergennemgang.html directly.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const HOST = "127.0.0.1";
export const PORT = Number(process.env.REVIEW_PORT ?? 4340);
const PAGE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "laerligverse", "kildekritik-laerergennemgang.html");

export function reviewHandler(readPage = () => readFileSync(PAGE)) {
  return (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" || (path !== "/" && path !== "/kildekritik-laerergennemgang.html")) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Ikke fundet");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    res.end(readPage());
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer(reviewHandler()).listen(PORT, HOST, () => {
    console.log(`Lærergennemgang: http://${HOST}:${PORT}/  (kun på denne computer; Ctrl+C stopper)`);
  });
}
