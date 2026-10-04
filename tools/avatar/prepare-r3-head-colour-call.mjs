// prepare-r3-head-colour-call — PREPARATION ONLY. THIS FILE CANNOT SEND.
//
// It verifies every input of ONE possible later colour call on the D-148 R3 head, assembles the
// exact request a future, separately authorised send tool would make, writes a local dry-run
// manifest, and REFUSES to send. There is no send path here — not a disabled one, not a guarded
// one. There is no network import, no request function, no API-key read, no retry and no claim.
// `attemptSend()` exists so the refusal is a tested code path; it can never return allowed: true.
//
// What the call would produce: ONLY the hidden technical skin underlay — bald, blank, featureless
// (R3 layer contract, D-132/D-135, unchanged). Face, eyes, iris, blush, expressions and hair are
// separate layers and are not part of this request.
//
// Call identity: UNASSIGNED. No call-id, no claim identity and no approval value exist. A later
// send tool needs a separate owner decision that assigns all three; nothing in this file can stand
// in for that decision.
//
// Usage:
//   node tools/avatar/prepare-r3-head-colour-call.mjs --h1 <path>                 read-only preflight
//   node tools/avatar/prepare-r3-head-colour-call.mjs --h1 <path> --dry-run       + local manifest/images
//   ... --underpainting=u2                                                        use U2 instead of U1
// Any argument list containing --send prints the refusal and exits non-zero.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H, H1_SHA256, readIfExists } from "./build-r3-head-edit-masks.mjs";
import { HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { FIXTURE_DIR, FILES, D148, NORTHSTAR, loadInputs, apiMaskToEditable, validateEditable, validateUnderpainting, SKIN_RULE, apiContextMargin, SEAM } from "./build-r3-head-colour-fixtures.mjs";

export const TOOL = "prepare-r3-head-colour-call";
export const STATUS = "PREPARED — NOT AUTHORISED";
export const CALL_ID = "UNASSIGNED";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const N = OUT_W * OUT_H;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** The request a later call would make — data only. Nothing in this file transmits it. */
export const REQUEST = Object.freeze({
  endpointDescription: "OpenAI Images edit endpoint (/v1/images/edits) — named for documentation; this file opens no connection",
  model: "gpt-image-2-2026-04-21", size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent",
  forbiddenFields: Object.freeze(["input_fidelity"]),
  fieldOrder: Object.freeze(["model", "image[] (Image 1)", "image[] (Image 2)", "mask", "prompt", "size", "quality", "n", "output_format", "background"]),
  maskAppliesTo: "Image 1 (the edit endpoint applies the mask to the first image)",
});
export const PINNED = Object.freeze({
  u1: "e67e2cccb25d914dfd016fd1ed3d9d36fa883bfc75457426b59f8d1204ba217d",
  u2: "6cfd1e1840a6cb350dfad906fae629ac13a981c7be0051b8bf9b79c0bb2ee358",
  mask: "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1",   // API_EDIT (v2) = GEOM ∪ API_CONTEXT_MARGIN
  margin: "1bb3ca1b2fa307c023c26ce52f93b989320c0707e2c7d0f10694901788248e03", // API_CONTEXT_MARGIN marker (documentation, never sent)
  // the prompt is pinned through the spec (prompt.sha256), which loadAll() checks byte for byte
});
export const BUILD_DIR_REL = "tools/avatar/build/r3-head-colour-dry-run";

// ── prompt ───────────────────────────────────────────────────────────────────
/** The transmitted block: the single fenced block of the prompt fixture, byte for byte. */
export function extractPrompt(md) {
  const text = md.toString("utf8");
  const m = /\n```\n([\s\S]*?)\n```\n?/.exec(text);
  if (!m) throw new Error("prompt fixture: no fenced block");
  if (text.split("\n```").length !== 3) throw new Error("prompt fixture: expected exactly one fenced block");
  return m[1];
}
/** Facial-feature / hair terms that may appear ONLY in a negated clause. */
export const FORBIDDEN_TERMS = Object.freeze(["eye", "eyes", "iris", "irises", "eye whites", "eyelash", "eyelashes", "eyebrow", "eyebrows", "brow", "brows", "nose", "nostril", "nostrils",
  "mouth", "lip", "lips", "teeth", "tooth", "smile", "blush", "freckle", "freckles", "hair", "hairline", "beard", "expression", "facial feature", "face features"]);
const NEGATION = /\b(no|not|without|never|nor|featureless|blank)\b|do not|don't/i;
/**
 * Structural prompt check: every sentence that names a forbidden feature must be a negated sentence
 * (it carries no/not/without/do not …) and must not also contain a positive drawing verb directed at
 * that feature ("add", "draw", "paint", "create", "give", "include", "with"). Returns offending sentences.
 */
export function promptViolations(prompt) {
  const sentences = prompt.split(/(?<=[.!?:])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    const low = s.toLowerCase();
    const hits = FORBIDDEN_TERMS.filter((t) => new RegExp(`\\b${t}\\b`).test(low));
    if (!hits.length) continue;
    if (!NEGATION.test(s)) { out.push({ sentence: s, terms: hits, why: "names a facial feature or hair without negating it" }); continue; }
    // a negated sentence must not ALSO ask for the feature, e.g. "Add eyes but no hair"
    for (const t of hits) {
      const re = new RegExp(`\\b(add|draw|paint|create|give|include|show|render)\\b[^.]*\\b${t}\\b`);
      const neg = new RegExp(`\\b(no|not|without|never|nor)\\b[^.]*\\b${t}\\b|featureless[^.]*\\b${t}\\b|\\bcopy\\b[^.]*\\b${t}\\b|reads as[^.]*\\b${t}\\b`);
      if (re.test(low) && !neg.test(low)) out.push({ sentence: s, terms: [t], why: "asks for the feature" });
    }
  }
  return out;
}
export function promptRequirements(prompt) {
  const low = prompt.toLowerCase(), need = { bald: /\bbald\b/, blankOrFeatureless: /\b(blank|featureless)\b/, bothEars: /both ears/, transparentBackground: /transparent background|background stays fully transparent/,
    noScaleOrPosition: /do not alter[^.]*\bscale\b[^.]*\bposition\b/, fillWithoutGaps: /without transparent gaps/ };
  return Object.fromEntries(Object.entries(need).map(([k, re]) => [k, re.test(low)]));
}

// ── layer contract (D-132/D-135, unchanged) ──────────────────────────────────
export const R3_CONTRACT_PATH = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
export const SEPARATE_LAYERS = Object.freeze(["face", "eyes", "iris", "blush", "expressions", "hair"]);
/** The underlay must stay bald and blank, and the separate face/hair layers must stay separate. */
export function layerContractViolations(spec, r3) {
  const v = [], lc = spec && spec.layerContract;
  if (!lc || !/\bBALD\b/.test(lc.underlay || "")) v.push("spec does not state the underlay is BALD");
  if (!lc || !/\bBLANK\b|featureless/i.test(lc.underlay || "")) v.push("spec does not state a BLANK / featureless face");
  for (const l of SEPARATE_LAYERS) if (!lc || !(lc.separateLayersUntouched || []).includes(l)) v.push(`spec does not keep the ${l} layer separate`);
  const base = r3 && r3.layerContract && (r3.layerContract.slots || []).find((s) => s.slot === "base");
  if (!base || !/BALD, BLANK FACE/.test(base.content || "")) v.push("R3 contract base slot is no longer 'BALD, BLANK FACE'");
  const order = r3 && r3.layerContract && r3.layerContract.paintOrder && r3.layerContract.paintOrder.bottomToTop;
  if (!Array.isArray(order) || order[0] !== "base" || !["blush", "face", "eyes", "hair"].every((l) => order.includes(l))) v.push("R3 paint order no longer keeps base below separate blush/face/eyes/hair layers");
  return v;
}

// ── inputs ───────────────────────────────────────────────────────────────────
function rel(p) { return relative(REPO, p).split("\\").join("/"); }
export function loadAll({ repoRoot = REPO, h1Path, underpainting = "u1" } = {}) {
  if (!["u1", "u2"].includes(underpainting)) throw new Error("underpainting must be u1 or u2");
  const inp = loadInputs(repoRoot);                               // D-148 + Northstar, all hash-pinned
  const fx = (k) => { const b = readIfExists(join(repoRoot, FIXTURE_DIR, FILES[k])); if (!b) throw new Error(`${FILES[k]} missing`); return b; };
  const upBuf = fx(underpainting), maskBuf = fx("mask"), promptBuf = fx("prompt");
  const marginBuf = fx("margin");
  for (const [k, b] of [[underpainting, upBuf], ["mask", maskBuf], ["margin", marginBuf]]) if (sha256(b) !== PINNED[k]) throw new Error(`${FILES[k]} sha256 ${sha256(b)} != pinned ${PINNED[k]}`);
  const spec = JSON.parse(fx("spec").toString("utf8"));
  if (spec.prompt.sha256 !== sha256(promptBuf)) throw new Error("prompt fixture does not match the spec's pinned hash");
  if (spec.callId !== CALL_ID || spec.status !== STATUS) throw new Error("spec is not in the PREPARED — NOT AUTHORISED / UNASSIGNED state");
  const r3 = JSON.parse(readFileSync(join(repoRoot, R3_CONTRACT_PATH), "utf8"));
  const lv = layerContractViolations(spec, r3);
  if (lv.length) throw new Error("layer contract: " + lv.join("; "));
  if (!h1Path) throw new Error("--h1 <path> is required: H1 is external (D-127 §2)");
  if (!existsSync(h1Path)) throw new Error("H1 not found at the supplied path");
  const h1Buf = readFileSync(h1Path);
  if (sha256(h1Buf) !== H1_SHA256) throw new Error("H1 sha256 does not match the pinned authoring base");
  const h1 = decodePng(h1Buf, "H1"), up = decodePng(upBuf, "underpainting");
  if (h1.w !== OUT_W || h1.h !== OUT_H) throw new Error("H1 is not 1024x1536");
  if (up.w !== OUT_W || up.h !== OUT_H) throw new Error("underpainting is not 1024x1536");
  const nsBuf = readFileSync(join(repoRoot, NORTHSTAR.path));
  const editable = apiMaskToEditable(maskBuf);
  return { inp, upBuf, up: up.rgba, maskBuf, editable, promptBuf, spec, h1Buf, h1: h1.rgba, nsBuf, underpainting };
}

/** Image 1: H1, with CORE₂ replaced — head geometry → underpainting, rest of CORE₂ → transparent. */
export function buildImage1(h1, up, { geom, edit, transition }) {
  const out = Buffer.from(h1);
  for (let p = 0; p < N; p++) {
    if (!edit[p] || transition[p]) continue;                       // TRANSITION and PROTECT₂ stay H1
    const i = p * 4, y = (p / OUT_W) | 0;
    if (geom[p] && y <= HEAD_MAX_Y) { for (let k = 0; k < 4; k++) out[i + k] = up[i + k]; }
    else { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; }
  }
  return out;
}

/**
 * API_EDIT vs the protected world: no TRANSITION pixel, nothing below row 424 (HEAD_MAX_Y), and no pixel where H1
 * is visible outside P2 EDIT₂ (neck rim, body, clothing). The API_CONTEXT_MARGIN may only reach P2 EDIT₂ or
 * pixels that are transparent in H1.
 */
export function apiEditProtectedOverlap(editable, h1, { geom, edit, transition }) {
  const r = { transition: 0, belowHeadMaxY: 0, h1VisibleProtect2: 0, marginOutsideHeadRows: 0 };
  const margin = apiContextMargin(geom);
  for (let p = 0; p < N; p++) {
    if (margin[p] && ((p / OUT_W) | 0) > HEAD_MAX_Y) r.marginOutsideHeadRows++;
    if (!editable[p]) continue;
    if (transition[p]) r.transition++;
    if (((p / OUT_W) | 0) > HEAD_MAX_Y) r.belowHeadMaxY++;
    if (!edit[p] && h1[p * 4 + 3] > 0) r.h1VisibleProtect2++;
  }
  return r;
}

/** Every check a later send tool would need first. Throws on the first failure. */
export function preflight(all) {
  const { inp, editable, up, promptBuf, h1 } = all;
  const ve = validateEditable(editable, inp);
  if (!ve.ok) throw new Error("API_EDIT mask: " + ve.problems.join("; "));
  const ov = apiEditProtectedOverlap(editable, h1, inp);
  const bad = Object.entries(ov).filter(([, v]) => v);
  if (bad.length) throw new Error("API_EDIT touches the protected world: " + bad.map(([k, v]) => `${k} ${v}`).join(", "));
  const vu = validateUnderpainting(up, inp.geom, inp.transition, SKIN_RULE.expected);
  if (!vu.ok) throw new Error("underpainting: " + vu.problems.join("; "));
  const prompt = extractPrompt(promptBuf);
  const v = promptViolations(prompt);
  if (v.length) throw new Error("prompt asks for a forbidden feature: " + JSON.stringify(v));
  const req = promptRequirements(prompt);
  const missing = Object.entries(req).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) throw new Error("prompt lacks required statements: " + missing.join(", "));
  return { ve, ov, prompt, req };
}

