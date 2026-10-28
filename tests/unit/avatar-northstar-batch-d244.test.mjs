// D-244: the batch production flow (tools/avatar/northstar-batch.mjs) and batch b1's plan — no private file, no call. The design
// rules, the frozen prompt composition (D-235's, reproduced byte for byte), the UNAUTHORISED call plan and its cost, the full
// combination matrix in chunks, the status register's rules (a technical pass is never an approval; nothing is hidden) and the
// export's refusals. The end-to-end run on C (status on the D-239/D-240 runs, a private export) is recorded in docs/decisions/D-244.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as NB from "../../tools/avatar/northstar-batch.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), FX = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe");
const json = (p) => JSON.parse(readFileSync(p, "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex");
const B1 = NB.loadBatch("b1"), clone = (x) => JSON.parse(JSON.stringify(x));

test("D-244 b1 designs: 24 valid designs, 8 tops / 8 bottoms / 8 closed shoes, every tone class and patterns per category; registered in the pipeline", () => {
  const v = NB.validateBatch(B1); assert.deepEqual(v.errors, []);
  for (const c of ["top", "bottom", "shoes"]) { const x = v.distribution[c]; assert.equal(x.designs, 8, c); for (const t of ["light", "dark", "skin-near"]) assert.ok(x.tones[t] >= 1, c + " " + t); assert.ok(x.patterned >= 2, c); }
  assert.equal(Object.keys(IP.BATCH_ITEMS).length, 24);
  for (const d of B1.designs) { assert.equal(IP.ITEM_CATEGORY[d.id], d.category); if (d.category === "shoes") assert.equal(IP.COVERING[d.id], "closed-footwear"); }
  // the built-in tables are unchanged: the pilot's nine, D-228's six, D-235's six, their six coverings
  assert.equal(Object.keys(IP.ITEMS).length, 9); assert.equal(Object.keys(IP.VALIDATION_ITEMS).length, 6); assert.equal(Object.keys(IP.INDEPENDENT_ITEMS).length, 6);
  assert.equal(IP.COVERING["shoes-sandals-brown"], "open-footwear"); assert.equal(Object.keys(IP.COVERING).length, 6 + 8);
});

test("D-244 design rules: a colour change alone is not a design; sandals, text and logos are refused; every design names what it tests", () => {
  const b = clone(B1), d = clone(b.designs.find((x) => x.id === "top-polo-navy")); d.id = "top-polo-red"; d.tone = "mid"; d.garment = d.garment.replace("navy-blue", "red"); b.designs.push(d);
  assert.ok(NB.validateBatch(b).errors.some((e) => /top-polo-red: the same cut, material and pattern as top-polo-navy — a colour change alone/.test(e)));
  const e2 = clone(B1); e2.designs.find((x) => x.id === "top-tee-hip-cream" || x.id === "top-crop-boxy-peach").cut = "short-sleeve crew-neck tee, hip length"; e2.designs.find((x) => x.id === "top-crop-boxy-peach").material = "cotton jersey";
  assert.ok(NB.validateBatch(e2).errors.some((e) => /top-crop-boxy-peach: the same cut, material and pattern as top-tee-hip-cream/.test(e)), "also against the existing items");
  const s = clone(B1); s.designs.find((x) => x.category === "shoes").type = "sandals"; assert.ok(NB.validateBatch(s).errors.some((e) => /sandals are parked/.test(e)));
  const t = clone(B1); t.designs[0].garment += " with a small logo"; assert.ok(NB.validateBatch(t).errors.some((e) => /no text, logo/.test(e)));
  const o = clone(B1); o.designs.find((x) => x.category === "shoes").covering = "open-footwear"; assert.ok(NB.validateBatch(o).errors.some((e) => /closed footwear/.test(e)));
  const n = clone(B1); delete n.designs[3].tests; assert.ok(NB.validateBatch(n).errors.some((e) => /name what the design tests/.test(e)));
  const u = clone(B1); u.designs[0].id = "top-not-registered"; assert.ok(NB.validateBatch(u).errors.some((e) => /not registered in the pipeline/.test(e)));
  const dist = clone(B1); for (const x of dist.designs) if (x.category === "bottom" && x.tone === "skin-near") x.tone = "mid"; assert.ok(NB.validateBatch(dist).errors.some((e) => /bottom: no skin-near design/.test(e)));
});

test("D-244 prompts: D-235's composition, with the bottoms' contract sentence that D-228 and D-235 sent as the word \"undefined\"", () => {
  // D-228 and D-235 looked the bottoms' modelDraws up under "bottom" (the contract's key is "bottoms"): their five bottom prompts —
  // sent, their sha256 pinned in the call files — say "undefined" where the sentence belongs. Tops and shoes are reproduced byte
  // for byte; for bottoms the only difference is that sentence. b1 sends it.
  const C2 = json(join(FX, "seam-contract-v2.json"));
  for (const f of ["independent-validation-prompts-v1.json", "seam-validation-prompts-v1.json"]) for (const [id, it] of Object.entries(json(join(FX, f)).items)) {
    const ours = NB.composePrompt({ category: it.category, garment: it.garment });
    if (it.category === "bottom") { assert.equal(ours.replace(C2.modelDraws.bottoms, "undefined"), it.prompt, id); assert.match(it.prompt, / undefined Image 2 /, id); }
    else assert.equal(ours, it.prompt, id); }
  const fresh = NB.buildPrompts(B1), tracked = json(join(NB.BATCHES, "b1-prompts-v1.json")); assert.deepEqual(tracked, fresh);
  for (const d of B1.designs) { const it = tracked.items[d.id]; assert.ok(it.prompt.includes(d.garment)); assert.equal(it.sha256, sha(Buffer.from(it.prompt, "utf8"))); assert.ok(!/undefined/.test(it.prompt), d.id); }
  for (const d of B1.designs.filter((x) => x.category === "bottom")) assert.ok(tracked.items[d.id].prompt.includes(C2.modelDraws.bottoms), d.id);
  assert.equal(tracked.sources["independent-validation-prompts-v1.json"], sha(readFileSync(join(FX, "independent-validation-prompts-v1.json"))));
});

test("D-244 call plan: PREPARED, NOT AUTHORISED — no token, 0 authorised, every call UNAUTHORISED; D-235's request; interleaved order; the cost from measured usage", () => {
  const C = json(join(NB.BATCHES, "b1-calls-v1.json")), fresh = NB.buildCallPlan(B1, NB.buildPrompts(B1)); assert.deepEqual(C, fresh);
  assert.equal(C.meta.authorisesImageRequest, false); assert.equal(C.budget.authorised, 0); assert.equal(C.budget.actuallySent, 0); assert.equal(C.budget.requested, 24); assert.equal(C.budget.maxCalls, 28);
  assert.match(C.status, /^PREPARED — NOT AUTHORISED/); assert.ok(!/CALLS AUTHORISED/.test(JSON.stringify(C)), "no authorisation token");
  assert.ok(C.calls.every((c) => c.mandateState === "UNAUTHORISED" && c.output.startsWith("<Documents>/DenSejeApp-artefacts/")));
  assert.deepEqual(C.request, json(join(FX, "independent-validation-calls-v1.json")).request, "D-235's request: model, size, images and sheets unchanged");
  assert.deepEqual(C.calls.slice(0, 6).map((c) => c.category), ["top", "bottom", "shoes", "top", "bottom", "shoes"]);
  assert.equal(new Set(C.calls.map((c) => c.item)).size, 24);
  // usage measured on the 12 D-228/D-235 receipts; two price scenarios with their assumptions written down
  const k = NB.costEstimate(1); assert.equal(k.perCall.A, Math.round(((3072 * 8 + 357 * 5) / 1e6 + 1372 * 30 / 1e6) * 1e4) / 1e4); assert.equal(k.perCall.B, Math.round(((3072 * 10 + 357 * 5) / 1e6 + 0.25) * 1e4) / 1e4);
  assert.ok(C.cost.total.B < 10, "the ceiling scenario stays under 10 USD for 28 calls: " + C.cost.total.B);
  assert.ok(C.stopRules.some((r) => /quality checkpoint after call 6/.test(r)) && C.stopRules.some((r) => /9 of the calls sent/.test(r)));
});

test("D-244 matrix: 10 tops × 12 bottoms × 12 shoes = 1440 combinations, each in exactly one chunk; chunk manifests pass the pipeline's validation", () => {
  const m = NB.matrix(B1); assert.deepEqual([m.tops.length, m.bottoms.length, m.shoes.length, m.outfits.length], [10, 12, 12, 1440]);
  const seen = new Map(); for (const c of m.chunks) for (const t of m.tops) for (const s of m.shoes) { const n = [t, c.bottom, s].join("+"); seen.set(n, (seen.get(n) || 0) + 1); }
  assert.equal(seen.size, 1440); assert.ok([...seen.values()].every((x) => x === 1)); assert.ok(m.chunks.every((c) => c.items.length === 23));
  const receipts = Object.fromEntries(B1.designs.map((d, i) => [d.id, { raw: "b1-batch/B1-" + d.id + "/b1.image-1.png", rawSha256: sha(String(i)), sourceCall: "B1-" + d.id }]));
  const mans = NB.chunkManifests(B1, receipts); assert.equal(mans.length, 12); for (const man of mans) { assert.equal(man.items.length, 23); assert.equal(IP.validateManifest(man), true); assert.equal(man.method, "d240"); }
  const partial = NB.chunkManifests(B1, Object.fromEntries(Object.entries(receipts).slice(1))); assert.ok(partial.every((man) => !man.items.some((i) => i.id === B1.designs[0].id)), "a design without a receipt is absent");
});

// a synthetic run: the shape of run.json (items with status/files/openFindings; package.outfits/files)
const runOf = (items, outfits) => ({ method: "d240", items: Object.fromEntries(Object.entries(items).map(([id, st]) => [id, { status: st.status || "technically-ok", openFindings: st.open || [], files: { ["layer-" + (IP.ITEM_CATEGORY[id] === "shoes" ? "shoes" : IP.ITEM_CATEGORY[id] === "top" ? "topBody" : "pants") + ".png"]: st.h || sha(id) } }])),
  package: { outfits: Object.fromEntries(Object.entries(outfits).map(([n, s]) => [n, { status: s, failedChecks: s === "rejected" ? ["COMBO-1d-CUT-IN-GARMENT"] : [], openFindings: [] }])), files: Object.fromEntries(Object.keys(outfits).map((n) => ["outfit-" + n + ".full.png", sha(n)])) } });

test("D-244 status register: technical pass = kandidat, never godkendt; owner approval only with matching hashes; rejections propagate; nothing is dropped", () => {
  const T = "top-polo-navy", T2 = "top-breton-longsleeve", Bo = "bottom-jeans-straight-indigo", S = "shoes-chelsea-black", S2 = "shoes-rain-boots-yellow", R = "shoes-runners-panels";
  const o1 = [T, Bo, S].join("+"), o2 = [T2, Bo, S].join("+"), o3 = [T, Bo, S2].join("+"), o4 = [T, Bo, R].join("+");
  const run = runOf({ [T]: {}, [T2]: { open: ["F-100"] }, [Bo]: {}, [S]: {}, [S2]: {}, [R]: { status: "rejected" } }, { [o1]: "technically-ok", [o2]: "technically-ok", [o3]: "rejected" });
  const base = NB.statusRegister(B1, [{ dir: "x/run-1", run }]);
  assert.equal(Object.keys(base.outfits).length, 1440, "every combination is in the register");
  assert.equal(base.items[T].status, "kandidat"); assert.equal(base.items[T2].status, "kræver-gennemgang"); assert.equal(base.items[R].status, "afvist"); assert.equal(base.items["top-flannel-check"].status, "uafprøvet");
  assert.equal(base.outfits[o1].status, "kandidat"); assert.equal(base.outfits[o2].status, "kræver-gennemgang"); assert.equal(base.outfits[o3].status, "afvist"); assert.equal(base.outfits[o4].status, "afvist", "a rejected item rejects its combinations");
  assert.match(base.outfits[o4].reasons[0], /contains a rejected item: shoes-runners-panels/);
  const approve = (by, extra = {}) => ({ entries: [...[T, Bo, S].map((id) => ({ kind: "item", id, verdict: "approved", by, layers: base.items[id].layers, ...extra })), { kind: "outfit", id: o1, verdict: "approved", by, fullPngSha256: base.outfits[o1].fullPngSha256 }] });
  assert.equal(NB.statusRegister(B1, [{ dir: "x/run-1", run }], approve("assistant")).outfits[o1].status, "kandidat", "only the owner approves");
  const ok = NB.statusRegister(B1, [{ dir: "x/run-1", run }], approve("owner")); assert.equal(ok.outfits[o1].status, "godkendt"); assert.equal(ok.items[T].status, "godkendt");
  assert.deepEqual([ok.summary.combinationsOfApprovedItems, ok.summary.approvedAmongThem], [1, 1]);
  const stale = approve("owner"); stale.entries[0].layers = { "layer-topBody.png": sha("other") };
  const st = NB.statusRegister(B1, [{ dir: "x/run-1", run }], stale); assert.equal(st.items[T].status, "kræver-gennemgang", "an approval that no longer matches the layers"); assert.equal(st.outfits[o1].status, "kræver-gennemgang");
  const two = approve("owner"); two.entries.splice(2, 1);   // the outfit and two of its three items approved
  const tw = NB.statusRegister(B1, [{ dir: "x/run-1", run }], two); assert.equal(tw.items[S].status, "kandidat"); assert.equal(tw.outfits[o1].status, "kandidat", "an outfit is approved only with all three items approved");
  const rej = approve("owner"); rej.entries.push({ kind: "outfit", id: o1, verdict: "rejected", by: "assistant", reason: "a gap at the hip" });
  assert.equal(NB.statusRegister(B1, [{ dir: "x/run-1", run }], rej).outfits[o1].status, "afvist");
  const other = runOf({ [T]: { h: sha("changed") } }, {}); assert.throws(() => NB.statusRegister(B1, [{ dir: "x/run-1", run }, { dir: "x/run-2", run: other }]), /layers differ between runs/);
});

test("D-244 export: refuses the repository (D-242's public exception is not extended) and refuses an empty approval set — before reading anything private", async () => {
  const reg = NB.statusRegister(B1, []);
  await assert.rejects(NB.exportApproved(B1, reg, join(REPO, "assets", "avatar-northstar-b1"), {}), /outside the repository/);
  await assert.rejects(NB.exportApproved(B1, reg, join(REPO, "..", "somewhere-private"), {}), /nothing approved/);
  assert.equal(NB.outsideRepo(join(REPO, "tools")), false); assert.equal(NB.outsideRepo(join(REPO, "..", "x")), true);
});
