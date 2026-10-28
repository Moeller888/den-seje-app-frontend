// D-244/D-245 NORTHSTAR BATCH — the production flow for a batch of items on the fixed figure C, built from the existing tools (no
// second system): design file → frozen, VALIDATED prompts (and a readable overview) → an UNAUTHORISED call plan with its documented
// price, an enforceable call cap and a fixed checkpoint → (a separate authorisation and a send adapter of the D-235 pattern) → raw
// pictures with receipts → item-pipeline runs in chunks (northstar-item-pilot.mjs runPipeline) → a status register with the freely
// combinable set → an export of APPROVED items in D-242's runtime format to a PRIVATE directory. It sends nothing and never
// authorises a call.
//
// STATUS (never inferred upwards): "afvist" — technically rejected, or rejected in review; "kræver-gennemgang" — technically OK
// with an open finding, an approval that no longer matches the layers, or (outfits) an item that needs review; "kandidat" —
// technically OK, not yet approved; "godkendt" — ONLY an owner entry in the batch's review file whose pinned hashes match the
// current layers (outfits: and all three items approved); "uafprøvet" — never run. The assistant may reject (with a reason) and
// recommend, never approve. Every combination keeps its status; none is dropped.
// THE CATALOGUE ("one size fits all"): only the FREELY COMBINABLE SET — approved items of which EVERY top × bottom × shoes
// combination is approved — may be offered as freely combinable. Usable candidates and that set are reported apart; an approved
// item outside the set is listed with the partners it fails with, never hidden, and no matching set is made the default.
//
// Usage:
//   node tools/avatar/northstar-batch.mjs plan --batch b1                writes b1-prompts-v1.json, b1-prompts-v1.md, b1-calls-v1.json
//   node tools/avatar/northstar-batch.mjs authorise --batch b1 --decision D-246 --token "<token>" --adapter <path>   (D-246)
//   node tools/avatar/northstar-batch.mjs record --batch b1 --call <call id> --item <item> --report <report.json>   b1.pipeline.json
//   node tools/avatar/northstar-batch.mjs checkpoint-manifest --batch b1 --receipts <file> --out <file outside the repo>
//   node tools/avatar/northstar-batch.mjs checkpoint --batch b1 --run <checkpoint run dir> [--marks <item,…>]   B1-CHECKPOINT.json
//   node tools/avatar/northstar-batch.mjs manifests --batch b1 --receipts <file> --out <dir outside the repo>   one per bottom
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
/** D-245 SCOPE: what C's existing picture and the layer contract can carry. C's runtime body has no skin under the base top
 *  (torso and hips are empty), the head stack and its neck band are protected and drawn above the top, a top is ONE garment
 *  (no layer under an opening), bottoms stay within the hip and hem envelope, and a shoe's edge is a painted outline inside its
 *  envelope. A design that needs more is a new body or a new method, not a batch item. */
export const SCOPE_RULES = Object.freeze([
  { category: "top", re: /\b(v-?neck|scoop|open (collar|front|neck)|unbuttoned|open jacket|crop(ped)?|midriff|belly|off[- ]the[- ]shoulder|off[- ]shoulder|strapless)\b/i, why: "shows torso skin that C's runtime body does not have (the torso is empty under the base top)" },
  { category: "top", re: /\b(stand(-| )?up collar|stand collar|turtle-?neck|polo neck|mock neck|hood(ie|ed)?|scarf)\b/i, why: "rises into the protected neck band under the head stack" },
  { category: "top", re: /\b(over a|layered|under a|jacket over|vest over|open over)\b/i, why: "two garments: a top is one layer" },
  { category: "bottom", re: /\b(wide[- ]leg|flared?|bell[- ]bottoms?|palazzo|a-line|full skirt|circle skirt|puffy|balloon)\b/i, why: "wider than the hip and hem envelope (seam-contract-v2)" },
  { category: "bottom", re: /\b(low[- ]rise|hip[- ]huggers?|high[- ]waist(ed)?|belt with|belted)\b/i, why: "moves the waist seam or adds a line in the waistband zone" },
  { category: "shoes", re: /\b(fur|faux-?fur|fluffy|fuzzy|shearling|feathers?|tassels?|fringe)\b/i, why: "a soft, see-through edge the extraction does not separate from C's leg" },
  { category: "shoes", re: /\b(chunky|platform|thick sole|wedge|high heels?|stiletto|knee-high|tall shaft|over the knee)\b/i, why: "outside the shoe envelope or above the shaft limit" },
]);
export function scopeErrors(d) { return SCOPE_RULES.filter((r) => r.category === d.category && r.re.test([d.cut, d.material, d.pattern, d.garment].join(" "))).map((r) => d.id + ": out of scope — " + r.why); }
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
    if (typeof d.scope !== "string" || !d.scope.trim()) errors.push(tag + ": state why it fits C's picture and the layer contract (scope)");
    errors.push(...scopeErrors(d));
    if (byCat[d.category]) byCat[d.category].push(d); }
  for (const c of CATS) { const seen = new Map();
    for (const d of byCat[c]) { const s = signature(d), other = seen.get(s);
      if (other && !(other.existing && d.existing)) errors.push(d.id + ": the same cut, material and pattern as " + other.id + " — a colour change alone is not a new design"); else if (!other) seen.set(s, d); } }
  const cp = b.checkpoint || [];
  if (cp.length !== 6 || new Set(cp).size !== 6 || cp.some((id) => !ids.has(id))) errors.push("checkpoint: six distinct designs of the batch");
  else for (const c of CATS) if (cp.filter((id) => b.designs.find((d) => d.id === id).category === c).length !== 2) errors.push("checkpoint: two designs per category");
  const distribution = Object.fromEntries(CATS.map((c) => { const ds = byCat[c].filter((d) => !d.existing);
    return [c, { designs: ds.length, tones: Object.fromEntries(TONES.map((t) => [t, ds.filter((d) => d.tone === t).length])), patterned: ds.filter((d) => d.pattern.toLowerCase() !== "solid").length }]; }));
  for (const [c, x] of Object.entries(distribution)) { if (!x.designs) continue;
    for (const t of ["light", "dark", "skin-near"]) if (!x.tones[t]) errors.push(c + ": no " + t + " design");
    if (x.patterned < 2) errors.push(c + ": fewer than two designs with a pattern or texture"); }
  return { errors, distribution };
}

