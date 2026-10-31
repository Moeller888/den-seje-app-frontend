// R3 NORTHSTAR EAR FIX (D-193). A new version of the shared Northstar v2 head underlay: the transparent slit between ear and
// face that D-192 documented in D-191's bald head is closed by a precise mask (a narrow horizontal gap between the ear and the
// face, bounded by the head's main component) and a RECONSTRUCTED skin fill. Only the skin layer changes, only inside the
// mask. D-191 and D-192 stay unchanged as historical results; the D-192 afro composes on this head without its local back-hair
// fill, so that fill is never laid twice. REVIEW VARIANT: not approved, not promotable. No image call, no runtime change.
// Usage: node tools/avatar/r3-northstar-earfix.mjs --out <empty dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as HS from "./r3-northstar-hairstyles.mjs";
import * as AF from "./r3-northstar-afro.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const DECISION = "D-193";
export const FIXTURES = "tools/avatar/fixtures/r3-northstar-earfix/";
export const SPEC_FILE = FIXTURES + "spec-v1.json";
export const MANIFEST_FILE = FIXTURES + "manifest-v1.json";
export const LAYERS = Object.freeze(["skin"]);
export const MASKS = Object.freeze(["ear-slit"]);
export const SITUATIONS = Object.freeze(["bald", "northstar", "short", "afro"]);
export const REVIEW_STATUS = "REVIEW VARIANT (D-193) — the shared Northstar v2 head underlay with the ear slit closed; not approved, not promotable";
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));
export function promotionStatus() { return { promotable: false, status: REVIEW_STATUS, reason: "D-193 builds review material only; promotion needs a later, explicit owner decision and is never derived from check results" }; }
export function promote() { throw new Error("the Northstar ear fix is a review variant (D-193) and cannot be promoted by this tool"); }

/** The head's main 4-connected component of the opaque (alpha >= t) bald composite; returns it and the specks left out. */
export function mainComponent(P, t) {
  const lab = new Int32Array(N); let best = 0, bestN = 0, id = 0;
  for (let s = 0; s < N; s++) {
    if (P[s * 4 + 3] < t || lab[s]) continue; id++; let k = 0; const st = [s]; lab[s] = id;
    while (st.length) { const i = st.pop(); k++; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && P[j * 4 + 3] >= t && !lab[j] && Math.abs((j % W) - (i % W)) <= 1) { lab[j] = id; st.push(j); } }
    if (k > bestN) { bestN = k; best = id; }
  }
  const main = new Uint8Array(N); let specks = 0;
  for (let i = 0; i < N; i++) if (lab[i]) { if (lab[i] === best) main[i] = 1; else specks++; }
  return { main, specks, components: id };
}

/** The slit mask (spec.slit): narrow horizontal gaps bounded on both sides by the head's main component, in the ear band. */
export function slitMask(bald, s) {
  const { main, specks, components } = mainComponent(bald, s.alphaThreshold), m = new Uint8Array(N);
  for (let y = s.bandY[0]; y <= s.bandY[1]; y++) for (let x = s.gapPx; x < W - s.gapPx; x++) {
    const i = y * W + x; if (bald[i * 4 + 3] >= s.alphaThreshold) continue;
    let l = false, r = false; for (let d = 1; d <= s.gapPx; d++) { if (main[i - d]) l = true; if (main[i + d]) r = true; }
    if (l && r) m[i] = 1;
  }
  // pinholes the gap closes in: all 8 neighbours opaque (alpha >= threshold) or in the mask, repeated until nothing changes
  for (let round = 0; round < 8; round++) {
    const pin = [];
    for (let y = s.bandY[0]; y <= s.bandY[1]; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (m[i] || bald[i * 4 + 3] >= s.alphaThreshold) continue;
      if ([i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1].every((j) => bald[j * 4 + 3] >= s.alphaThreshold || m[j])) pin.push(i);
    }
    if (!pin.length) break; for (const i of pin) m[i] = 1;
  }
  return { mask: m, main, specks, components };
}

