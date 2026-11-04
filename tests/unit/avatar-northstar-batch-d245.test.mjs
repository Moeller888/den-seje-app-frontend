// D-245: the b1 plan corrected before any authorisation — every FINISHED prompt validated (each category, misspelled lookups,
// unresolved parts), the readable prompt overview, the documented "undefined" defect of the five earlier bottom calls, the scope
// rules against C's picture and the layer contract, the fixed checkpoint, the documented price and the enforceable call cap, the
// freely combinable set, and the assistant's recommendations that never approve. No private file, no call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as NB from "../../tools/avatar/northstar-batch.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), FX = join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe");
const json = (p) => JSON.parse(readFileSync(p, "utf8")), sha = (b) => createHash("sha256").update(b).digest("hex"), clone = (x) => JSON.parse(JSON.stringify(x));
const B1 = NB.loadBatch("b1"), PARTS = NB.frozenParts(), PROMPTS = json(join(NB.BATCHES, "b1-prompts-v1.json"));

test("D-245 every finished b1 prompt carries its own category's instruction exactly once, no other's, and nothing unresolved", () => {
  assert.equal(Object.keys(PROMPTS.items).length, 24);
  for (const d of B1.designs) { const p = PROMPTS.items[d.id].prompt;
    assert.deepEqual(NB.validatePrompt(p, d, PARTS), [], d.id);
    assert.ok(p.includes(PARTS.C.modelDraws[NB.MODEL_DRAWS_KEY[d.category]]), d.id + ": its contract instruction");
    assert.ok(!/\bundefined\b|\bnull\b|\{[A-Z_]+\}/.test(p), d.id); }
  for (const c of ["top", "bottom", "shoes"]) assert.ok(B1.designs.some((d) => d.category === c), c);
});

test("D-245 strict lookups: a misspelled key, a missing or empty part throws instead of becoming \"undefined\"", () => {
  const d = (category) => B1.designs.find((x) => x.category === category);
  for (const [keys, what] of [[{ ...NB.MODEL_DRAWS_KEY, bottom: "bottom" }, /modelDraws\["bottom"\]/], [{ ...NB.MODEL_DRAWS_KEY, top: "tops" }, /modelDraws\["tops"\]/], [{ ...NB.MODEL_DRAWS_KEY, shoes: "shoe" }, /modelDraws\["shoe"\]/]])
    assert.throws(() => NB.composePrompt(d(Object.keys(keys).find((k) => keys[k] !== NB.MODEL_DRAWS_KEY[k])), PARTS, keys), what);
  assert.throws(() => NB.composePrompt({ category: "bottoms", garment: "x" }, PARTS), /category/);
  assert.throws(() => NB.composePrompt({ ...d("top"), garment: "" }, PARTS), /garment/);
  const empty = clone(PARTS); empty.P.coverage.shoes = "  "; assert.throws(() => NB.composePrompt(d("shoes"), empty), /coverage\["shoes"\]/);
  const gone = clone(PARTS); delete gone.P.reference.bottom; assert.throws(() => NB.composePrompt(d("bottom"), gone), /reference\["bottom"\]/);
  // the D-228/D-235 defect itself is caught by the validator of the finished prompt
  const bottom = d("bottom"), good = NB.composePrompt(bottom, PARTS), bad = good.replace(PARTS.C.modelDraws.bottoms, "undefined");
  assert.ok(NB.validatePrompt(bad, bottom, PARTS).some((e) => /unresolved or missing part: "undefined"/.test(e)));
  assert.ok(NB.validatePrompt(bad, bottom, PARTS).some((e) => /bottom contract instruction appears 0 times/.test(e)));
  assert.ok(NB.validatePrompt(good.replace(bottom.garment, "{GARMENT}"), bottom, PARTS).some((e) => /unresolved/.test(e)));
  assert.ok(NB.validatePrompt(good + " null", bottom, PARTS).some((e) => /"null"/.test(e)));
  assert.ok(NB.validatePrompt(good + " " + PARTS.C.modelDraws.top, bottom, PARTS).some((e) => /contains the top contract instruction/.test(e)));
  assert.ok(NB.validatePrompt(good.replace(PARTS.P.reference.bottom, PARTS.P.reference.shoes), bottom, PARTS).some((e) => /shoes reference-sheet sentence/.test(e)));
  assert.ok(NB.validatePrompt(good.replace(" " + PARTS.C.modelDraws.bottoms, " " + PARTS.C.modelDraws.bottoms + " " + PARTS.C.modelDraws.bottoms), bottom, PARTS).some((e) => /appears 2 times/.test(e)));
  assert.ok(NB.validatePrompt(good.replace(". ", ".  "), bottom, PARTS).some((e) => /stray whitespace/.test(e)));
});