// ── 2. frozen, validated prompts ─────────────────────────────────────────────────────────────────────────────────────────────
export const FROZEN = Object.freeze({ prompts: "independent-validation-prompts-v1.json", contract: "seam-contract-v2.json" });
/** Category → the contract's modelDraws key. D-228 and D-235 looked the bottoms' sentence up under "bottom" (the key is "bottoms")
 *  and SENT the word "undefined" in its place (D-244 finding, D-245). Every lookup is now strict. */
export const MODEL_DRAWS_KEY = Object.freeze({ top: "top", bottom: "bottoms", shoes: "shoes" });
const need = (obj, key, what) => { const v = obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
  if (typeof v !== "string" || !v.trim()) throw new Error("prompt part missing: " + what + "[" + JSON.stringify(key) + "]"); return v; };
export function frozenParts() { return { P: json(join(FX, FROZEN.prompts)), C: json(join(FX, FROZEN.contract)) }; }
/** D-235's composition — template(GARMENT, COVERAGE) + modelDraws + the category's reference-sheet sentence — with strict lookups:
 *  a missing, empty or non-string part throws instead of becoming "undefined". */
export function composePrompt(design, parts = frozenParts(), keys = MODEL_DRAWS_KEY) {
  const { P, C } = parts, cat = design && design.category;
  if (!CATS.includes(cat)) throw new Error("prompt part missing: category " + JSON.stringify(cat));
  const garment = need(design, "garment", "design");
  return need(P, "template", "prompts").replace("{GARMENT}", garment).replace("{COVERAGE}", need(P.coverage, cat, "coverage"))
    + " " + need(C.modelDraws, keys[cat], "modelDraws") + " " + need(P.reference, cat, "reference");
}
/** Every finished prompt is checked, not only the template: its own category's coverage, contract instruction and sheet sentence
 *  are present exactly once, no other category's are, the garment is there, and nothing unresolved is left. */
