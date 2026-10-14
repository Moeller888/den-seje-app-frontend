// D-159 — PREPARATION-ONLY adapter for a LATER, separately authorised R3 face-neutral attempt.
//
// It verifies every input pin and the exact prompt text, and prints a SANITISED request preview (field order,
// parameters, file names, sizes and SHA-256 — never file bytes). It is technically unable to send:
//   - it imports only node:fs, node:crypto, node:path and node:url; it has no network client and never calls fetch;
//   - it never reads environment variables, credentials, API keys, claims or a claim register;
//   - it refuses every send-, execute-, live-, upload-, claim- or credential-like flag and every unknown flag;
//   - the endpoint exists only as a documentation string.
// D-159 authorises no upload and no image request. There is no call id and no claim.
//
//   node tools/avatar/prepare-r3-face-neutral-request.mjs --guide=<path to input-1-placement-guide-A-prime.png>
//
// The guide is PRIVATE (H1-derived) and lives only in a gitignored build folder; it is never tracked or copied here.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", "..");
export const DECISION = "D-159";
export const STATUS = "PREPARATION ONLY — NOT SENDABLE — NO UPLOAD — NO CALL ID — NO CLAIM";
export const ENDPOINT_DOCUMENTATION = "POST https://api.openai.com/v1/images/edits (documentation only; this module cannot send)";
export const BODY_FORMAT_DOCUMENTATION = "multipart form fields, one field per parameter, image[] repeated per image in input order";
export const PINS = Object.freeze({
  guide: Object.freeze({ name: "input-1-placement-guide-A-prime.png", sha256: "aed1745ecf5c82472774509546bdeeef7463dd7fad57a3a83933a5bcab613dcf", bytes: 407991, storage: "PRIVATE — H1-derived; gitignored build folder only" }),
  northstar: Object.freeze({ path: "assets/avatar/reference/Northstar Master v2.png", sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50", bytes: 761394 }),
  prompt: Object.freeze({ path: "tools/avatar/fixtures/r3-face-neutral/prompt-text.exact.txt", sha256: "9c0b26496ce693dfe0d958fc34c60e68d3eddab98e48bb7b1f11af94e07d2413", bytes: 2193 }),
});
export const PARAMETERS = Object.freeze({ model: "gpt-image-2.5-sunburst-2026-09-08", size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" });
export const FIELD_ORDER = Object.freeze(["model", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
export const OMITTED = Object.freeze(["mask", "input_fidelity", "output_compression", "response_format", "moderation"]);
const ALLOWED_FIELDS = Object.freeze(new Set(["model", "size", "quality", "n", "output_format", "background"]));
const REFUSED_FLAG = /^--(send|execute|exec|live|run|fire|call|go|upload|post|fetch|request|submit|claim|call-id|callid|owner-approval|api-key|apikey|key|token|secret|credential|credentials|auth|authorization|bearer|endpoint|url|force|yes)(=|$)/i;

const sha = (b) => createHash("sha256").update(b).digest("hex");
const pngHeader = (b) => (b.length >= 33 && b.readUInt32BE(0) === 0x89504e47 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bitDepth: b[24], colourType: b[25], interlace: b[28] } : null);

/** Refuses any field that is not part of the pinned parameter set, and any value that differs from the pin. */
export function validateFields(fields = {}) {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) throw new Error("REFUSED: fields must be a plain object");
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(k)) throw new Error("REFUSED: unknown or forbidden field " + JSON.stringify(k));
    if (v !== PARAMETERS[k]) throw new Error(`REFUSED: field ${k} must be ${JSON.stringify(PARAMETERS[k])}, got ${JSON.stringify(v)}`);
  }
  return { ...PARAMETERS };
}

function verifyImage(label, buf, pin) {
  if (!Buffer.isBuffer(buf)) throw new Error(`REFUSED: ${label} is missing`);
  if (buf.length !== pin.bytes || sha(buf) !== pin.sha256) throw new Error(`REFUSED: ${label} does not match its pin (sha256 ${sha(buf)}, ${buf.length} B)`);
  const h = pngHeader(buf);
  if (!h || h.w !== 1024 || h.h !== 1536 || h.colourType !== 6 || h.bitDepth !== 8 || h.interlace !== 0) throw new Error(`REFUSED: ${label} is not a 1024x1536 8-bit RGBA PNG`);
  return h;
}

/**
 * Builds the sanitised preview from the three input buffers. Pure and deterministic: the same bytes give the same object.
 * `pins` exists only so tests can exercise the checks on synthetic files; production use takes the default PINS.
 */
export function buildPreview({ guideBuf, northstarBuf, promptBuf, fields = {} }, pins = PINS) {
  const params = validateFields(fields);
  const gh = verifyImage("image 1 (placement guide A')", guideBuf, pins.guide);
  const nh = verifyImage("image 2 (Northstar Master v2)", northstarBuf, pins.northstar);
  if (!Buffer.isBuffer(promptBuf)) throw new Error("REFUSED: prompt text is missing");
  if (promptBuf.length !== pins.prompt.bytes || sha(promptBuf) !== pins.prompt.sha256) throw new Error(`REFUSED: prompt text does not match its pin (sha256 ${sha(promptBuf)})`);
  const prompt = promptBuf.toString("utf8");
  if (!Buffer.from(prompt, "utf8").equals(promptBuf) || prompt.includes("\r") || prompt.endsWith("\n")) throw new Error("REFUSED: prompt must be UTF-8 with LF and no trailing newline");
  return {
    decision: DECISION, status: STATUS, sendable: false, authorisation: "NONE", callId: "UNASSIGNED", claim: "NONE", uploadApproval: "NONE",
    endpointDocumentation: ENDPOINT_DOCUMENTATION, bodyFormatDocumentation: BODY_FORMAT_DOCUMENTATION,
    fieldOrder: [...FIELD_ORDER], omittedFields: [...OMITTED],
    fields: [
      { name: "model", value: params.model },
      { name: "image[]", order: 1, role: "placement guide only", file: pins.guide.name, sha256: pins.guide.sha256, bytes: guideBuf.length, png: gh, storage: pins.guide.storage },
      { name: "image[]", order: 2, role: "style, identity and default expression only", file: pins.northstar.path, sha256: pins.northstar.sha256, bytes: northstarBuf.length, png: nh },
      { name: "prompt", file: pins.prompt.path, sha256: pins.prompt.sha256, bytes: promptBuf.length, encoding: "UTF-8, LF, no trailing newline", text: prompt },
      { name: "size", value: params.size }, { name: "quality", value: params.quality }, { name: "n", value: params.n },
      { name: "output_format", value: params.output_format }, { name: "background", value: params.background },
    ],
  };
}

/** CLI argument handling: exactly one --guide=<path>; every other flag is refused. Returns the guide path. */
export function parseArgs(argv) {
  let guide = null;
  for (const a of argv) {
    if (REFUSED_FLAG.test(a)) throw new Error("REFUSED: " + a.split("=")[0] + " — this adapter is preparation-only and can never send, upload, claim or use credentials");
    const m = a.match(/^--guide=(.+)$/);
    if (m && guide === null) { guide = m[1]; continue; }
    throw new Error("REFUSED: unknown or repeated argument " + JSON.stringify(a.split("=")[0]));
  }
  if (!guide) throw new Error("REFUSED: --guide=<path to the A' placement guide> is required");
  return guide;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try {
    const guidePath = parseArgs(process.argv.slice(2));
    if (!existsSync(guidePath)) throw new Error("REFUSED: the guide file does not exist");
    const preview = buildPreview({ guideBuf: readFileSync(guidePath), northstarBuf: readFileSync(join(REPO, PINS.northstar.path)), promptBuf: readFileSync(join(REPO, PINS.prompt.path)) });
    process.stdout.write(JSON.stringify(preview, null, 1) + "\n");
  } catch (e) { process.stderr.write(String(e.message) + "\n"); process.exitCode = 2; }
}
