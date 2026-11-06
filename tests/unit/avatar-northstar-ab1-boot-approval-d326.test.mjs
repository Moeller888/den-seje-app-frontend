// D-326 — the owner's approval of two concrete AB-1 ankle boots from D-325 (ab1-boot-owner-approval-v1.json) and the private runtime
// preparation: exactly the original colour and the light sand layer, each tied to its approved layer and its shown renderings; black + gum
// not covered; D-324's verdict, D-325's technical FAILs and its development caveat kept; light sand approved as shown, never called
// documented suede; the reachable opt-in combinations mapped by the browser's own functions; nothing published or integrated by D-326
// itself — D-331 then published exactly the 4 staged files and offered the boots for exactly the 180 combinations, under the owner's
// permission. No private file is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as AL from "../../js/avatar-layers.js";
import * as P from "../../tools/avatar/northstar-ab1-boot-runtime-prep.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), sha = (b) => createHash("sha256").update(b).digest("hex"), A = P.approval();
const SHOWN = ["skirt-sand", "shorts-navy", "capri-lightblue", "trousers-square-olive", "trousers-square-navy", "trousers-square-sand"].map((b) => "top-tee-hip-cream+bottom-" + b);

test("D-326 the approval is exactly the two named D-325 variants, each tied to its layer and its six shown renderings", () => {
  assert.equal(A.decision, "D-326"); assert.equal(A.kind, "owner visual approval of concrete items");
  assert.deepEqual(A.approved.map((b) => b.id), ["AB1-BOOT-ORIGINAL", "AB1-BOOT-LIGHTSAND"]); assert.deepEqual(A.approved.map((b) => b.design), ["original colour", "light sand suede (SYNTHETIC)"]);
  assert.deepEqual(A.approved.map((b) => b.proposedRuntimeItem), ["shoes-ankleboots-ab1-original", "shoes-ankleboots-ab1-lightsand"]);
  for (const b of A.approved) { assert.match(b.layer.pixelSha256, /^[0-9a-f]{64}$/); assert.match(b.layer.fileSha256, /^[0-9a-f]{64}$/); assert.ok(b.layer.bytes > 0);
    assert.deepEqual(Object.keys(b.shownRenderings), SHOWN); for (const r of Object.values(b.shownRenderings)) assert.match(r.pixelSha256, /^[0-9a-f]{64}$/); }
  assert.notEqual(A.approved[0].layer.pixelSha256, A.approved[1].layer.pixelSha256);
  assert.deepEqual(A.notApproved.map((n) => n.id), ["AB1-BOOT-BLACKGUM"]); assert.ok(!A.approved.some((b) => /black/i.test(b.design)));
  assert.deepEqual(A.approved[1].colours.upper, [214, 190, 150]); assert.deepEqual(A.approved[1].colours.sole, [238, 232, 220]);
});

test("D-326 provenance: the AB-1 source, the plan, contract v3, the seed rule, master v5 and the study, each by its sha256", () => {
  const p = A.provenance; assert.equal(p.source.imageSha256, "9edfa6c2a6050aad8671eb684e16360cdcb566669b8e65bf9d4e887792526126");
  for (const k of ["plan", "contract", "seeds", "master", "study"]) assert.equal(sha(readFileSync(join(ROOT, p[k].file))), p[k].sha256, k);
  assert.equal(p.contract.contractVersion, 3); assert.equal(p.contract.seedRule, "zone-v1"); assert.equal(p.master.revision, "shoe-master-v5-field");
});

test("D-326 the history and the limits are kept; light sand is approved as shown, not documented suede", () => {
  const h = A.historyKept.join(" | ");
  assert.match(h, /D-324: AB-1 is REJECTED SOURCE/); assert.match(h, /ΔE p95 0\.0568/); assert.match(h, /line contrast below 0\.2/); assert.match(h, /not independently validated/);
  assert.match(A.scope, /NOT automatic mass production, NOT the method in general/);
  assert.match(A.approved[1].colours.description, /approved AS SHOWN/); assert.match(A.approved[1].colours.description, /NOT documented suede/);
  assert.match(A.notIncluded, /no publication, runtime integration, catalogue, shop, pupil or flag change/);
});

