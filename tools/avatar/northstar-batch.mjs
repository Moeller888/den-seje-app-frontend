// D-244 NORTHSTAR BATCH — the production flow for a batch of items on the fixed figure C, built from the existing tools (no second
// system): design file → frozen prompts and an UNAUTHORISED call plan with a cost estimate → (a separate authorisation and a send
// adapter of the D-235 pattern) → raw pictures with receipts → item-pipeline runs in chunks (northstar-item-pilot.mjs runPipeline,
// method and outfit check as pinned) → a status register → an export of APPROVED items in D-242's runtime format to a PRIVATE
// directory (buildLayerSet / writeLayerSet). It sends nothing and never authorises a call.
//
// STATUS (never inferred upwards): "afvist" — technically rejected, or rejected in review; "kræver-gennemgang" — technically OK
// with an open finding, an approval that no longer matches the layers, or (outfits) an item that needs review; "kandidat" —
// technically OK, not yet approved; "godkendt" — ONLY an owner entry in the batch's review file whose pinned hashes match the
// current layers (outfits: and all three items approved); "uafprøvet" — never run. A technical pass is never an approval, and
// every combination keeps its status in the register and the export: a rejected one is listed, never dropped.
//
// Usage:
//   node tools/avatar/northstar-batch.mjs plan --batch b1                       writes b1-prompts-v1.json and b1-calls-v1.json
//   node tools/avatar/northstar-batch.mjs manifests --batch b1 --receipts <dir> --out <dir outside the repo>   one per bottom
//   node tools/avatar/northstar-batch.mjs status --batch b1 --runs <dir>[,<dir>…] --out <file outside the repo>
//   node tools/avatar/northstar-batch.mjs export --batch b1 --runs <dirs> --out <dir outside the repo> --cwebp <exe> --dwebp <exe>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import * as IP from "./northstar-item-pilot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FX = join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe");
export const BATCHES = IP.BATCH_DIR;
export const ARTEFACTS = join(homedir(), "Documents", "DenSejeApp-artefacts");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
export const STATUS = Object.freeze({ REJECTED: "afvist", REVIEW: "kræver-gennemgang", CANDIDATE: "kandidat", APPROVED: "godkendt", UNTESTED: "uafprøvet" });
export const TONES = Object.freeze(["light", "dark", "skin-near", "mid"]);
const CATS = Object.freeze(["top", "bottom", "shoes"]);
export const outsideRepo = (p) => { const r = relative(ROOT, resolve(p)); return r.startsWith("..") || isAbsolute(r); };

export function loadBatch(name) {
  if (!/^[a-z0-9]+$/.test(name || "")) throw new Error("a batch name is lower-case letters and digits");
  const b = json(join(BATCHES, name + "-designs-v1.json")); if (b.batch !== name) throw new Error("the file names batch " + b.batch); return b;
}