test("D-245 the readable overview is the actual prompts, generated with them", () => {
  const md = readFileSync(join(NB.BATCHES, "b1-prompts-v1.md"), "utf8");
  assert.equal(md, NB.promptsOverview(B1, PROMPTS) + "\n");
  for (const d of B1.designs) { assert.ok(md.includes(PROMPTS.items[d.id].prompt), d.id); assert.ok(md.includes(PROMPTS.items[d.id].sha256), d.id); }
  assert.ok(md.includes(PARTS.C.modelDraws.bottoms));
});

test("D-245 the defect is documented exactly: five earlier bottom calls sent \"undefined\"; their pins prove it; the conclusions are corrected", () => {
  const D = json(join(FX, "prompt-defect-bottoms-d245.json")); assert.equal(D.missingInstruction, PARTS.C.modelDraws.bottoms);
  assert.deepEqual(D.calls.map((c) => c.callId), ["D-228-seam-V3", "D-228-seam-V4", "D-228-seam-V5", "D-235-new-N3", "D-235-new-N4"]);
  for (const c of D.calls) { const P = json(join(FX, c.promptFile)), p = P.items[c.item].prompt; assert.ok(c.sentWithUndefined && / undefined Image 2 /.test(p), c.callId); assert.equal(sha(Buffer.from(p, "utf8")), c.promptSha256, c.callId); assert.equal(c.mandateState, "SPENT", c.callId); }
  // every other sent prompt of D-207/D-228/D-235 is complete
  for (const f of ["item-pilot-prompts-v1.json", "seam-validation-prompts-v1.json", "independent-validation-prompts-v1.json"]) for (const [id, it] of Object.entries(json(join(FX, f)).items)) if (!D.calls.some((c) => c.item === id)) assert.ok(!/\bundefined\b/.test(it.prompt), f + " " + id);
  for (const n of ["D-231", "D-232", "D-238", "D-239"]) assert.match(readFileSync(join(REPO, "docs", "decisions", n + ".md"), "utf8"), /\*\*Rettelse ved D-245 \(2026-10-28\)\.\*\*[\s\S]*prompt-defect-bottoms-d245\.json/, n);
});

test("D-245 scope: designs that need skin C lacks, the protected neck band, two garments or a wider envelope are refused; b1 fits", () => {
  const d0 = (category) => clone(B1.designs.find((x) => x.category === category));
  for (const [category, garment, why] of [["top", "a cropped tee showing the midriff", /torso skin/], ["top", "a v-neck sweater", /torso skin/], ["top", "a shirt with an open collar", /torso skin/], ["top", "an open jacket", /torso skin/], ["top", "a track jacket with a stand-up collar", /neck band/], ["top", "a hoodie", /neck band/], ["top", "a vest over a shirt", /two garments/],
    ["bottom", "wide-leg trousers", /envelope/], ["bottom", "an A-line skirt", /envelope/], ["bottom", "flared jeans", /envelope/], ["bottom", "low-rise jeans", /waist seam/], ["shoes", "boots with a faux-fur cuff", /see-through edge/], ["shoes", "sneakers with a chunky sole", /envelope or above the shaft/], ["shoes", "knee-high boots", /shaft/]]) {
    const d = d0(category); d.garment = garment; assert.ok(NB.scopeErrors(d).some((e) => why.test(e)), garment); }
  assert.deepEqual(B1.designs.flatMap((d) => NB.scopeErrors(d)), []);
  assert.ok(B1.designs.every((d) => typeof d.scope === "string" && d.scope.length > 20));
  const nb = clone(B1); delete nb.designs[0].scope; assert.ok(NB.validateBatch(nb).errors.some((e) => /state why it fits/.test(e)));
});