/** The exact request plan + manifest (no credentials, no absolute paths). */
export function buildManifest(all, image1Png) {
  const { maskBuf, promptBuf, nsBuf, h1Buf, upBuf, underpainting, spec } = all;
  const prompt = extractPrompt(promptBuf);
  return {
    tool: TOOL, status: STATUS, callId: CALL_ID, claimIdentity: "NONE", network: "NONE — preparation only, no send path",
    request: { ...REQUEST,
      images: [
        { role: "Image 1", name: "H1 + D-148 underpainting (" + underpainting.toUpperCase() + ")", sha256: sha256(image1Png), bytes: image1Png.length, builtFrom: { h1: { sha256: sha256(h1Buf), source: "external, --h1" }, underpainting: { file: FILES[underpainting], sha256: sha256(upBuf) } },
          function: "the canvas to edit: H1's body and transition, with the bald, blank head shape the model must colour" },
        { role: "Image 2", name: "Northstar Master v2", path: NORTHSTAR.path, sha256: sha256(nsBuf), bytes: nsBuf.length,
          function: "skin palette, material softness, shading strength and 2D style only — hair and facial features must not be copied" },
      ],
      mask: { name: "API_EDIT", file: FILES.mask, sha256: sha256(maskBuf), bytes: maskBuf.length, semantics: "alpha 0 = EDITABLE, alpha 255 = PROTECTED", editablePx: spec.apiMask.editablePx, bbox: spec.apiMask.bbox,
        composition: "API_EDIT = FINAL_MODEL_RGB_REGION (GEOM) ∪ API_CONTEXT_MARGIN", edgeMargin: spec.apiMask.edgeMargin },
      apiContextMargin: { name: "API_CONTEXT_MARGIN", px: spec.apiContextMargin.px, bbox: spec.apiContextMargin.bbox, markerFile: spec.apiContextMargin.file, markerSha256: spec.apiContextMargin.sha256,
        fate: "request-time only — never copied into the candidate" },
      prompt: { file: FILES.prompt, fileSha256: sha256(promptBuf), transmittedSha256: sha256(Buffer.from(prompt, "utf8")), transmittedBytes: Buffer.byteLength(prompt, "utf8"), text: prompt },
    },
    finalModelRgbRegion: { name: "FINAL_MODEL_RGB_REGION", px: spec.finalModelRgbRegion.px, sameAs: "D-148 GEOM (G1V3, E2), rows ≤ 424" },
    p2Edit2: "P2 EDIT₂ / PROTECT₂ / TRANSITION — D-148 fixtures, unchanged",
    postProcessing: "tools/avatar/process-r3-head-colour-output.mjs — S1 palette gate (ΔE00 ≤ " + SEAM.S1.thresholdDE00 + "), S2 rows " + SEAM.S2.top + "–" + SEAM.S2.bottom + " before K4, model RGB only inside FINAL_MODEL_RGB_REGION, alpha = E2 geometry, K4 after the model, TRANSITION/PROTECT₂ from H1, every D-148 gate; no candidate is written on any failure",
  };
}