// ── 1. the design file ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** What makes a design different: its cut, material and pattern. Colour and tone alone never do. */
export const signature = (d) => [d.cut, d.material, d.pattern].map((x) => String(x || "").trim().toLowerCase()).join(" | ");
const FORBIDDEN_WORDS = /\b(text|logos?|letters?|numbers?|brand(ed)?|slogan|sandals?|flip-?flops?|open[- ]toe)\b/i;
/** Errors (the batch may not be planned) and the distribution per category. Every rule is general, never per design. */
export function validateBatch(b) {
  const errors = [], ids = new Set(), byCat = Object.fromEntries(CATS.map((c) => [c, []]));
  if (!b || !Array.isArray(b.designs) || !b.designs.length) return { errors: ["no designs"], distribution: {} };
  for (const e of b.existing || []) if (byCat[e.category]) byCat[e.category].push({ ...e, existing: true });
  for (const d of b.designs) {
    const tag = d && d.id ? d.id : "?";
    if (!d || typeof d.id !== "string" || ids.has(d.id)) { errors.push(tag + ": a missing or repeated id"); continue; } ids.add(d.id);
    if (!CATS.includes(d.category) || !d.id.startsWith(d.category + "-")) errors.push(tag + ": the id must start with its category");
    for (const k of ["type", "cut", "material", "tone", "pattern", "garment"]) if (typeof d[k] !== "string" || !d[k].trim()) errors.push(tag + ": no " + k);
    if (!TONES.includes(d.tone)) errors.push(tag + ": tone must be one of " + TONES.join(", "));
    if (FORBIDDEN_WORDS.test(d.garment || "") || /sandal/i.test(d.type || "")) errors.push(tag + ": the garment may name no text, logo, brand or open footwear (sandals are parked)");
    if (d.category === "shoes" && d.covering !== "closed-footwear") errors.push(tag + ": shoes must be closed footwear");
    if (!IP.BATCH_ITEMS[d.id] || IP.BATCH_ITEMS[d.id].category !== d.category) errors.push(tag + ": not registered in the pipeline (northstar-item-pilot.mjs BATCH_ITEMS)");
    if (!Array.isArray(d.tests) || !d.tests.length) errors.push(tag + ": name what the design tests");
    if (byCat[d.category]) byCat[d.category].push(d); }
  for (const c of CATS) { const seen = new Map();
    for (const d of byCat[c]) { const s = signature(d), other = seen.get(s);
      if (other && !(other.existing && d.existing)) errors.push(d.id + ": the same cut, material and pattern as " + other.id + " — a colour change alone is not a new design"); else if (!other) seen.set(s, d); } }
  const distribution = Object.fromEntries(CATS.map((c) => { const ds = byCat[c].filter((d) => !d.existing);
    return [c, { designs: ds.length, tones: Object.fromEntries(TONES.map((t) => [t, ds.filter((d) => d.tone === t).length])), patterned: ds.filter((d) => d.pattern.toLowerCase() !== "solid").length }]; }));
  for (const [c, x] of Object.entries(distribution)) { if (!x.designs) continue;
    for (const t of ["light", "dark", "skin-near"]) if (!x.tones[t]) errors.push(c + ": no " + t + " design");
    if (x.patterned < 2) errors.push(c + ": fewer than two designs with a pattern or texture"); }
  return { errors, distribution };
}

// ── 2. frozen prompts ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const FROZEN = Object.freeze({ prompts: "independent-validation-prompts-v1.json", contract: "seam-contract-v2.json" });
const MODEL_DRAWS_KEY = Object.freeze({ top: "top", bottom: "bottoms", shoes: "shoes" });
/** D-235's composition: template(GARMENT, COVERAGE) + modelDraws + the reference-sheet sentence of the category — with the bottoms'
 *  contract sentence that D-228 and D-235 looked up under "bottom" and therefore SENT as the word "undefined" (D-244 finding). */
export function composePrompt(design) {
  const P = json(join(FX, FROZEN.prompts)), C = json(join(FX, FROZEN.contract));
  return P.template.replace("{GARMENT}", design.garment).replace("{COVERAGE}", P.coverage[design.category]) + " " + C.modelDraws[MODEL_DRAWS_KEY[design.category]] + " " + P.reference[design.category];
}
export function buildPrompts(b) {
  const sources = Object.fromEntries(Object.values(FROZEN).map((f) => [f, sha(readFileSync(join(FX, f)))]));
  const items = Object.fromEntries(b.designs.map((d) => { const prompt = composePrompt(d), buf = Buffer.from(prompt, "utf8");
    return [d.id, { category: d.category, garment: d.garment, prompt, sha256: sha(buf), bytes: buf.length }]; }));
  return { decision: b.decision, batch: b.batch, status: "FROZEN when planned — D-235's composition and sentences; only the garment differs, and the bottoms carry seam-contract-v2's modelDraws.bottoms sentence that D-228/D-235 sent as \"undefined\" (D-244). Never adjusted during a batch.", composition: "template({GARMENT}, {COVERAGE}) + ' ' + modelDraws[category] + ' ' + reference[category]", sources, items };
}

// ── 3. the call plan and its cost (never an authorisation) ───────────────────────────────────────────────────────────────────
/** Measured on the 12 calls of D-228 and D-235 (their response.json "usage", <Documents>/DenSejeApp-artefacts/d-228-…, d-235-…):
 *  the same request shape (C + one reference sheet, 1024x1536, high). */
export const MEASURED_USAGE = Object.freeze({ calls: 12, imageInputTokens: 3072, textInputTokensMax: 357, imageOutputTokens: 1372, source: "response.json usage of D-228 V1–V6 and D-235 N1–N6 (identical image token counts in all 12)" });
/** Two price scenarios in USD — ASSUMPTIONS: the price of gpt-image-2.5-sunburst-2026-09-08 is published nowhere the project could
 *  read. A: GPT-Image-2.0's token rates (OpenAI help-center rate card as quoted in a web search, 2026-10-28: $8 / 1M image input,
 *  $5 / 1M text input, $30 / 1M image output). B (ceiling): the dearest known per-picture price, gpt-image-1 high 1024×1536 ≈ $0.25
 *  (pricepertoken.com: $0.167 at 1024×1024, ×1.5 for portrait), plus input at gpt-image-1's $10 / 1M image and $5 / 1M text. */
