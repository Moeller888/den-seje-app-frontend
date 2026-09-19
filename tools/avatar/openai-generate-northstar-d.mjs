// D-120 REQUEST ADAPTER — the ONE review-only North Star generation on the D geometry.
//
// This is the adapter D-120 §9 named as missing: no existing tool sends FOUR input images to
// images/edits with no mask. It implements the D-120 request contract literally and refuses to
// deviate from it.
//
// IT DOES NOT SEND ANYTHING BY DEFAULT. A bare run performs the full preflight and stops before
// payment. Sending requires BOTH `--send` AND `--owner-approval=D-120`, because D-120 authorises
// exactly one request and an accidental invocation must not be able to spend it.
//
// Contract (D-120 §2, §4, §5, §6):
//   endpoint       https://api.openai.com/v1/images/edits
//   model          gpt-image-2-2026-04-21   (the dated snapshot, NOT the floating alias)
//   images         exactly four, in a fixed order, each byte-verified against a locked SHA-256
//   prompt         extracted from the byte-locked master prompt, itself SHA-verified
//   n=1 · quality=high · size=1024x1536 · output_format=png · background=transparent
//   NO mask · NO input_fidelity · NO retry · NO fallback model · NO automatic prompt modification
//   STOP before payment if a single byte, parameter or precondition differs.
//
// The API key is read from OPENAI_API_KEY only. It is never printed, never logged, never written.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CS = join(REPO, "tools", "avatar", "build", "northstar-geometry-v02", "d-control-set");
const OUT = join(REPO, "tools", "avatar", "build", "northstar-d-candidate");

// ── the frozen request contract (D-120 §2) ───────────────────────────────────────────────────
export const ENDPOINT = "https://api.openai.com/v1/images/edits";
export const MODEL = "gpt-image-2-2026-04-21";   // dated snapshot; NO fallback is permitted
export const SIZE = "1024x1536";
export const QUALITY = "high";
export const OUTPUT_FORMAT = "png";
export const BACKGROUND = "transparent";
export const N = 1;
// input_fidelity is deliberately absent: gpt-image-2 rejects it (invalid_input_fidelity_model,
// established 2026-07-24, recorded in build-face-expr-d042.mjs). Sending it would fail the call.

/** The four inputs, in the order the prompt addresses them as Image 1-4. Order is binding. */
export const INPUTS = [
  { role: "Image 1", rel: "geometry-reference/geometry-reference-transparent.png",
    bytes: 40247, sha256: "e3c44a512bec3f3780e5b9d99a61cba473364e6889c1a5a6a7b0b99bca552dc7" },
  { role: "Image 2", rel: "geometry-reference/geometry-silhouette.png",
    bytes: 26362, sha256: "0e760fb1b0ced293654ece10027c1fbdf68ee15aee4beaedf6fcbc81b7bf602a" },
  { role: "Image 3", rel: "geometry-reference/geometry-plate-bald-nude.png",
    bytes: 26826, sha256: "d3a855fc50afe634f135bf306a68404a7a6b4bd4ac52d8a931cf65510b413e11" },
  { role: "Image 4", rel: "style-identity-reference/style-identity-reference-head.png",
    bytes: 367948, sha256: "abf551ae169d6b2c8e1253d971c6bb9b9571260fcfd95d7676bb600ff33b6640" },
];
export const PROMPT_FILE = { rel: "d-master-prompt.md", bytes: 12431,
  sha256: "8b88559687115fd6decda641ed323dd99c06e71661f7dd597a38deb4bb1fdd1a" };

/** Anything on this list must NEVER appear in the request body. */
export const FORBIDDEN_FIELDS = ["mask", "input_fidelity"];

const sha = (b) => createHash("sha256").update(b).digest("hex");
const refuse = (msg) => { console.error("REFUSED: " + msg); process.exit(1); };

// ── prompt extraction (D-120 §4: the prompt is byte-locked, not retyped) ─────────────────────
/** Pulls the single fenced block out of the master prompt. Fails loudly on anything unexpected. */
export function extractPrompt(md) {
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === "```") fences.push(i);
  if (fences.length !== 2) return { ok: false, why: "expected exactly 2 code fences, found " + fences.length };
  const body = lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, "");
  if (!body.startsWith("Produce a single full-body character illustration")) {
    return { ok: false, why: "fenced block does not start with the expected first line" };
  }
  for (const marker of ["Image 1", "Image 2", "Image 3", "Image 4"]) {
    if (!body.includes(marker)) return { ok: false, why: "prompt does not address " + marker };
  }
  return { ok: true, prompt: body, fenceLines: [fences[0] + 1, fences[1] + 1] };
}