test("D-326 the reachable opt-in combinations: 90 effective outfits x 2 boots = 180, 10 of them shown in D-325, no known-faulty outfit", () => {
  const c = P.combinations(AL, A); assert.equal(c.length, 180); assert.equal(c.filter((x) => x.shownInD325).length, 10); assert.equal(new Set(c.map((x) => x.id)).size, 180);
  assert.ok(!c.some((x) => x.top === "top-tee-hip-blue" && x.bottom === "bottom-skirt-sand")); assert.ok(!c.some((x) => x.top === "top-tee-hip-cream" && x.bottom === "bottom-trousers-square-olive"));
  for (const b of A.approved) { const mine = c.filter((x) => x.boot === b.id); assert.equal(mine.length, 90);
    assert.equal(mine.filter((x) => x.top === "top-tee-hip-blue").length, 5); assert.equal(mine.filter((x) => x.top.includes("print")).length, 80); }
  assert.deepEqual(P.combinations(AL, A), c);
});

// D-326's registered runtime files (the staging table in docs/decisions/D-326.md)
const STAGED = { "shoes-ankleboots-ab1-original-shoes-v1.webp": ["a3dc7242617a93bd694f7410d2cec2ce916d16e670ad5d1a626d382d5a4a5106", 37444], "shoes-ankleboots-ab1-lightsand-shoes-v1.webp": ["00a1447a5894a17584d86846a8689c9b5dcf84f996db19892dcb3c5034265f90", 40754],
  "hide-shoes-ankleboots-ab1-original-v1.webp": ["8d54222dc90d132470d707600fe927a71346e330a201028ae085ec9c6f478e4b", 646], "hide-shoes-ankleboots-ab1-lightsand-v1.webp": ["8d54222dc90d132470d707600fe927a71346e330a201028ae085ec9c6f478e4b", 646] };

test("D-326/D-331 published under the owner's permission: exactly the 4 registered files, the ankle boots' shadow reused, the boots offered for exactly the 180; flag false", () => {
  assert.equal(P.RUNTIME_ITEM_SHAPE.shadowsOf, "shoes-ankleboots-brown"); assert.equal(P.RUNTIME_ITEM_SHAPE.closed, true);
  const pub = readdirSync(join(ROOT, "assets", "avatar-northstar")); assert.ok(pub.includes("shoes-ankleboots-brown-shadow-body-v1.webp"));
  assert.deepEqual(pub.filter((f) => f.includes("ab1")).sort(), Object.keys(STAGED).sort());
  for (const [f, [h, n]] of Object.entries(STAGED)) { const b = readFileSync(join(ROOT, "assets", "avatar-northstar", f)); assert.equal(sha(b), h, f); assert.equal(b.length, n, f); }
  for (const b of A.approved) { assert.equal(AL.NORTHSTAR_AB1_BOOTS[b.id].item, b.proposedRuntimeItem); assert.deepEqual({ ...AL.NORTHSTAR_ITEMS[b.proposedRuntimeItem], layers: [...AL.NORTHSTAR_ITEMS[b.proposedRuntimeItem].layers], shadows: [...AL.NORTHSTAR_ITEMS[b.proposedRuntimeItem].shadows] }, { ...P.RUNTIME_ITEM_SHAPE, layers: ["shoes"], shadows: ["body"] }); }
  assert.ok(!("AB1-BOOT-BLACKGUM" in AL.NORTHSTAR_AB1_BOOTS)); assert.deepEqual([...AL.NORTHSTAR_AB1_BOOT_COMBOS].sort(), P.combinations(AL, A).map((c) => c.key).sort());
  assert.ok(!AL.NORTHSTAR_SV1_SHOE_COMBOS.some((k) => k.includes("ab1"))); assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, true);
});