export const RATE_SCENARIOS = Object.freeze({
  A: { what: "GPT-Image-2.0 token rates", imageInputPerM: 8, textInputPerM: 5, imageOutputPerM: 30, perPicture: null },
  B: { what: "ceiling: gpt-image-1 high 1024×1536 per picture + gpt-image-1 input rates", imageInputPerM: 10, textInputPerM: 5, imageOutputPerM: null, perPicture: 0.25 },
});
export function costEstimate(calls, usage = MEASURED_USAGE, rates = RATE_SCENARIOS) {
  const per = Object.fromEntries(Object.entries(rates).map(([k, r]) => [k, (usage.imageInputTokens * r.imageInputPerM + usage.textInputTokensMax * r.textInputPerM) / 1e6 + (r.perPicture ?? usage.imageOutputTokens * r.imageOutputPerM / 1e6)]));
  const round = (x) => Math.round(x * 10000) / 10000;
  return { currency: "USD", calls, perCall: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, round(v)])), total: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, round(v * calls)])), usage, rates };
}
/** Interleaved order (top, bottom, shoes, top, …) so an early stop has seen every category. */
export const interleave = (b) => { const by = CATS.map((c) => b.designs.filter((d) => d.category === c)), out = []; for (let i = 0; by.some((l) => l[i]); i++) for (const l of by) if (l[i]) out.push(l[i]); return out; };
export function buildCallPlan(b, prompts, { reserve = 4 } = {}) {
  const d235 = json(join(FX, "independent-validation-calls-v1.json")), order = interleave(b), n = order.length;
  return { decision: b.decision, batch: b.batch, status: "PREPARED — NOT AUTHORISED: no call may be sent. A separate owner authorisation (its own D-number and token) must name the calls, the reserve, the budget ceiling and the send adapter.",
    meta: { authorisesImageRequest: false, kind: "a production-readiness batch: no catalogue, no runtime, no activation" },
    budget: { requested: n, reserveRequested: reserve, maxCalls: n + reserve, authorised: 0, actuallySent: 0, reusesEarlierPermissions: false, oneCallPerDesign: true },
    cost: costEstimate(n + reserve),
    privacy: { cSentToApi: "only under the future authorisation", referenceSheetsSentToApi: "only under the future authorisation (C-derived, the D-235 v2 sheets)", publishOrTrack: "never — C, the sheets and every result stay outside both clones (D-127 §2)", h1: "never used" },
    frozen: { method: b.method, contract: b.contract, outfitRevision: b.outfitRevision, prompts: { file: b.batch + "-prompts-v1.json", sha256: sha(Buffer.from(JSON.stringify(prompts, null, 2) + "\n", "utf8")) } },
    request: d235.request,
    reserveRule: "at most " + reserve + " reserve calls, each only to resend a design whose RECEIPT failed for a reason that is not the design: a picture that is not a 1024x1536 RGBA PNG, a first moderation block, or a registration failure (G-1). Never for a look that is disliked, never twice for one design.",
    stopRules: [...d235.stopRules.filter((r) => !/STOP\.json/.test(r)),
      "the executor's stop file " + b.batch.toUpperCase() + "-STOP.json (a common method failure after a receipt: G-1 in two calls, or reference marks drawn into two pictures)",
      "quality checkpoint after call 6 (two per category): if 3 or more of the first 6 are technically rejected by the item pipeline, stop and report — a method problem, not chance",
      "if technical rejections reach 9 of the calls sent (over a third of 24), stop"],
    calls: order.map((d, i) => ({ callId: b.batch.toUpperCase() + "-" + d.id, order: i + 1, item: d.id, category: d.category, type: d.type, tone: d.tone, pattern: d.pattern, tests: d.tests,
      prompt: { item: d.id, sha256: prompts.items[d.id].sha256, bytes: prompts.items[d.id].bytes }, reference: d.category,
      claim: { identity: b.batch.toUpperCase() + "-" + d.id + "-claim", filename: b.batch.toUpperCase() + "-" + d.id + ".claim.json", eventsFilename: b.batch.toUpperCase() + "-" + d.id + ".events.jsonl" },
      output: "<Documents>/DenSejeApp-artefacts/" + b.batch + "-batch/" + b.batch.toUpperCase() + "-" + d.id + "/" + b.batch + ".image-1.png", mandateState: "UNAUTHORISED" })) };
}