export function attemptSend() {
  return { allowed: false, reasons: [
    "STRUCTURAL: this file has no send path — no network import, no request function, no claim, no key read",
    "IDENTITY: the call-id is UNASSIGNED and no claim identity exists",
    "AUTHORISATION: no owner decision authorises an image call for the R3 head colour",
  ] };
}

export function dryRun({ repoRoot = REPO, h1Path, underpainting = "u1", outDir } = {}) {
  const all = loadAll({ repoRoot, h1Path, underpainting });
  const pre = preflight(all);
  const image1 = buildImage1(all.h1, all.up, all.inp);
  const image1Png = encodePngRGBA(OUT_W, OUT_H, image1);
  const manifest = buildManifest(all, image1Png);
  const text = JSON.stringify(manifest, null, 2) + "\n";
  const dir = outDir || join(repoRoot, BUILD_DIR_REL);
  const relDir = relative(join(repoRoot, "tools", "avatar", "build"), dir);
  if (relDir.startsWith("..") || isAbsolute(relDir)) throw new Error("dry-run output must stay inside tools/avatar/build (gitignored)");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `image1-${underpainting}.png`), image1Png);        // contains H1 pixels — local only
  writeFileSync(join(dir, `request-manifest-${underpainting}.json`), text);
  return { manifest, manifestSha256: sha256(Buffer.from(text, "utf8")), image1, pre };
}