export function validatePrompt(prompt, design, parts = frozenParts()) {
  const { P, C } = parts, cat = design.category, errors = [];
  if (typeof prompt !== "string" || prompt.length < 200) return ["not a prompt"];
  const bad = prompt.match(/\b(undefined|null|NaN)\b|\[object Object\]|\{[A-Z_]+\}|\$\{|<[A-Z_]+>/);
  if (bad) errors.push("unresolved or missing part: " + JSON.stringify(bad[0]));
  const once = (s, what) => { const n = s ? prompt.split(s).length - 1 : 0; if (n !== 1) errors.push(what + " appears " + n + " times"); };
  once(design.garment, "the garment"); once(P.coverage[cat], "the " + cat + " coverage sentence"); once(C.modelDraws[MODEL_DRAWS_KEY[cat]], "the " + cat + " contract instruction"); once(P.reference[cat], "the " + cat + " reference-sheet sentence");
  for (const o of CATS.filter((c) => c !== cat)) for (const [s, what] of [[C.modelDraws[MODEL_DRAWS_KEY[o]], o + " contract instruction"], [P.reference[o], o + " reference-sheet sentence"]]) if (s && prompt.includes(s)) errors.push("contains the " + what);
  if (/\s{2,}/.test(prompt) || prompt !== prompt.trim()) errors.push("stray whitespace (an empty part)");
  return errors;
}
export function buildPrompts(b) {
  const parts = frozenParts(), sources = Object.fromEntries(Object.values(FROZEN).map((f) => [f, sha(readFileSync(join(FX, f)))]));
  const items = Object.fromEntries(b.designs.map((d) => { const prompt = composePrompt(d, parts), errors = validatePrompt(prompt, d, parts);
    if (errors.length) throw new Error(d.id + ": " + errors.join("; ")); const buf = Buffer.from(prompt, "utf8");
    return [d.id, { category: d.category, garment: d.garment, prompt, sha256: sha(buf), bytes: buf.length, checks: "validatePrompt: OK" }]; }));
  return { decision: b.decision, batch: b.batch, status: "FROZEN when planned — D-235's composition and sentences with strict lookups; every prompt validated (D-245). The bottoms carry seam-contract-v2's modelDraws.bottoms sentence that D-228/D-235 sent as \"undefined\". Never adjusted during a batch.", composition: "template({GARMENT}, {COVERAGE}) + ' ' + modelDraws[MODEL_DRAWS_KEY[category]] + ' ' + reference[category]", sources, items };
}
/** The readable overview of the actual prompts (reviewed before their hashes are pinned by an authorisation). */
export function promptsOverview(b, prompts) {
  const { C } = frozenParts(), lines = ["# Batch " + b.batch + " — de faktiske prompts", "", "Genereret af `tools/avatar/northstar-batch.mjs plan` (D-245). Hver prompt er kontrolleret af `validatePrompt`: kategoriens dækningssætning, kontraktinstruktion og referencearksætning findes præcis én gang, ingen anden kategoris, og intet uløst (`undefined`, `null`, pladsholdere).", ""];
  for (const cat of CATS) { lines.push("## " + { top: "Overdele", bottom: "Underdele", shoes: "Lukket fodtøj" }[cat], "", "Kontraktinstruktion (`modelDraws." + MODEL_DRAWS_KEY[cat] + "`):", "", "> " + C.modelDraws[MODEL_DRAWS_KEY[cat]], "");
    for (const d of b.designs.filter((x) => x.category === cat)) { const it = prompts.items[d.id];
      lines.push("### " + d.id + (b.checkpoint.includes(d.id) ? " (checkpoint)" : ""), "", "- Tester: " + d.tests.join("; "), "- Scope: " + d.scope, "- sha256 `" + it.sha256 + "`, " + it.bytes + " bytes", "", "```text", it.prompt, "```", ""); } }
  return lines.join("\n").replace(/\n+$/, "");   // one final newline when written (git diff --check)
}

// ── 3. the call plan: documented price, enforceable cap, fixed checkpoint (never an authorisation) ────────────────────────────
/** Measured on the 12 calls of D-228 and D-235 (their response.json "usage"): the same request shape (C + one reference sheet,
 *  1024x1536, high). Text tokens were 3.7–4.3 bytes of prompt per token; the bound used here is bytes / 3. */
export const MEASURED_USAGE = Object.freeze({ calls: 12, imageInputTokens: 3072, imageOutputTokens: 1372, textBytesPerTokenMin: 3, source: "response.json usage of D-228 V1–V6 and D-235 N1–N6 (identical image token counts in all 12; text 265–357 tokens for 1080–1500-byte prompts)" });
/** DOCUMENTED price: OpenAI API pricing page (developers.openai.com/api/docs/pricing, read 2026-10-28), Standard, per 1M tokens:
 *  gpt-image-2.5-sunburst — image input $8.00, image output $30.00, text input $5.00. The request names the dated snapshot
 *  gpt-image-2.5-sunburst-2026-09-08; the page lists the model name without a snapshot price — the snapshot is assumed to carry it. */
export const PRICE = Object.freeze({ model: "gpt-image-2.5-sunburst", source: "https://developers.openai.com/api/docs/pricing (Standard, read 2026-10-28)", imageInputPerM: 8, textInputPerM: 5, imageOutputPerM: 30, snapshotAssumption: "the request's snapshot gpt-image-2.5-sunburst-2026-09-08 is billed at the listed gpt-image-2.5-sunburst price" });
export function costOfCall(promptBytes, usage = MEASURED_USAGE, price = PRICE) {
  const text = Math.ceil(promptBytes / usage.textBytesPerTokenMin);
  return (usage.imageInputTokens * price.imageInputPerM + text * price.textInputPerM + usage.imageOutputTokens * price.imageOutputPerM) / 1e6;
}
export function costEstimate(prompts, reserve, usage = MEASURED_USAGE, price = PRICE) {
  const per = Object.fromEntries(Object.entries(prompts.items).map(([id, it]) => [id, costOfCall(it.bytes, usage, price)]));
  const max = Math.max(...Object.values(per)), r = (x) => Math.round(x * 10000) / 10000;
  return { currency: "USD", documented: { price, usage }, perCallMax: r(max), designs: r(Object.values(per).reduce((a, b) => a + b, 0)), reserveMax: r(reserve * max), totalMax: r(Object.values(per).reduce((a, b) => a + b, 0) + reserve * max),
    enforceable: "the CALL COUNT (one-shot claims per call id; a spent claim is never repeated), not a dollar amount — the project cannot stop OpenAI billing at a sum",
    uncertainty: "token counts are measured on 12 calls of the same request shape, not guaranteed; the price is the published list price, not an invoice — every response's usage is recorded and checked at the checkpoint (C5); the billed amount is for the owner to read on the OpenAI usage page" };
}
/** The fixed checkpoint, then the rest interleaved (top, bottom, shoes, …). */
export function callOrder(b) {
  const cp = b.checkpoint.map((id) => b.designs.find((d) => d.id === id)), rest = b.designs.filter((d) => !b.checkpoint.includes(d.id)), il = (list) => { const by = CATS.map((c) => list.filter((d) => d.category === c)), out = []; for (let i = 0; by.some((l) => l[i]); i++) for (const l of by) if (l[i]) out.push(l[i]); return out; };
  return [...il(cp), ...il(rest)];
}
export const CHECKPOINT_RULES = Object.freeze([
  "PROMPT: before every send the adapter re-composes the prompt, checks validatePrompt and its pinned sha256; any failure stops the WHOLE batch (our tool's fault: no reserve, no resend)",
  "AFTER THE SIX CHECKPOINT CALLS the six are processed (method d240, outfit check d239) with the existing items, BEFORE call 7 is sent; the batch stops when ANY of these holds:",
  "  C1 two or more of the six are technically rejected for the same fault class (generation, extraction or fit), or three or more in all",
  "  C2 a checkpoint bottom fails a rule its now-sent instruction names: SC-W3 (waistband zone), SC-W6 (hip width) or SC-L1 (hem band) — the corrected instruction is not followed",
  "  C3 a received picture carries reference marks, fails registration (G-1), or is not a 1024x1536 RGBA PNG twice",
  "  C4 the outfits of the six with the existing items: fewer than half technically OK",
  "  C5 the token usage in the six responses (response.json usage) × the documented price exceeds 6 × the documented per-call maximum by more than 50 % (the price assumption is wrong)",
  "otherwise the remaining 18 are sent in order without further owner input",
]);
export function buildCallPlan(b, prompts, { reserve = 4 } = {}) {
  const d235 = json(join(FX, "independent-validation-calls-v1.json")), order = callOrder(b), n = order.length;
  return { decision: b.decision, batch: b.batch, status: "PREPARED — NOT AUTHORISED: no call may be sent. A separate owner authorisation (its own D-number and token) must name the calls, the reserve and the send adapter.",
    meta: { authorisesImageRequest: false, kind: "a production-readiness batch: no catalogue, no runtime, no activation" },
    budget: { requested: n, reserveRequested: reserve, maxCalls: n + reserve, authorised: 0, actuallySent: 0, reusesEarlierPermissions: false, oneCallPerDesign: true },
    cost: costEstimate(prompts, reserve),
    privacy: { cSentToApi: "only under the future authorisation", referenceSheetsSentToApi: "only under the future authorisation (C-derived, the D-235 v2 sheets)", publishOrTrack: "never — C, the sheets and every result stay outside both clones (D-127 §2)", h1: "never used" },
    frozen: { method: b.method, contract: b.contract, outfitRevision: b.outfitRevision, prompts: { file: b.batch + "-prompts-v1.json", sha256: sha(Buffer.from(JSON.stringify(prompts, null, 2) + "\n", "utf8")) } },
    request: d235.request,
    checkpoint: { designs: b.checkpoint, rules: CHECKPOINT_RULES },
    reserveRule: "at most " + reserve + " reserve calls, each only to resend a design whose RECEIPT failed for a reason in the API's answer, not in the design and not in our tools: a picture that is not a 1024x1536 RGBA PNG, a first moderation block, or a registration failure (G-1) of the received picture. Never for a disliked look, a prompt or tool fault, or an uncertain dispatch (DISPATCHED_RESULT_UNKNOWN and the like are spent and never resent automatically); never twice for one design.",
    stopRules: [...d235.stopRules.filter((r) => !/STOP\.json/.test(r)),
      "the executor's stop file " + b.batch.toUpperCase() + "-STOP.json (a common method failure after a receipt)",
      "the checkpoint rules C1–C5 after call 6",
      "after the checkpoint: technical rejections reaching 9 of the calls sent"],
    calls: order.map((d, i) => ({ callId: b.batch.toUpperCase() + "-" + d.id, order: i + 1, checkpoint: b.checkpoint.includes(d.id), item: d.id, category: d.category, type: d.type, tone: d.tone, pattern: d.pattern, tests: d.tests,
      prompt: { item: d.id, sha256: prompts.items[d.id].sha256, bytes: prompts.items[d.id].bytes }, reference: d.category,
      claim: { identity: b.batch.toUpperCase() + "-" + d.id + "-claim", filename: b.batch.toUpperCase() + "-" + d.id + ".claim.json", eventsFilename: b.batch.toUpperCase() + "-" + d.id + ".events.jsonl" },
      output: "<Documents>/DenSejeApp-artefacts/" + b.batch + "-batch/" + b.batch.toUpperCase() + "-" + d.id + "/" + b.batch + ".image-1.png", mandateState: "UNAUTHORISED" })) };
}

// ── 4. the combination matrix and the chunked runs ──────────────────────────────────────────────────────────────────────────
/** Every combination of the batch's designs and its existing items; one chunk per bottom (all tops, one bottom, all shoes). */
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
/** One runPipeline manifest per chunk. receipts: { id: { raw (relative to <Documents>/DenSejeApp-artefacts), rawSha256, sourceCall } }. */
export function chunkManifests(b, receipts) {
  const m = matrix(b), pins = existingRawPins(), typeOf = Object.fromEntries(b.designs.map((d) => [d.id, d]));
  const entry = (id) => { const d = typeOf[id], p = d ? receipts[id] : pins[id]; if (!p) return null;
    return { id, category: IP.ITEM_CATEGORY[id], type: d ? d.type : p.type, covering: IP.ITEM_CATEGORY[id] === "shoes" ? IP.COVERING[id] : "none", sourceCall: p.sourceCall, raw: p.raw, rawSha256: p.rawSha256 }; };
  return m.chunks.map((c) => { const items = c.items.map(entry).filter(Boolean);
    const man = { decision: b.decision, batch: b.batch, chunk: c.bottom, method: b.method, rawRoot: "<Documents>/DenSejeApp-artefacts", note: "one bottom, every top and shoe of the batch matrix", items,
      findingsRegister: "tools/avatar/fixtures/northstar-wardrobe/findings-register.json", reviewRegister: "tools/avatar/fixtures/northstar-wardrobe/findings-register-review.json" };
    if (items.some((i) => i.category === "bottom")) IP.validateManifest(man); return man; });
}

// ── 5. the status register and the freely combinable set ────────────────────────────────────────────────────────────────────
const layerHashes = (files) => Object.fromEntries(Object.entries(files || {}).filter(([n]) => /^layer-|^shadow-multiply/.test(n)).sort());
/** The FREELY COMBINABLE SET: from the approved items, remove — one at a time, the item with the largest share of non-approved
 *  combinations (ties: id order) — until every top × bottom × shoes combination of what remains is approved. Deterministic. Each
 *  removed item is listed with the combinations it failed in at its removal; nothing is hidden. */
export function freelyCombinable(approvedItems, outfitStatus, categoryOf) {
  const S = Object.fromEntries(CATS.map((c) => [c, approvedItems.filter((id) => categoryOf(id) === c).sort()])), excluded = [];
  const triples = () => { const out = []; for (const t of S.top) for (const bo of S.bottom) for (const s of S.shoes) out.push([t, bo, s]); return out; };
  for (;;) { const all = triples(); if (!all.length) break; const bad = all.filter((x) => outfitStatus(x.join("+")) !== STATUS.APPROVED); if (!bad.length) break;
    const share = {}; for (const x of all) for (const id of x) share[id] = share[id] || { bad: 0, all: 0 }; for (const x of all) for (const id of x) share[id].all++; for (const x of bad) for (const id of x) share[id].bad++;
    const worst = Object.keys(share).sort((a, b) => share[b].bad / share[b].all - share[a].bad / share[a].all || (a < b ? -1 : 1))[0];
    excluded.push({ id: worst, failsWith: bad.filter((x) => x.includes(worst)).map((x) => x.join("+")) });
    S[categoryOf(worst)] = S[categoryOf(worst)].filter((id) => id !== worst); }
  const n = S.top.length * S.bottom.length * S.shoes.length;
  return { tops: S.top, bottoms: S.bottom, shoes: S.shoes, combinations: n, excluded };
}
/** runs: [{ dir (relative to <Documents>/DenSejeApp-artefacts), run (run.json) }]; review: the batch's review file ({ entries }). */
export function statusRegister(b, runs, review = { entries: [] }) {
  const m = matrix(b), items = {}, outfits = {}, entries = Array.isArray(review && review.entries) ? review.entries : [];
  const verdict = (kind, id) => entries.filter((e) => e && e.kind === kind && e.id === id);
  const assistant = (kind, id) => verdict(kind, id).filter((e) => e.by === "assistant" && /^(recommend-approve|recommend-reject|uncertain)$/.test(e.verdict)).map((e) => ({ verdict: e.verdict, reason: e.reason || "" }));
  for (const { dir, run } of runs) for (const [id, it] of Object.entries(run.items || {})) {
    const h = layerHashes(it.files), prev = items[id];
    if (prev && JSON.stringify(prev.layers) !== JSON.stringify(h)) throw new Error(id + ": its layers differ between runs " + prev.run + " and " + dir);
    if (!prev) items[id] = { run: dir, method: run.method, technical: it.status, openFindings: it.openFindings || [], layers: h, faults: it.faults }; }
  const itemStatus = {};
  for (const id of [...m.tops, ...m.bottoms, ...m.shoes]) { const it = items[id], reasons = [];
    let st;
    if (!it) { st = STATUS.UNTESTED; reasons.push("not processed (no call, or its receipt failed)"); }
    else if (it.technical === "rejected" || it.technical === "technically-rejected") { st = STATUS.REJECTED; reasons.push("technically rejected"); }
    else { const rej = verdict("item", id).filter((e) => e.verdict === "rejected" && (e.by === "owner" || e.by === "assistant")), ok = verdict("item", id).filter((e) => e.verdict === "approved" && e.by === "owner");
      if (rej.length) { st = STATUS.REJECTED; reasons.push("rejected in review: " + rej.map((e) => e.by + " " + (e.reason || "")).join("; ")); }
      else if (it.openFindings.length) { st = STATUS.REVIEW; reasons.push("open findings " + it.openFindings.join(", ")); }
      else if (ok.length) { const match = ok.some((e) => JSON.stringify(e.layers) === JSON.stringify(it.layers));
        st = match ? STATUS.APPROVED : STATUS.REVIEW; reasons.push(match ? "approved by the owner (" + ok.map((e) => e.ref || e.date).join(", ") + ")" : "an approval that no longer matches the layers"); }
      else { st = STATUS.CANDIDATE; reasons.push("technically OK, not reviewed"); } }
    itemStatus[id] = { status: st, reasons, assistant: assistant("item", id), ...(it ? { run: it.run, method: it.method, layers: it.layers } : {}) }; }
  const runOutfit = {}; for (const { dir, run } of runs) for (const [name, o] of Object.entries((run.package && run.package.outfits) || {})) if (!runOutfit[name]) runOutfit[name] = { ...o, run: dir, fullPngSha256: (run.package.files || {})["outfit-" + name + ".full.png"] || (run.package.files || {})["rejected-outfit-" + name + ".full.png"] || null };
  for (const name of m.outfits) { const ids = name.split("+"), st = ids.map((id) => itemStatus[id].status), o = runOutfit[name], reasons = [];
    let s;
    if (st.includes(STATUS.REJECTED)) { s = STATUS.REJECTED; reasons.push("contains a rejected item: " + ids.filter((id, k) => st[k] === STATUS.REJECTED).join(", ")); }
    else if (!o) { s = STATUS.UNTESTED; reasons.push(st.includes(STATUS.UNTESTED) ? "an item was never processed" : "not run"); }
    else if (o.status === "rejected") { s = STATUS.REJECTED; reasons.push("combination check: " + (o.failedChecks || []).join(", ")); }
    else { const rej = verdict("outfit", name).filter((e) => e.verdict === "rejected" && (e.by === "owner" || e.by === "assistant")), ok = verdict("outfit", name).filter((e) => e.verdict === "approved" && e.by === "owner");
      if (rej.length) { s = STATUS.REJECTED; reasons.push("rejected in review: " + rej.map((e) => e.by + " " + (e.reason || "")).join("; ")); }
      else if (o.status === "technically-ok-open-finding" || st.includes(STATUS.REVIEW)) { s = STATUS.REVIEW; reasons.push(o.status === "technically-ok-open-finding" ? "open findings " + (o.openFindings || []).join(", ") : "an item needs review"); }
      else if (ok.length && st.every((x) => x === STATUS.APPROVED) && ok.some((e) => e.fullPngSha256 === o.fullPngSha256)) { s = STATUS.APPROVED; reasons.push("approved by the owner"); }
      else { s = STATUS.CANDIDATE; reasons.push(ok.length ? "an approval that no longer matches, or an item not approved" : "technically OK, not reviewed"); } }
    outfits[name] = { status: s, reasons, assistant: assistant("outfit", name), ...(o ? { run: o.run, fullPngSha256: o.fullPngSha256 } : {}) }; }
  const count = (map) => Object.fromEntries(Object.values(STATUS).map((v) => [v, Object.values(map).filter((x) => x.status === v).length]));
  const approvedItems = Object.keys(itemStatus).filter((id) => itemStatus[id].status === STATUS.APPROVED);
  const free = freelyCombinable(approvedItems, (n) => (outfits[n] ? outfits[n].status : STATUS.UNTESTED), (id) => IP.ITEM_CATEGORY[id]);
  const amongApproved = m.outfits.filter((n) => n.split("+").every((id) => approvedItems.includes(id)));
  return { decision: b.decision, batch: b.batch, rule: "a technical pass is never an approval; every combination keeps its status — none is hidden; only the freely combinable set may be offered as freely combinable", items: itemStatus, outfits,
    summary: { items: count(itemStatus), outfits: count(outfits),
      usableCandidates: { what: "items a person may use at all (approved), whatever they combine with", approvedItems: approvedItems.length },
      investigation: { what: "a measurement, not a production approval", combinationsOfApprovedItems: amongApproved.length, approvedAmongThem: amongApproved.filter((n) => outfits[n].status === STATUS.APPROVED).length },
      freelyCombinable: { what: "the set the catalogue may offer as freely combinable: every top × bottom × shoes of it is approved", ...free } } };
}

// ── 6. the export of approved items (runtime format, PRIVATE) ────────────────────────────────────────────────────────────────
/** D-242's runtime format for the approved outfits, written OUTSIDE both clones: publishing new layers needs a new owner permission
 *  (D-242's exception covers its 31 files only). The manifest carries the whole register and the freely combinable set. */
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
    outfits: Object.fromEntries(outfits), freelyCombinable: register.summary.freelyCombinable, combinations: Object.fromEntries(Object.entries(register.outfits).map(([n, o]) => [n, o.status])), summary: register.summary, equivalence, files: entries };
  mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { files: entries.length, outfits: outfits.length };
}