// ── 4. the combination matrix and the chunked runs ──────────────────────────────────────────────────────────────────────────
/** Every combination of the batch's designs and its existing items (each category: existing + new); one chunk per bottom, so a
 *  run holds all tops, one bottom and all shoes (memory stays bounded; the item layers are deterministic across chunks). */
export function matrix(b) {
  const of = (c) => [...(b.existing || []).filter((e) => e.category === c).map((e) => e.id), ...b.designs.filter((d) => d.category === c).map((d) => d.id)];
  const tops = of("top"), bottoms = of("bottom"), shoes = of("shoes"), outfits = [];
  for (const t of tops) for (const bo of bottoms) for (const s of shoes) outfits.push([t, bo, s].join("+"));
  return { tops, bottoms, shoes, outfits, chunks: bottoms.map((bo) => ({ bottom: bo, items: [...tops, bo, ...shoes], outfits: tops.length * shoes.length })) };
}
/** The raw pictures of the existing items as their own manifests pinned them (D-239 / D-240 runs). */
export function existingRawPins() {
  const out = {}; for (const f of ["item-pipeline-manifest-d240-boots.json", "item-pipeline-manifest-d239-d235.json", "item-pipeline-manifest-d239-d228.json"]) { const m = json(join(FX, f));
    for (const it of m.items) if (!out[it.id]) out[it.id] = { raw: it.raw, rawSha256: it.rawSha256, sourceCall: it.sourceCall, type: it.type, covering: it.covering }; }
  return out;
}
/** One runPipeline manifest per chunk. receipts: { id: { raw (relative to <Documents>/DenSejeApp-artefacts), rawSha256, sourceCall } }
 *  for the designs whose receipt passed; a design without one is absent (its combinations stay "afvist"/"uafprøvet" by its status). */
export function chunkManifests(b, receipts) {
  const m = matrix(b), pins = existingRawPins(), typeOf = Object.fromEntries(b.designs.map((d) => [d.id, d]));
  const entry = (id) => { const d = typeOf[id], p = d ? receipts[id] : pins[id]; if (!p) return null;
    return { id, category: IP.ITEM_CATEGORY[id], type: d ? d.type : p.type, covering: IP.ITEM_CATEGORY[id] === "shoes" ? IP.COVERING[id] : "none", sourceCall: p.sourceCall, raw: p.raw, rawSha256: p.rawSha256 }; };
  return m.chunks.map((c) => { const items = c.items.map(entry).filter(Boolean);
    const man = { decision: b.decision, batch: b.batch, chunk: c.bottom, method: b.method, rawRoot: "<Documents>/DenSejeApp-artefacts", note: "one bottom, every top and shoe of the batch matrix", items,
      findingsRegister: "tools/avatar/fixtures/northstar-wardrobe/findings-register.json", reviewRegister: "tools/avatar/fixtures/northstar-wardrobe/findings-register-review.json" };
    if (items.some((i) => i.category === "bottom")) IP.validateManifest(man); return man; });
}

