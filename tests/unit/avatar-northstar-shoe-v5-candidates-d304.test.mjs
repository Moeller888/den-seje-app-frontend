// D-304 — the SV-1 + master v5 candidate package (sv1-v5-candidates-v1.json): stable IDs, the colours, the source and the locked look.
// The files that make the shoe's look are locked by sha256 (a change is a new package version); the shared covering and outfit-check
// files are recorded as they were at the lock. The package approves nothing: D-301's REJECTED SOURCE stands, v5 is not validated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as SM from "../../tools/avatar/northstar-shoe-master.mjs";
import * as V5 from "../../tools/avatar/northstar-shoe-master-v5.mjs";
import * as E2 from "../../tools/avatar/northstar-shoe-eval-v2.mjs";
import * as C from "../../tools/avatar/northstar-shoe-v5-candidates.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex");
const M = JSON.parse(readFileSync(join(ROOT, C.MANIFEST_REL), "utf8"));
const LOOK = ["tools/avatar/northstar-shoe-source.mjs", "tools/avatar/northstar-shoe-eval-v2.mjs", "tools/avatar/northstar-shoe-master.mjs", "tools/avatar/northstar-shoe-master-v5.mjs", "tools/avatar/northstar-shoe-v5-study.mjs"];

test("D-304 the package: stable IDs, the four designs and their colours, the SV-1 source", () => {
  assert.equal(M.package, C.PACKAGE); assert.deepEqual(Object.keys(M.candidates), ["SV1-V5-CHALK", "SV1-V5-CHARCOAL", "SV1-V5-NAVYWHITE", "SV1-V5-BURGUNDYGUM"]); assert.deepEqual(Object.keys(C.CANDIDATES), Object.keys(M.candidates));
  for (const [id, c] of Object.entries(M.candidates)) { assert.equal(c.design, C.CANDIDATES[id]); assert.deepEqual(c.colours, JSON.parse(JSON.stringify(SM.designs()[c.design]))); assert.match(c.layerSha256, /^[0-9a-f]{64}$/); }
  assert.equal(M.source.sha256, "30e15fdacb167416afbb126301711b63acc46342423add21c2e1c15155dba71a"); assert.equal(M.source.callId, "SV-1-shoes-sneakers-low-tight-k4");
  assert.deepEqual(M.processing.haloRule, JSON.parse(JSON.stringify(E2.HALO_RULE))); assert.equal(M.master.revision, V5.SPEC_V5.revision); assert.equal(M.master.base, SM.SPEC_V4.revision);
});

test("D-304 the look is locked: processing and master files unchanged since the lock; covering and outfit-check files recorded", () => {
  assert.deepEqual(Object.keys(M.methodFiles), [...C.METHOD_FILES]);
  for (const f of LOOK) assert.equal(sha(readFileSync(join(ROOT, f))), M.methodFiles[f], f + " changed after the lock: a changed look is a new package version");
  for (const f of C.METHOD_FILES) assert.match(M.methodFiles[f], /^[0-9a-f]{64}$/);
});

test("D-304 the package approves nothing and carries no owner verdict", () => {
  for (const s of ["NOT APPROVED", "D-301 REJECTED SOURCE STANDS", "NOT INDEPENDENTLY VALIDATED", "NO PUBLIC ASSET"]) assert.ok(M.status.includes(s), s);
  assert.ok(!/approved"?\s*:\s*true|ownerVerdict|visualVerdict/i.test(JSON.stringify(M)));
  assert.ok(!M.source.location.includes("DEN SEJE APP"), "the source stays outside the clones");
});
