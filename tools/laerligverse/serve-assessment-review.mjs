// D-346 (F9): serve the test approval page LOCALLY, with one URL.
//
//   node tools/laerligverse/serve-assessment-review.mjs        → http://127.0.0.1:4341/
//
// Binds to 127.0.0.1 ONLY: the page shows the answer key. It serves exactly the generated page and refuses every
// other path and method. Nothing is stored: the teacher saves the decisions as a file. The page also works when
// opened directly as a file (docs/laerligverse/proeve-godkendelse.html). Port 4341, next to the Arkivskab review
// page on 4340 (serve-review.mjs), so both can run at once.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAGE } from "./assessment-review.mjs";

export const HOST = "127.0.0.1";
export const PORT = Number(process.env.PROEVE_REVIEW_PORT ?? 4341);

export function assessmentReviewHandler(readPage = () => readFileSync(PAGE)) {
  return (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" || (path !== "/" && path !== "/proeve-godkendelse.html")) {
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
  createServer(assessmentReviewHandler()).listen(PORT, HOST, () => {
    console.log(`Prøvegodkendelse: http://${HOST}:${PORT}/  (kun på denne computer; Ctrl+C stopper)`);
  });
}