// ── 5. the status register ───────────────────────────────────────────────────────────────────────────────────────────────────
const layerHashes = (files) => Object.fromEntries(Object.entries(files || {}).filter(([n]) => /^layer-|^shadow-multiply/.test(n)).sort());
/** runs: [{ dir (relative to <Documents>/DenSejeApp-artefacts), run (run.json) }]; review: the batch's review file ({ entries }). */
export function statusRegister(b, runs, review = { entries: [] }) {
  const m = matrix(b), items = {}, outfits = {}, entries = Array.isArray(review && review.entries) ? review.entries : [];
  const verdict = (kind, id) => entries.filter((e) => e && e.kind === kind && e.id === id);
  for (const { dir, run } of runs) for (const [id, it] of Object.entries(run.items || {})) {
    const h = layerHashes(it.files), prev = items[id];
    if (prev && JSON.stringify(prev.layers) !== JSON.stringify(h)) throw new Error(id + ": its layers differ between runs " + prev.run + " and " + dir);
    if (!prev) items[id] = { run: dir, method: run.method, technical: it.status, openFindings: it.openFindings || [], layers: h, faults: it.faults }; }
  const itemStatus = {};
  for (const id of [...m.tops, ...m.bottoms, ...m.shoes]) { const it = items[id], reasons = [];
    let st;
    if (!it) { st = STATUS.UNTESTED; reasons.push("not processed (no call, or its receipt failed)"); }
    else if (it.technical === "rejected" || it.technical === "technically-rejected") { st = STATUS.REJECTED; reasons.push("technically rejected"); }
    else { const rej = verdict("item", id).filter((e) => e.verdict === "rejected"), ok = verdict("item", id).filter((e) => e.verdict === "approved" && e.by === "owner");
      if (rej.length) { st = STATUS.REJECTED; reasons.push("rejected in review: " + rej.map((e) => e.by + " " + (e.reason || "")).join("; ")); }
      else if (it.openFindings.length) { st = STATUS.REVIEW; reasons.push("open findings " + it.openFindings.join(", ")); }
      else if (ok.length) { const match = ok.some((e) => JSON.stringify(e.layers) === JSON.stringify(it.layers));
        st = match ? STATUS.APPROVED : STATUS.REVIEW; reasons.push(match ? "approved by the owner (" + ok.map((e) => e.ref || e.date).join(", ") + ")" : "an approval that no longer matches the layers"); }
      else { st = STATUS.CANDIDATE; reasons.push("technically OK, not reviewed"); } }
    itemStatus[id] = { status: st, reasons, ...(it ? { run: it.run, method: it.method, layers: it.layers } : {}) }; }
  const runOutfit = {}; for (const { dir, run } of runs) for (const [name, o] of Object.entries((run.package && run.package.outfits) || {})) if (!runOutfit[name]) runOutfit[name] = { ...o, run: dir, fullPngSha256: (run.package.files || {})["outfit-" + name + ".full.png"] || (run.package.files || {})["rejected-outfit-" + name + ".full.png"] || null };
  for (const name of m.outfits) { const ids = name.split("+"), st = ids.map((id) => itemStatus[id].status), o = runOutfit[name], reasons = [];
    let s;
    if (st.includes(STATUS.REJECTED)) { s = STATUS.REJECTED; reasons.push("contains a rejected item: " + ids.filter((id, k) => st[k] === STATUS.REJECTED).join(", ")); }
    else if (!o) { s = STATUS.UNTESTED; reasons.push(st.includes(STATUS.UNTESTED) ? "an item was never processed" : "not run"); }
    else if (o.status === "rejected") { s = STATUS.REJECTED; reasons.push("combination check: " + (o.failedChecks || []).join(", ")); }
    else { const rej = verdict("outfit", name).filter((e) => e.verdict === "rejected"), ok = verdict("outfit", name).filter((e) => e.verdict === "approved" && e.by === "owner");
      if (rej.length) { s = STATUS.REJECTED; reasons.push("rejected in review: " + rej.map((e) => e.by + " " + (e.reason || "")).join("; ")); }
      else if (o.status === "technically-ok-open-finding" || st.includes(STATUS.REVIEW)) { s = STATUS.REVIEW; reasons.push(o.status === "technically-ok-open-finding" ? "open findings " + (o.openFindings || []).join(", ") : "an item needs review"); }
      else if (ok.length && st.every((x) => x === STATUS.APPROVED) && ok.some((e) => e.fullPngSha256 === o.fullPngSha256)) { s = STATUS.APPROVED; reasons.push("approved by the owner"); }
      else { s = STATUS.CANDIDATE; reasons.push(ok.length ? "an approval that no longer matches, or an item not approved" : "technically OK, not reviewed"); } }
    outfits[name] = { status: s, reasons, ...(o ? { run: o.run, fullPngSha256: o.fullPngSha256 } : {}) }; }
  const count = (map) => Object.fromEntries(Object.values(STATUS).map((v) => [v, Object.values(map).filter((x) => x.status === v).length]));
  const approvedItems = Object.keys(itemStatus).filter((id) => itemStatus[id].status === STATUS.APPROVED);
  const amongApproved = m.outfits.filter((n) => n.split("+").every((id) => approvedItems.includes(id)));
  return { decision: b.decision, batch: b.batch, rule: "a technical pass is never an approval; every combination keeps its status — none is hidden", items: itemStatus, outfits,
    summary: { items: count(itemStatus), outfits: count(outfits), combinationsOfApprovedItems: amongApproved.length, approvedAmongThem: amongApproved.filter((n) => outfits[n].status === STATUS.APPROVED).length } };
}