// ── preflight (D-120 §4) ─────────────────────────────────────────────────────────────────────
export function preflight() {
  const problems = [];
  const files = [];

  for (const inp of INPUTS) {
    const p = join(CS, inp.rel);
    if (!existsSync(p)) { problems.push(inp.role + ": missing " + inp.rel); continue; }
    const buf = readFileSync(p);
    const got = sha(buf);
    const okBytes = buf.length === inp.bytes, okSha = got === inp.sha256;
    if (!okBytes) problems.push(inp.role + ": " + buf.length + " B, expected " + inp.bytes);
    if (!okSha) problems.push(inp.role + ": sha " + got + ", expected " + inp.sha256);
    files.push({ ...inp, path: p, actualBytes: buf.length, actualSha256: got, ok: okBytes && okSha, buf });
  }

  const mp = join(CS, PROMPT_FILE.rel);
  let prompt = null, promptMeta = null;
  if (!existsSync(mp)) {
    problems.push("master prompt missing: " + PROMPT_FILE.rel);
  } else {
    const raw = readFileSync(mp);
    const got = sha(raw);
    if (raw.length !== PROMPT_FILE.bytes) problems.push("master prompt: " + raw.length + " B, expected " + PROMPT_FILE.bytes);
    if (got !== PROMPT_FILE.sha256) problems.push("master prompt: sha " + got + ", expected " + PROMPT_FILE.sha256);
    const ex = extractPrompt(raw.toString("utf8"));
    if (!ex.ok) problems.push("prompt extraction: " + ex.why);
    else {
      prompt = ex.prompt;
      promptMeta = { fileBytes: raw.length, fileSha256: got, fenceLines: ex.fenceLines,
        promptBytes: Buffer.byteLength(prompt, "utf8"), promptSha256: sha(Buffer.from(prompt, "utf8")) };
    }
  }

  const keyPresent = !!process.env.OPENAI_API_KEY;   // existence only; the value is never read out
  if (!keyPresent) problems.push("OPENAI_API_KEY is not set");

  return { ok: problems.length === 0, problems, files, prompt, promptMeta, keyPresent };
}

/** The exact request configuration, serialised deterministically. Contains no secret. */
export function requestConfig(pf) {
  return {
    tool: "openai-generate-northstar-d", contract: "D-120",
    endpoint: ENDPOINT, endpointType: "images.edits (multi-image edit, NO mask)",
    model: MODEL,
    parameters: { n: N, quality: QUALITY, size: SIZE, output_format: OUTPUT_FORMAT, background: BACKGROUND },
    omitted: { mask: "never sent — D-120 §2", input_fidelity: "never sent — gpt-image-2 rejects it (invalid_input_fidelity_model)" },
    policy: { retry: false, fallbackModel: false, automaticPromptModification: false, requests: 1 },
    inputs: pf.files.map((f) => ({ role: f.role, file: f.rel, bytes: f.actualBytes, sha256: f.actualSha256 })),
    prompt: pf.promptMeta,
  };
}

/**
 * Assembles the multipart body and runs the hard guards.
 * Exported so the guards can be exercised by a test WITHOUT spending the one authorised request —
 * a guard that can only run on the paid path is a guard nobody has ever seen work.
 */
