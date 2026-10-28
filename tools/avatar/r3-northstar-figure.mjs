// R3 NORTHSTAR FIGURE (D-194). The Northstar-based R3 head (D-193, ear slit closed) on Northstar v2's own body and clothes as a
// REFERENCE body, in master coordinates: the body layer is the master minus the bald head (unchanged where the head is absent,
// empty under the opaque head — no second neck or collar — and the exact remainder under the head's antialiased edge, the
// 'neck-seam' mask). The documented hair-lock residue below the right ear moves from the skin to the hair layer. Northstar's
// hair, short and afro sit on the same figure at the same size and place. REVIEW COMPOSITION: not an R3 body asset, not a
// clothing solution, not promotable. No H1, no image call, no runtime change; R3 stays default OFF.
// Usage: node tools/avatar/r3-northstar-figure.mjs --out <empty dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as HS from "./r3-northstar-hairstyles.mjs";
import * as EF from "./r3-northstar-earfix.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
export const DECISION = "D-194";
export const FIXTURES = "tools/avatar/fixtures/r3-northstar-figure/";
export const SPEC_FILE = FIXTURES + "spec-v1.json";
export const MANIFEST_FILE = FIXTURES + "manifest-v1.json";
export const MASKS = Object.freeze(["hair-residue-to-hair", "neck-seam", "under-head"]);
export const SITUATIONS = Object.freeze(["northstar", "short", "afro"]);
export const REVIEW_STATUS = "REVIEW COMPOSITION (D-194) — the Northstar-based R3 head on Northstar v2's own body and clothes as a reference body; not an R3 body asset, not a clothing solution, not promotable";
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));
export function promotionStatus() { return { promotable: false, status: REVIEW_STATUS, reason: "D-194 builds a review composition only; Northstar's body and clothes are a reference, never an R3 asset; promotion needs a later, explicit owner decision" }; }
export function promote() { throw new Error("the Northstar figure is a review composition (D-194) and cannot be promoted by this tool"); }
const BALD = HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow");

/** The documented hair-lock residue (spec.residue) moved from the skin to the hair layer. Returns new layers + the mask. */
export function moveResidue(layers, r) {
  const skin = new Uint8ClampedArray(layers.skin), hair = new Uint8ClampedArray(layers.hair), bald = HD.composeHead(layers, { include: BALD });
  const { main } = EF.mainComponent(bald, 128), m = new Uint8Array(N);
  for (let y = r.bandY[0]; y <= r.bandY[1]; y++) for (let x = r.nearHairPx; x < W - r.nearHairPx; x++) {
    const i = y * W + x; if (!skin[i * 4 + 3] || main[i]) continue; const R = skin[i * 4], G = skin[i * 4 + 1], B = skin[i * 4 + 2];
    if (!(R > G && G > B && R - B >= 30 && R <= 200)) continue;
    let near = false; for (let dy = -r.nearHairPx; dy <= r.nearHairPx && !near; dy++) for (let dx = -r.nearHairPx; dx <= r.nearHairPx; dx++) if (layers.hair[(i + dy * W + dx) * 4 + 3] >= 128) { near = true; break; }
    if (near) m[i] = 1;
  }
  for (let i = 0; i < N; i++) if (m[i]) { if (!hair[i * 4 + 3]) hair.set(skin.subarray(i * 4, i * 4 + 4), i * 4); skin[i * 4] = skin[i * 4 + 1] = skin[i * 4 + 2] = skin[i * 4 + 3] = 0; }
  return { layers: { ...layers, skin, hair }, mask: m };
}

/** The reference body (spec.body): master minus the bald head below the seam line, in master coordinates. */
export function bodyLayer(master, bald, b) {
  const body = new Uint8ClampedArray(N * 4), seam = new Uint8Array(N), under = new Uint8Array(N);
  for (let y = b.seamY; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, j = i * 4, ha = bald[j + 3] / 255, ma = master[j + 3] / 255;
    if (ha === 0) { body.set(master.subarray(j, j + 4), j); continue; }
    if (bald[j + 3] >= b.opaqueHeadAlpha) { under[i] = 1; continue; }
    seam[i] = 1; const ba = (ma - ha) / (1 - ha); if (ba <= 0) continue;
    for (let c = 0; c < 3; c++) body[j + c] = Math.round(Math.min(255, Math.max(0, (master[j + c] * ma - bald[j + c] * ha) / (1 - ha) / Math.min(1, ba))));
    body[j + 3] = Math.round(Math.min(1, ba) * 255);
  }
  return { body, seam, under };
}

export function buildFigure({ spec = loadSpec() } = {}) {
  if (spec.baseline.manifest !== EF.MANIFEST_FILE) throw new Error("the spec does not name the D-193 baseline");
  if (spec.source.sha256 !== NL.SOURCE.sha256) throw new Error("the spec does not name the tracked Northstar v2");
  const ef = EF.buildEarFix(), master = NL.loadSource();
  const { layers, mask: residue } = moveResidue(ef.layers, spec.residue);
  const bald = HD.composeHead(layers, { include: BALD }), { body, seam, under } = bodyLayer(master, bald, spec.body);
  const ns = HD.composeHead(layers); let above = 0; for (let i = 0; i < spec.body.seamY * W; i++) if (master[i * 4 + 3] && !ns[i * 4 + 3]) above++;
  const toPx = (m, rgb) => { const o = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (m[i]) { o.set(rgb, i * 4); o[i * 4 + 3] = 255; } return o; };
  const count = (m) => m.reduce((s, v) => s + v, 0);
  const masks = { "hair-residue-to-hair": toPx(residue, [255, 0, 200]), "neck-seam": toPx(seam, [0, 200, 255]), "under-head": toPx(under, [255, 140, 0]) };
  return { ef, master, layers, body, bald, masks, residue, seam, under, stats: { residuePx: count(residue), neckSeamPx: count(seam), underHeadPx: count(under), masterAboveSeamUncoveredPx: above } };
}

/** A whole figure: body, then the head situation (D-193 order) with short/afro tinted (default brown), no cast shadow. */
export function composeFigure(build, situation, rgb = HS.HAIR_TOKEN_BROWN, afro = null) {
  const head = EF.composeSituation({ layers: build.layers, head: build.ef.head }, situation, rgb, afro);
  return NL.overStack([build.body, head]);
}

export function loadTracked() {
  const man = JSON.parse(rel(MANIFEST_FILE).toString("utf8")), files = {};
  for (const [k, e] of Object.entries(man.masks)) { const b = rel(e.file); if (sha(b) !== e.sha256) throw new Error(`${e.file} is not the pinned ${e.sha256}`); files[k] = b; }
  if (sha(rel(SPEC_FILE)) !== man.spec.sha256) throw new Error(`${SPEC_FILE} is not the pinned ${man.spec.sha256}`);
  return { man, files };
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), outDir = i >= 0 ? args[i + 1] : null;
  if (!outDir) throw new Error("usage: --out <empty dir>");
  const OUT = resolve(outDir); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty");
  mkdirSync(join(OUT, "masks"), { recursive: true });
  const b = buildFigure(), pins = { body: pixelSha256(b.body), skin: pixelSha256(b.layers.skin), hair: pixelSha256(b.layers.hair) };
  for (const [k, px] of Object.entries(b.masks)) { writeFileSync(join(OUT, "masks", `${k}.png`), encodePng(W, H, px)); pins[`masks/${k}`] = pixelSha256(px); }
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ decision: DECISION, status: REVIEW_STATUS, pixelSha256: pins, stats: b.stats }, null, 2) + "\n");
  console.log(JSON.stringify(b.stats));
}