/**
 * The CLI accepts ONLY: --h1 <path> | --h1=<path>, --dry-run, --underpainting u1|u2 | --underpainting=u1|u2.
 * Every other argument — --send, --send=…, --SEND, --execute, --live, any unknown flag — is refused before
 * anything is read. Returns the offending arguments (empty = acceptable).
 */
export function refusedArgs(argv) {
  const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") continue;
    if (/^--(h1|underpainting)=./.test(a)) continue;
    if ((a === "--h1" || a === "--underpainting") && i + 1 < argv.length && !argv[i + 1].startsWith("-")) { i++; continue; }
    bad.push(a);
  }
  return bad;
}
function argOf(flag) { const a = process.argv.find((x) => x.startsWith(flag + "=")); if (a) return a.slice(flag.length + 1); const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; }
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bad = refusedArgs(process.argv.slice(2));
  if (bad.length) { const r = attemptSend(); console.error(`REFUSED (${bad.join(" ")}) — ` + r.reasons.join(" | ")); process.exitCode = 1; }
  else {
    try {
      const h1Path = argOf("--h1") || process.env.FITTING_BASE_V1_PATH, up = argOf("--underpainting") || "u1";
      if (process.argv.includes("--dry-run")) { const r = dryRun({ h1Path, underpainting: up }); console.log(`dry-run OK (${up}) — manifest sha256 ${r.manifestSha256} — image1 ${r.manifest.request.images[0].sha256}`); }
      else { const all = loadAll({ h1Path, underpainting: up }); preflight(all); console.log(`preflight OK (${up}) — nothing written, nothing sent`); }
    } catch (err) { console.error("✖ " + err.message); process.exitCode = 1; }
  }
}