test("D-245 checkpoint: two per category incl. the corrected bottoms, sent first, criteria fixed before sending; reserves never for our faults or uncertain dispatch", () => {
  const C = json(join(NB.BATCHES, "b1-calls-v1.json"));
  assert.deepEqual(C.calls.slice(0, 6).map((c) => c.item).sort(), [...B1.checkpoint].sort()); assert.ok(C.calls.slice(0, 6).every((c) => c.checkpoint) && C.calls.slice(6).every((c) => !c.checkpoint));
  assert.equal(C.calls.slice(0, 6).filter((c) => c.category === "bottom").length, 2);
  assert.deepEqual(C.checkpoint.rules, [...NB.CHECKPOINT_RULES]);
  for (const k of ["PROMPT:", "C1 ", "C2 ", "C3 ", "C4 ", "C5 "]) assert.ok(C.checkpoint.rules.some((r) => r.trim().startsWith(k)), k);
  assert.match(C.checkpoint.rules.find((r) => r.trim().startsWith("C2")), /SC-W3[\s\S]*SC-W6[\s\S]*SC-L1/);
  assert.match(C.reserveRule, /never[^.]*a prompt or tool fault, or an uncertain dispatch/i); assert.match(C.reserveRule, /never resent automatically/);
  const bad = clone(B1); bad.checkpoint = bad.checkpoint.slice(0, 5); assert.ok(NB.validateBatch(bad).errors.some((e) => /checkpoint/.test(e)));
  const lop = clone(B1); lop.checkpoint = B1.designs.filter((d) => d.category === "top").slice(0, 6).map((d) => d.id); assert.ok(NB.validateBatch(lop).errors.some((e) => /two designs per category/.test(e)));
});

test("D-245 economics: the documented price of the exact model × measured usage; the enforceable limit is the call count, not dollars", () => {
  assert.equal(NB.PRICE.model, "gpt-image-2.5-sunburst"); assert.match(NB.PRICE.source, /developers\.openai\.com\/api\/docs\/pricing/);
  assert.deepEqual([NB.PRICE.imageInputPerM, NB.PRICE.textInputPerM, NB.PRICE.imageOutputPerM], [8, 5, 30]);
  assert.equal(NB.costOfCall(1500), (3072 * 8 + 500 * 5 + 1372 * 30) / 1e6);
  const C = json(join(NB.BATCHES, "b1-calls-v1.json")), per = Object.values(PROMPTS.items).map((it) => NB.costOfCall(it.bytes));
  assert.equal(C.cost.totalMax, Math.round((per.reduce((a, b) => a + b, 0) + 4 * Math.max(...per)) * 1e4) / 1e4);
  assert.match(C.cost.enforceable, /CALL COUNT/); assert.match(C.cost.uncertainty, /not guaranteed/); assert.ok(!("B" in (C.cost.perCall || {})), "no borrowed price scenario");
  assert.ok(!/pricepertoken|help\.openai\.com|gpt-image-1\b/.test(JSON.stringify(C.cost)), "no other model's or enterprise price");
});

test("D-245 the freely combinable set: only items whose every combination is approved; usable candidates reported apart; the rest listed with their failures", () => {
  const T = ["top-a", "top-b"], Bo = ["bottom-a", "bottom-b"], S = ["shoes-a", "shoes-b"], cat = (id) => id.split("-")[0];
  const ok = (n) => (n.includes("bottom-b") && n.includes("shoes-b") ? "afvist" : "godkendt");
  const f = NB.freelyCombinable([...T, ...Bo, ...S], ok, cat);
  assert.equal(f.combinations, f.tops.length * f.bottoms.length * f.shoes.length); assert.equal(f.excluded.length, 1);
  assert.ok(["bottom-b", "shoes-b"].includes(f.excluded[0].id)); assert.deepEqual(f.excluded[0].failsWith.length, 2);
  for (const t of f.tops) for (const b of f.bottoms) for (const s of f.shoes) assert.equal(ok([t, b, s].join("+")), "godkendt");
  assert.deepEqual(NB.freelyCombinable([...T, ...Bo, ...S], ok, cat), f, "deterministic");
  const reg = NB.statusRegister(B1, []); assert.match(reg.summary.investigation.what, /not a production approval/);
  assert.deepEqual([reg.summary.usableCandidates.approvedItems, reg.summary.freelyCombinable.combinations], [0, 0]);
});

test("D-245 the assistant recommends, groups and rejects — it never approves; recommendations are shown, statuses unchanged", () => {
  const T = "top-polo-navy", run = { method: "d240", items: { [T]: { status: "technically-ok", openFindings: [], files: { "layer-topBody.png": sha("t") } } }, package: { outfits: {}, files: {} } };
  const reg = NB.statusRegister(B1, [{ dir: "x", run }], { entries: [{ kind: "item", id: T, verdict: "recommend-approve", by: "assistant", reason: "clean collar" }, { kind: "item", id: T, verdict: "approved", by: "assistant" }] });
  assert.equal(reg.items[T].status, "kandidat"); assert.deepEqual(reg.items[T].assistant, [{ verdict: "recommend-approve", reason: "clean collar" }]);
});