// ── 7. the authorisation file, per-call pipeline records and the checkpoint verdict (D-246) ────────────────────────────────
/** The send adapter's stop rules for a batch — D-235's, reconciled with the frozen reserve rule and checkpoint C3: a FIRST picture
 *  that is not a 1024x1536 RGBA PNG, a FIRST moderation block and a FIRST registration failure may be resent with a reserve; the
 *  second of any of them stops the batch. Every rule below is enforced by the adapter before a claim. */
export function adapterStopRules(b) {
  const B = b.batch.toUpperCase();
  return ["credit or access: HTTP 401, 403 or 429, or an error code naming quota or billing",
    "uncertain dispatch: DISPATCHED_RESULT_UNKNOWN, NOT_DISPATCHED, RESPONSE_BODY_UNREADABLE, UNEXPECTED, or a claim without a written outcome — never resent",
    "request shape: HTTP 400 that is not a moderation block, or any HTTP 5xx",
    "format: a second received picture that is not a 1024x1536 RGBA PNG (the first may be resent with a reserve)",
    "moderation: a second moderation block (the first may be resent with a reserve)",
    "registration: a second registration failure G-1 in the pipeline records (the first may be resent with a reserve)",
    "processing: a received picture without its pipeline record (" + b.batch + ".pipeline.json) stops the next call until it is processed",
    "technical rejections: 9 of the pipeline records",
    "checkpoint: no call after the six checkpoint calls without " + B + "-CHECKPOINT.json whose verdict is CONTINUE with C1–C5 passed",
    "the executor's stop file " + B + "-STOP.json (a common method failure, e.g. reference marks drawn into two pictures)"];
}
export const reserveIds = (b, n) => Array.from({ length: n }, (_, k) => b.batch.toUpperCase() + "-reserve-" + (k + 1));
/** The authorisation file of a batch (the plan file stays the unauthorised plan): every design call and every reserve slot as an
 *  UNSPENT, single-use entry with its own claim identity; the request, the frozen inputs and their hashes. */