// ── 6. the export of approved items (runtime format, PRIVATE) ────────────────────────────────────────────────────────────────
/** D-242's runtime format for the approved items and outfits, written OUTSIDE both clones: publishing new layers needs a new owner
 *  permission (D-242's exception covers its 31 files only). The manifest carries the whole register, rejected combinations included. */
export async function exportApproved(b, register, outDir, { cwebp, dwebp }) {
  if (!outsideRepo(outDir)) throw new Error("the export holds C-derived layers: write it outside the repository (D-127 §2; D-242's public exception is not extended)");
  const approved = Object.entries(register.outfits).filter(([, o]) => o.status === STATUS.APPROVED).map(([n]) => n);
  if (!approved.length) throw new Error("nothing approved: an export needs owner-approved outfits");
  const ids = [...new Set(approved.flatMap((n) => n.split("+")))], spec = Object.fromEntries(ids.map((id) => [id, { run: register.items[id].run + "", method: register.items[id].method }]));
  const B = await import("./build-northstar-runtime-assets.mjs"), L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const { P, origin } = B.loadItems(spec);
  const outfits = approved.map((n, k) => { const [top, bottom, shoes] = n.split("+"); return [b.batch.toUpperCase() + "-" + String(k + 1).padStart(3, "0"), { top, bottom, shoes }]; });
  const { files, itemTable, equivalence } = B.buildLayerSet({ P, origin, outfits, figureNames: L.NORTHSTAR_FIGURE, planOf: (o, t) => L.northstarPlanFor(o, t), compose: L.northstarCompose });
  const entries = B.writeLayerSet(files, outDir, { cwebp, dwebp });
  const manifest = { decision: b.decision, batch: b.batch, private: true, note: "runtime format of D-242; NOT for tracking or deployment without a new owner permission", items: itemTable,
    outfits: Object.fromEntries(outfits), combinations: Object.fromEntries(Object.entries(register.outfits).map(([n, o]) => [n, o.status])), summary: register.summary, equivalence, files: entries };
  mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { files: entries.length, outfits: outfits.length };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const [cmd, ...rest] = process.argv.slice(2), arg = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
  const b = loadBatch(arg("--batch")), v = validateBatch(b); if (v.errors.length) throw new Error("the design file is invalid:\n  " + v.errors.join("\n  "));
  const runsOf = () => (arg("--runs") || "").split(",").filter(Boolean).map((d) => ({ dir: relative(ARTEFACTS, resolve(d)).split("\\").join("/"), run: json(join(resolve(d), "run.json")) }));
  const reviewFile = join(BATCHES, b.batch + "-review-v1.json"), review = existsSync(reviewFile) ? json(reviewFile) : { entries: [] };
  if (cmd === "plan") { const prompts = buildPrompts(b), calls = buildCallPlan(b, prompts);
    writeFileSync(join(BATCHES, b.batch + "-prompts-v1.json"), JSON.stringify(prompts, null, 2) + "\n"); writeFileSync(join(BATCHES, b.batch + "-calls-v1.json"), JSON.stringify(calls, null, 2) + "\n");
    console.log(JSON.stringify({ designs: b.designs.length, distribution: v.distribution, calls: calls.budget, cost: calls.cost.total, combinations: matrix(b).outfits.length })); return; }
  const out = arg("--out"); if (!out || !outsideRepo(out)) throw new Error("--out must be outside the repository");
  if (cmd === "manifests") { const receipts = json(resolve(arg("--receipts"))); mkdirSync(out, { recursive: true });
    for (const m of chunkManifests(b, receipts)) writeFileSync(join(out, "manifest-" + m.chunk + ".json"), JSON.stringify(m, null, 2) + "\n"); return; }
  if (cmd === "status") { const reg = statusRegister(b, runsOf(), review); writeFileSync(out, JSON.stringify(reg, null, 2) + "\n"); console.log(JSON.stringify(reg.summary)); return; }
  if (cmd === "export") { const reg = statusRegister(b, runsOf(), review); console.log(JSON.stringify(await exportApproved(b, reg, out, { cwebp: arg("--cwebp"), dwebp: arg("--dwebp") }))); return; }
  throw new Error("commands: plan | manifests | status | export");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
