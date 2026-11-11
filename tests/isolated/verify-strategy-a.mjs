// Fail-closed source check for test branch test/f07-strategy-a-prodlike (D-362 / F-07, strategy A).
// Before anything is served, the checkout must carry EXACTLY:
//   - get-next-question: the module graph of release candidate 32f0cb3d (19 files, manifest 04039767…),
//     the same computation as tools/edge/gnq-release.mjs;
//   - process-event: the 7 files of production's deployed version 44, byte for byte (downloaded read-only
//     2026-11-11 with `supabase functions download process-event --use-api`; = commit 03f59542).
//
//   node tests/isolated/verify-strategy-a.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, posix } from "node:path";
import { graphFiles, manifest, specifiers, workingTreeReader } from "../../tools/edge/gnq-release.mjs";

export const GNQ_CANDIDATE_MANIFEST = "04039767dfcdec861abcaef69c333977d0145fc482df9cbc58bc3860b907d6b2";
export const PROCESS_EVENT_V44 = Object.freeze({
  "functions/_shared/answer-evaluation.ts": "c3bec6824963683b383b029495efc52539da80e18519b0de41de1e0f4527cfd6",
  "functions/_shared/supabase-keys.ts": "472b99398ba2e94b3a71ee6383bce6d70f8bcfe0d76b955b0912e94a3eaa274d",
  "functions/process-event/deno.json": "52047e69faf4e12b45df387e9510d1be97c68ef9d02795ff3e2ef40657d394da",
  "functions/process-event/index.ts": "0ce188e2d5a116a60c3739af2efb07971053fbded19b0fe4b8d3f7f7dee9e18b",
  "functions/process-event/instance-read.ts": "b95403a390acf4b40e017bd7ba992e6ebecbec48e9de7d5c24b25e47a1f824b1",
  "functions/process-event/instance-writes.ts": "acac1ee047b9ddae978389a5d98fd946469f467681be99173d3b1204004744f5",
  "functions/process-event/text-answer-rpc.ts": "243587b905d5d74e8710fdcf280b7e002934f63f950b7ac95cea75e79c4e63e0",
});

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// process-event's module graph over relative imports, plus its deno.json.
export function processEventGraph(root) {
  const entry = "functions/process-event/index.ts";
  const read = (p) => readFileSync(join(root, "supabase", p), "utf8");
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    for (const s of specifiers(read(file))) {
      if (!s.startsWith("./") && !s.startsWith("../")) continue;
      const next = posix.normalize(posix.join(posix.dirname(file), s));
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return [...seen, "functions/process-event/deno.json"].sort();
}

export function verifyStrategyA(root = process.cwd()) {
  const problems = [];
  const read = workingTreeReader(root);
  const gnq = manifest(read, graphFiles(read));
  if (gnq.hash !== GNQ_CANDIDATE_MANIFEST || gnq.files.length !== 19) {
    problems.push(`get-next-question manifest ${gnq.hash} (${gnq.files.length} files), expected ${GNQ_CANDIDATE_MANIFEST} (19 files)`);
  }
  const pe = processEventGraph(root);
  const expected = Object.keys(PROCESS_EVENT_V44).sort();
  if (JSON.stringify(pe) !== JSON.stringify(expected)) problems.push(`process-event graph is [${pe.join(", ")}], expected the 7 files of version 44`);
  for (const f of expected) {
    const got = sha256(readFileSync(join(root, "supabase", f)));
    if (got !== PROCESS_EVENT_V44[f]) problems.push(`process-event ${f}: ${got}, expected version 44's ${PROCESS_EVENT_V44[f]}`);
  }
  return { gnq: gnq.hash, gnqFiles: gnq.files.length, processEventFiles: pe.length, problems };
}

if (process.argv[1] && process.argv[1].endsWith("verify-strategy-a.mjs")) {
  const r = verifyStrategyA();
  if (r.problems.length) { console.error("strategy A source check FAILED:\n  " + r.problems.join("\n  ")); process.exit(1); }
  console.log(`strategy A source check: get-next-question ${r.gnq} (${r.gnqFiles} files) = candidate 32f0cb3d; process-event ${r.processEventFiles} files = production version 44`);
}