export function buildBody(pf) {
  if (!pf.ok) throw new Error("buildBody called on a failed preflight");
  if (!pf.prompt) throw new Error("buildBody called without a prompt");
  const fd = new FormData();
  fd.append("model", MODEL);
  for (const f of pf.files) fd.append("image[]", new File([f.buf], basename(f.rel), { type: "image/png" }));
  fd.append("prompt", pf.prompt);
  fd.append("n", String(N));
  fd.append("size", SIZE);
  fd.append("quality", QUALITY);
  fd.append("output_format", OUTPUT_FORMAT);
  fd.append("background", BACKGROUND);

  for (const bad of FORBIDDEN_FIELDS) {
    if (fd.has(bad)) throw new Error("forbidden field present in body: " + bad);
  }
  const images = fd.getAll("image[]");
  if (images.length !== INPUTS.length) throw new Error("expected " + INPUTS.length + " images in the body, found " + images.length);
  for (let i = 0; i < images.length; i++) {
    if (images[i].name !== basename(INPUTS[i].rel)) {
      throw new Error("image order broken at position " + i + ": " + images[i].name + " != " + basename(INPUTS[i].rel));
    }
  }
  if (fd.get("model") !== MODEL) throw new Error("model is not the pinned snapshot");
  if (fd.get("n") !== "1") throw new Error("n must be 1");
  return fd;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const send = argv.includes("--send");
  const approved = argv.includes("--owner-approval=D-120");
  const showPrompt = argv.includes("--print-prompt");

  console.log("D-120 request adapter — " + ENDPOINT);
  console.log("  model          : " + MODEL);
  console.log("  parameters     : n=" + N + " quality=" + QUALITY + " size=" + SIZE +
    " output_format=" + OUTPUT_FORMAT + " background=" + BACKGROUND);
  console.log("  never sent     : " + FORBIDDEN_FIELDS.join(", "));
  console.log("  retry/fallback : none\n");

  const pf = preflight();
  console.log("  preflight:");
  for (const f of pf.files) {
    console.log("    " + f.role + "  " + (f.ok ? "OK " : "BAD") + "  " +
      String(f.actualBytes).padStart(7) + " B  " + f.actualSha256.slice(0, 16) + "…  " + f.rel);
  }
  if (pf.promptMeta) {
    console.log("    prompt file   OK   " + pf.promptMeta.fileBytes + " B  " + pf.promptMeta.fileSha256.slice(0, 16) + "…");
    console.log("    prompt body        " + pf.promptMeta.promptBytes + " B  " + pf.promptMeta.promptSha256.slice(0, 16) + "…  (lines " +
      pf.promptMeta.fenceLines.join("–") + ")");
  }
  console.log("    OPENAI_API_KEY     " + (pf.keyPresent ? "present" : "MISSING"));

  if (showPrompt && pf.prompt) {
    console.log("\n  --- prompt as it would be sent ---");
    console.log(pf.prompt.split("\n").map((l) => "  | " + l).join("\n"));
  }

  const cfg = requestConfig(pf);
  mkdirSync(OUT, { recursive: true });
  const cfgPath = join(OUT, "request-config.json");
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
  console.log("\n  request config written: " + cfgPath);

  if (!pf.ok) {
    console.error("\n  PREFLIGHT FAILED — stopping before payment:");
    for (const p of pf.problems) console.error("    · " + p);
    process.exit(1);
  }
  console.log("  preflight: ALL CHECKS PASSED");

  if (!send || !approved) {
    console.log("\n  NOTHING WAS SENT.");
    console.log("  D-120 authorises exactly ONE request. To spend it, run with BOTH flags:");
    console.log("    node tools/avatar/openai-generate-northstar-d.mjs --send --owner-approval=D-120");
    process.exit(0);
  }

  // ── the single request (D-120 §5) ──────────────────────────────────────────────────────────
  const rawPath = join(OUT, "candidate.raw.png");
  const metaPath = join(OUT, "request.json");
  for (const p of [rawPath, metaPath]) {
    if (existsSync(p)) refuse("output already exists, refusing to overwrite: " + p);
  }

  let fd;
  try { fd = buildBody(pf); } catch (e) { refuse(e.message); }

  const startedAt = new Date().toISOString();
  // EXACTLY ONE fetch. There is no loop, and no catch that retries.
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
    body: fd,
  });
  const finishedAt = new Date().toISOString();
  const text = await res.text();
  console.log("\n  HTTP " + res.status + " " + res.statusText);

  // metadata records everything EXCEPT the key and the Authorization header
  const manifest = {
    tool: "openai-generate-northstar-d", contract: "D-120", startedAt, finishedAt,
    request: { ...cfg, inputs: cfg.inputs },
    response: {
      httpStatus: res.status, ok: res.ok,
      requestId: res.headers.get("x-request-id"),
      contentType: res.headers.get("content-type"),
      openaiProcessingMs: res.headers.get("openai-processing-ms"),
      openaiVersion: res.headers.get("openai-version"),
    },
  };

  if (!res.ok) {
    manifest.response.errorBodySha256 = sha(text);
    let detail = null;
    try { detail = JSON.parse(text).error || null; } catch (_) { /* body is not JSON */ }
    manifest.response.error = detail ? { type: detail.type, code: detail.code, message: detail.message } : null;
    writeFileSync(metaPath, JSON.stringify(manifest, null, 2), "utf8");
    console.error("  REQUEST FAILED — no retry, no fallback. Manifest: " + metaPath);
    if (detail) console.error("  " + detail.type + " / " + detail.code + ": " + detail.message);
    process.exit(1);
  }

  let payload;
  try { payload = JSON.parse(text); } catch (_) { refuse("response was not JSON"); }
  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) {
    manifest.response.bodySha256 = sha(text);
    writeFileSync(metaPath, JSON.stringify(manifest, null, 2), "utf8");
    refuse("no image in the response — manifest: " + metaPath);
  }

  // persist the raw bytes IMMEDIATELY, before any other step (D-113 lesson)
  const png = Buffer.from(b64, "base64");
  writeFileSync(rawPath, png);
  manifest.result = { file: "candidate.raw.png", bytes: png.length, sha256: sha(png) };
  if (payload.usage) manifest.response.usage = payload.usage;
  writeFileSync(metaPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log("  raw candidate  : " + rawPath);
  console.log("  bytes / sha256 : " + png.length + " / " + manifest.result.sha256);

  // dimensions + transparency (D-120 §5)
  const d = decodePng(png, "candidate");
  let minA = 255, maxA = 0;
  for (let i = 3; i < d.rgba.length; i += 4) { const a = d.rgba[i]; if (a < minA) minA = a; if (a > maxA) maxA = a; }
  const [wantW, wantH] = SIZE.split("x").map(Number);
  manifest.verification = {
    width: d.w, height: d.h, dimensionsMatchRequest: d.w === wantW && d.h === wantH,
    alphaMin: minA, alphaMax: maxA, hasTransparency: minA === 0,
  };
  writeFileSync(metaPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log("  dimensions     : " + d.w + "x" + d.h + (manifest.verification.dimensionsMatchRequest ? "  OK" : "  MISMATCH"));
  console.log("  transparency   : alpha " + minA + "–" + maxA + (manifest.verification.hasTransparency ? "  present" : "  ABSENT"));

  console.log("\n  STOPPED. The candidate is review material, not an asset.");
  console.log("  No cleanup, no retouching, no promotion, no commit, no production effect.");
  console.log("  Manifest: " + metaPath);
}