export function buildAuthorisation(b, prompts, plan, { decision, token, adapter, reserve = 4 }) {
  const fileSha = (f) => sha(readFileSync(join(BATCHES, f)));
  const entry = (callId, extra) => ({ callId, ...extra, claim: { identity: callId + "-claim", filename: callId + ".claim.json", eventsFilename: callId + ".events.jsonl" }, mandateState: "UNSPENT", outcome: "NOT YET ATTEMPTED" });
  return { decision, batch: b.batch, status: "AUTHORISED by " + decision + " (" + token + "): each entry is ONE single-use call; the plan " + b.batch + "-calls-v1.json stays the unauthorised plan it was",
    meta: { authorisesImageRequest: false, why: "authorisation is the exact token in " + decision + "'s decision status plus this file's unspent entries, never a general boolean", kind: "a production-readiness batch: no catalogue, no runtime, no activation" },
    budget: { authorised: plan.budget.maxCalls, designs: plan.budget.requested, reserve, retries: 0, automaticExtension: false, actuallySent: 0, enforcedLimit: "the call count; the price is an estimate (" + b.batch + "-calls-v1.json cost)" },
    privacy: { cSentToApi: "allowed for this batch only (owner, 2026-10-28)", referenceSheetsSentToApi: "allowed for this batch only (C-derived, the D-235 v2 sheets)", publishOrTrack: "never — C, the sheets, the raw results and every export stay outside both clones (D-127 §2)", h1: "never used" },
    frozen: { method: b.method, contract: b.contract, outfitRevision: b.outfitRevision, planDecision: b.decision,
      files: Object.fromEntries([b.batch + "-designs-v1.json", b.batch + "-prompts-v1.json", b.batch + "-prompts-v1.md", b.batch + "-calls-v1.json"].map((f) => [f, fileSha(f)])) },
    request: plan.request, stopRules: adapterStopRules(b),
    checkpoint: { designs: b.checkpoint, rules: CHECKPOINT_RULES, verdictFile: b.batch.toUpperCase() + "-CHECKPOINT.json" },
    reserveRule: plan.reserveRule,
    calls: [...plan.calls.map((c) => entry(c.callId, { order: c.order, checkpoint: c.checkpoint, item: c.item, category: c.category, prompt: c.prompt, reference: c.reference })),
      ...reserveIds(b, reserve).map((id, k) => entry(id, { order: plan.calls.length + k + 1, reserve: true, item: null, category: null, for: "a design call named at the send (--for=), only by the reserve rule" }))],
    adapterImplementations: { isAuthorisation: false, adapter, status: "IMPLEMENTED — NOT EXECUTED", ownerApprovalFlag: "--owner-approval=" + decision, mergeIsNotAnInstruction: true, executionRequiresSeparateOwnerInstruction: true } };
}
/** The pipeline record of one received picture (from northstar-item-pilot.mjs --process … report.json), written next to the
 *  call's outputs: what the adapter needs to enforce the technical-rejection, registration and reserve rules. */