export function buildEarFix({ spec = loadSpec() } = {}) {
  if (spec.baseline.manifest !== HS.MANIFEST_FILE) throw new Error("the spec does not name the D-191 baseline");
  const head = HS.buildHairstyles(), bald0 = HS.composeSituation(head, "bald");
  const { mask, main, specks, components } = slitMask(bald0, spec.slit);
  const known = new Uint8Array(N); for (let i = 0; i < N; i++) if (main[i] && !mask[i] && bald0[i * 4 + 3] >= 250) known[i] = 1;
  const f = NL.harmonicFill(bald0, mask, known), skin = new Uint8ClampedArray(head.layers.skin);
  for (let i = 0; i < N; i++) if (mask[i]) { for (let c = 0; c < 3; c++) skin[i * 4 + c] = Math.round(f[i * 3 + c]); skin[i * 4 + 3] = 255; }
  const maskPx = new Uint8ClampedArray(N * 4); let n = 0, left = 0;
  for (let i = 0; i < N; i++) if (mask[i]) { maskPx.set([255, 0, 200, 255], i * 4); n++; if (i % W < W / 2) left++; }
  return { head, layers: { ...head.layers, skin }, masks: { "ear-slit": maskPx }, mask, stats: { slitPx: n, slitLeftPx: left, slitRightPx: n - left, specksOutsideHeadPx: specks, opaqueComponents: components } };
}

/** The D-192 afro layer and its back-hair fill, read through D-192's pins. */
export function loadD192Afro() { const t = AF.loadTracked(); return { afro: decodePng(t.files.afro).px, backHair: decodePng(t.files.backHair).px }; }

/** A situation on the fixed head; short and afro tinted with a hair token (default brown), no cast shadow, no back-hair fill. */
export function composeSituation(build, situation, rgb = HS.HAIR_TOKEN_BROWN, afro = null) {
  const L = build.layers, bald = HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow");
  if (situation === "northstar") return HD.composeHead(L);
  const head = HD.composeHead(L, { include: bald });
  if (situation === "bald") return head;
  if (situation === "short") return NL.overStack([head, HS.tint(build.head.styles.short, rgb)]);
  if (situation === "afro") return NL.overStack([head, HS.tint((afro ?? loadD192Afro()).afro, rgb)]);
  throw new Error(`unknown situation ${situation}`);
}

export function loadTracked() {
  const man = JSON.parse(rel(MANIFEST_FILE).toString("utf8")), files = {};
  for (const [k, e] of Object.entries({ ...man.layers, ...man.masks })) { const b = rel(e.file); if (sha(b) !== e.sha256) throw new Error(`${e.file} is not the pinned ${e.sha256}`); files[k] = b; }
  if (sha(rel(SPEC_FILE)) !== man.spec.sha256) throw new Error(`${SPEC_FILE} is not the pinned ${man.spec.sha256}`);
  return { man, files };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), outDir = i >= 0 ? args[i + 1] : null;
  if (!outDir) throw new Error("usage: --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  for (const d of ["layers", "masks"]) mkdirSync(join(OUT, d), { recursive: true });
  const b = buildEarFix(), pins = {};
  for (const k of LAYERS) { writeFileSync(join(OUT, "layers", `${k}.png`), encodePng(W, H, b.layers[k])); pins[`layers/${k}`] = pixelSha256(b.layers[k]); }
  for (const [k, px] of Object.entries(b.masks)) { writeFileSync(join(OUT, "masks", `${k}.png`), encodePng(W, H, px)); pins[`masks/${k}`] = pixelSha256(px); }
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ decision: DECISION, status: REVIEW_STATUS, pixelSha256: pins, stats: b.stats }, null, 2) + "\n");
  console.log(JSON.stringify(b.stats));
}
