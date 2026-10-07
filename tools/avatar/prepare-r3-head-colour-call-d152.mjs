// prepare-r3-head-colour-call-d152 — PREPARATION ONLY. THIS FILE CANNOT SEND.
//
// D-152 records D-151's outcome (one send, HTTP 400: background "transparent" is not supported for
// gpt-image-2-2026-04-21) and prepares the smallest supported correction: background "opaque". Everything else
// in the request is D-149's, unchanged — model, endpoint, size, quality, n, output format, field order, Image 1
// (H1 with U1), Image 2 (Northstar), API_EDIT and the prompt bytes. This file rebuilds that corrected request
// deterministically and can write a local request manifest into the gitignored build area. Nothing else.
//
// There is no send path: no network module, no fetch, no request function, no key read, no claim, no retry, and
// no child process. Call identity: UNASSIGNED; claim identity: NONE. A call needs a NEW, separate owner decision
// with its own call-id and claim identity; nothing in this file can stand in for it.
//
// Usage:
//   node tools/avatar/prepare-r3-head-colour-call-d152.mjs --h1 <path>             read-only preflight
//   node tools/avatar/prepare-r3-head-colour-call-d152.mjs --h1 <path> --dry-run   + local request manifest
// Any other argument is refused.
import { writeFileSync, mkdirSync, renameSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H } from "./build-r3-head-edit-masks.mjs";
import { loadAll, preflight, buildImage1, buildManifest, REQUEST as D149_REQUEST } from "./prepare-r3-head-colour-call.mjs";

export const TOOL = "prepare-r3-head-colour-call-d152";
export const DECISION = "D-152";
export const STATUS = "PREPARATION ONLY — NO IMAGE REQUEST AUTHORISED";
export const CALL_ID = "UNASSIGNED";
export const CLAIM_IDENTITY = "NONE";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** The one change against D-149/D-151: background. Documented by the D-151 HTTP 400 and the API reference. */
export const BACKGROUND_CHANGE = Object.freeze({
  parameter: "background", before: "transparent", after: "opaque",
  why: "D-151's single send was refused with HTTP 400 image_generation_user_error / invalid_value on param background: \"Transparent background is not supported for this model.\" The API reference lists background as transparent | opaque | auto and marks transparency for gpt-image-2 / gpt-image-2-2026-04-21 as in preview. opaque is a documented value; it keeps the field set and order unchanged and does not leave the choice to the model, as auto would.",
  alphaNotNeeded: "The D-149 processor uses the output's RGB only inside the pinned head geometry and writes the final alpha from that geometry; TRANSITION, PROTECT₂ and everything outside the geometry come from H1 or are transparent by construction.",
});
export const REQUEST = Object.freeze({ ...D149_REQUEST, background: BACKGROUND_CHANGE.after });
export const BUILD_DIR_REL = "tools/avatar/build/r3-head-colour-d152-dry-run";
export const PINS = Object.freeze({
  image1U1Sha256: "9fc32bf5f16eacca3646a6a6776367f7577291816f33b7128140032be003bbbb",
  d149ManifestU1Sha256: "7ece128fad5a63acc5864db2813895e14a1354fbeb63446a0f5b99a40789bbce",
});

/** The corrected request manifest: D-149's U1 manifest with background opaque and D-152's identity. */
export function buildManifestD152(all, image1Png) {
  const m = buildManifest(all, image1Png);
  const d149Text = JSON.stringify(m, null, 2) + "\n";
  if (sha256(Buffer.from(d149Text, "utf8")) !== PINS.d149ManifestU1Sha256) throw new Error("the D-149 U1 manifest no longer matches its pin");
  if (sha256(image1Png) !== PINS.image1U1Sha256) throw new Error("Image 1 no longer matches its pin");
  return {
    ...m,
    tool: TOOL, decision: DECISION, status: STATUS, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY,
    network: "NONE — preparation only, no send path",
    request: { ...m.request, background: BACKGROUND_CHANGE.after },
    d152: {
      backgroundChange: BACKGROUND_CHANGE,
      unchangedFromD149: "model, endpoint, size, quality, n, output_format, field order, Image 1 (H1 with U1), Image 2 (Northstar), API_EDIT and the transmitted prompt bytes",
      d149ManifestU1Sha256: PINS.d149ManifestU1Sha256,
      outputDecoding: "tools/avatar/r3-head-colour-opaque-output.mjs decodeOutputRgbOrRgba(): 8-bit RGB or RGBA at 1024x1536; RGB gets alpha 255",
      additionalGate: "tools/avatar/r3-head-colour-opaque-output.mjs backgroundLeakGate(): colour-based coverage for an opaque background (proposed; a later owner decision decides whether it binds)",
    },
  };
}

export function attemptSend() {
  return { allowed: false, reasons: [
    "STRUCTURAL: this file has no send path — no network import, no request function, no claim, no key read",
    "IDENTITY: the call-id is UNASSIGNED and the claim identity is NONE",
    "AUTHORISATION: D-152 is preparation only; no owner decision authorises an image call",
  ] };
}

/** Only --h1 <path> | --h1=<path> and --dry-run. Everything else is refused before anything is read. */
export function refusedArgs(argv) {
  const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || /^--h1=./.test(a)) continue;
    if (a === "--h1" && i + 1 < argv.length && !argv[i + 1].startsWith("-")) { i++; continue; }
    bad.push(a);
  }
  return bad;
}

function writeNew(target, data) {
  mkdirSync(dirname(target), { recursive: true });
  const partial = target + ".partial";
  writeFileSync(partial, data, { flag: "wx" });
  let exists = true; try { lstatSync(target); } catch (_) { exists = false; }
  if (exists) throw new Error("refusing to replace an existing file: " + target);
  renameSync(partial, target);
}

export function prepare({ repoRoot = REPO, h1Path } = {}) {
  const all = loadAll({ repoRoot, h1Path, underpainting: "u1" });
  preflight(all);
  const image1Png = encodePngRGBA(OUT_W, OUT_H, buildImage1(all.h1, all.up, all.inp));
  const manifest = buildManifestD152(all, image1Png);
  const text = JSON.stringify(manifest, null, 2) + "\n";
  return { manifest, text, manifestSha256: sha256(Buffer.from(text, "utf8")) };
}

export function dryRun({ repoRoot = REPO, h1Path } = {}) {
  const r = prepare({ repoRoot, h1Path });
  writeNew(join(repoRoot, ...BUILD_DIR_REL.split("/"), "request-manifest-d152.json"), r.text);
  return r;
}

function argOf(flag) { const a = process.argv.find((x) => x.startsWith(flag + "=")); if (a) return a.slice(flag.length + 1); const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; }
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bad = refusedArgs(process.argv.slice(2));
  if (bad.length) { const r = attemptSend(); console.error(`REFUSED (${bad.join(" ")}) — ` + r.reasons.join(" | ")); process.exitCode = 1; }
  else {
    try {
      const h1Path = argOf("--h1") || process.env.FITTING_BASE_V1_PATH;
      const r = process.argv.includes("--dry-run") ? dryRun({ h1Path }) : prepare({ h1Path });
      console.log(`${process.argv.includes("--dry-run") ? "dry-run" : "preflight"} OK — D-152 manifest sha256 ${r.manifestSha256} — background ${r.manifest.request.background} — nothing sent`);
    } catch (err) { console.error("✖ " + err.message); process.exitCode = 1; }
  }
}