export function pipelineRecord(callId, item, report) {
  if (!report || report.item !== item) throw new Error("the report is not " + item + "'s");
  const f = report.faults || {}, cls = (f.generation || []).length ? "generation" : (f.extraction || []).length ? "extraction" : (f.fit || []).length ? "fit" : null;
  return { callId, item, method: report.method, ok: report.ok === true, faultClass: report.ok === true ? null : cls || "unknown", faults: f, g1: !!(report.registration && report.registration.ok === false), rawSha256: report.raw && report.raw.sha256 };
}
/** The checkpoint run: the existing items and the six checkpoint designs (one manifest; every combination of them). */
export function checkpointManifest(b, receipts) {
  const pins = existingRawPins(), typeOf = Object.fromEntries(b.designs.map((d) => [d.id, d]));
  const ids = [...(b.existing || []).map((e) => e.id), ...b.checkpoint.filter((id) => receipts[id])];
  const items = ids.map((id) => { const d = typeOf[id], p = d ? receipts[id] : pins[id];
    return { id, category: IP.ITEM_CATEGORY[id], type: d ? d.type : p.type, covering: IP.ITEM_CATEGORY[id] === "shoes" ? IP.COVERING[id] : "none", sourceCall: p.sourceCall, raw: p.raw, rawSha256: p.rawSha256 }; });
  const man = { decision: b.decision, batch: b.batch, chunk: "checkpoint", method: b.method, rawRoot: "<Documents>/DenSejeApp-artefacts", note: "the existing items and the checkpoint designs", items,
    findingsRegister: "tools/avatar/fixtures/northstar-wardrobe/findings-register.json", reviewRegister: "tools/avatar/fixtures/northstar-wardrobe/findings-register-review.json" };
  IP.validateManifest(man); return man;
}
/** C1–C5 on the six checkpoint designs. outcomes: { design id: classification of its LAST call (incl. a reserve) }; records: { design
 *  id: pipelineRecord }; run: the checkpoint run.json; usage: [response usage of every checkpoint call]; marks: design ids whose
 *  received picture carries reference marks (the assistant's receipt check). A design without a received picture counts as rejected. */
export function evaluateCheckpoint(b, { outcomes, records, run, usage, marks = [] }, plan) {
  const cp = b.checkpoint, rules = {};
  const rej = cp.filter((id) => !records[id] || !records[id].ok), byClass = {};
  for (const id of rej) { const c = records[id] ? records[id].faultClass : "no picture"; byClass[c] = (byClass[c] || 0) + 1; }
  rules.C1 = { pass: rej.length < 3 && !Object.entries(byClass).some(([c, n]) => c !== "no picture" && n >= 2), rejected: rej, byClass };
  const bottoms = cp.filter((id) => IP.ITEM_CATEGORY[id] === "bottom"), broke = {};
  for (const id of bottoms) { const it = run.items && run.items[id], failed = ((it && it.seamContract && it.seamContract.failed) || []).map((x) => x.id).filter((x) => /^SC-(W3|W6|L1)\b/.test(x)); if (failed.length) broke[id] = failed; }
  rules.C2 = { pass: !Object.keys(broke).length, bottoms, broken: broke, note: "SC-W3 waistband zone, SC-W6 hip width, SC-L1 hem band — rules the now-sent instruction names" };
  const format = Object.values(outcomes).filter((c) => c === "TECHNICAL_REJECT").length, g1 = cp.filter((id) => records[id] && records[id].g1).length;
  rules.C3 = { pass: format < 2 && g1 < 2 && marks.length < 2, format, g1, marks };
  const names = Object.keys((run.package && run.package.outfits) || {}).filter((n) => n.split("+").some((id) => cp.includes(id)));
  const okN = names.filter((n) => run.package.outfits[n].status !== "rejected").length;
  rules.C4 = { pass: names.length > 0 && okN / names.length >= 0.5, outfits: names.length, technicallyOk: okN };
  const cost = usage.reduce((s, u) => s + ((u.input_tokens_details?.image_tokens || 0) * PRICE.imageInputPerM + (u.input_tokens_details?.text_tokens || 0) * PRICE.textInputPerM + (u.output_tokens_details?.image_tokens || u.output_tokens || 0) * PRICE.imageOutputPerM) / 1e6, 0);
  const cap = 6 * plan.cost.perCallMax * 1.5;
  rules.C5 = { pass: cost <= cap, usdAtListPrice: Math.round(cost * 1e4) / 1e4, limit: Math.round(cap * 1e4) / 1e4, calls: usage.length };
  const complete = cp.every((id) => outcomes[id] !== undefined);
  return { batch: b.batch, verdict: complete && Object.values(rules).every((r) => r.pass) ? "CONTINUE" : "STOP", complete, calls: cp, rules, evaluatedAt: new Date().toISOString(), note: "CONTINUE lets the adapter send call 7 onwards; it approves no item" };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const [cmd, ...rest] = process.argv.slice(2), arg = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
  const b = loadBatch(arg("--batch")), v = validateBatch(b); if (v.errors.length) throw new Error("the design file is invalid:\n  " + v.errors.join("\n  "));
  const runsOf = () => (arg("--runs") || "").split(",").filter(Boolean).map((d) => ({ dir: relative(ARTEFACTS, resolve(d)).split("\\").join("/"), run: json(join(resolve(d), "run.json")) }));
  const reviewFile = join(BATCHES, b.batch + "-review-v1.json"), review = existsSync(reviewFile) ? json(reviewFile) : { entries: [] };
  if (cmd === "plan") { const prompts = buildPrompts(b), calls = buildCallPlan(b, prompts);
    writeFileSync(join(BATCHES, b.batch + "-prompts-v1.json"), JSON.stringify(prompts, null, 2) + "\n"); writeFileSync(join(BATCHES, b.batch + "-prompts-v1.md"), promptsOverview(b, prompts) + "\n");
    writeFileSync(join(BATCHES, b.batch + "-calls-v1.json"), JSON.stringify(calls, null, 2) + "\n");
    console.log(JSON.stringify({ designs: b.designs.length, distribution: v.distribution, calls: calls.budget, cost: { perCallMax: calls.cost.perCallMax, totalMax: calls.cost.totalMax }, combinations: matrix(b).outfits.length })); return; }
  // D-246: the authorisation file, the per-call pipeline record and the checkpoint verdict (the last two outside the repository)
  const batchRoot = join(ARTEFACTS, b.batch + "-batch"), B = b.batch.toUpperCase();
  if (cmd === "authorise") { const prompts = json(join(BATCHES, b.batch + "-prompts-v1.json")), plan = json(join(BATCHES, b.batch + "-calls-v1.json"));
    const a = buildAuthorisation(b, prompts, plan, { decision: arg("--decision"), token: arg("--token"), adapter: arg("--adapter") });
    writeFileSync(join(BATCHES, b.batch + "-authorisation-v1.json"), JSON.stringify(a, null, 2) + "\n"); console.log(JSON.stringify(a.budget)); return; }
  if (cmd === "record") { const callId = arg("--call"), item = arg("--item"), rec = pipelineRecord(callId, item, json(resolve(arg("--report"))));
    const f = join(batchRoot, callId, b.batch + ".pipeline.json"); if (existsSync(f)) throw new Error("a pipeline record exists already: " + f);
    writeFileSync(f, JSON.stringify(rec, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify(rec)); return; }
  if (cmd === "checkpoint") { const auth = json(join(BATCHES, b.batch + "-authorisation-v1.json")), plan = json(join(BATCHES, b.batch + "-calls-v1.json"));
    const outcomes = {}, records = {}, usage = [];
    for (const e of auth.calls) { const d = join(batchRoot, e.callId), mf = join(d, b.batch + ".request.json"); if (!existsSync(mf)) continue; const m = json(mf), item = m.item;
      if (!b.checkpoint.includes(item)) continue; outcomes[item] = m.outcome && m.outcome.classification; if (m.response && m.response.usage) usage.push(m.response.usage);
      const pf = join(d, b.batch + ".pipeline.json"); if (existsSync(pf)) records[item] = json(pf); else delete records[item]; }
    const v = evaluateCheckpoint(b, { outcomes, records, run: json(join(resolve(arg("--run")), "run.json")), usage, marks: (arg("--marks") || "").split(",").filter(Boolean) }, plan);
    const f = join(batchRoot, B + "-CHECKPOINT.json"); if (existsSync(f)) throw new Error("the checkpoint verdict exists already: " + f);
    writeFileSync(f, JSON.stringify(v, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify({ verdict: v.verdict, rules: Object.fromEntries(Object.entries(v.rules).map(([k, r]) => [k, r.pass])) })); return; }
  if (cmd === "checkpoint-manifest") { const out = arg("--out"); if (!out || !outsideRepo(out)) throw new Error("--out must be outside the repository");
    writeFileSync(out, JSON.stringify(checkpointManifest(b, json(resolve(arg("--receipts")))), null, 2) + "\n"); return; }
  const out = arg("--out"); if (!out || !outsideRepo(out)) throw new Error("--out must be outside the repository");
  if (cmd === "manifests") { const receipts = json(resolve(arg("--receipts"))); mkdirSync(out, { recursive: true });
    for (const m of chunkManifests(b, receipts)) writeFileSync(join(out, "manifest-" + m.chunk + ".json"), JSON.stringify(m, null, 2) + "\n"); return; }
  if (cmd === "status") { const reg = statusRegister(b, runsOf(), review); writeFileSync(out, JSON.stringify(reg, null, 2) + "\n"); console.log(JSON.stringify(reg.summary)); return; }
  if (cmd === "export") { const reg = statusRegister(b, runsOf(), review); console.log(JSON.stringify(await exportApproved(b, reg, out, { cwebp: arg("--cwebp"), dwebp: arg("--dwebp") }))); return; }
  throw new Error("commands: plan | authorise | record | checkpoint-manifest | checkpoint | manifests | status | export");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
