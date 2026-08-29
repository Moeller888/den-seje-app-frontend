// 167A option A — OpenAI Image API adapter: generate EXACTLY ONE R2 hair candidate.
// ---------------------------------------------------------------------------------------------
// WHY THIS FILE EXISTS AT ALL
// Rounds 1–4 were driven by ad-hoc scripts written into a gitignored build directory. That
// directory was deleted with its worktree during an authorised branch cleanup, and with it went
// the prompts, the raw API responses and the only record of the method that produced the one
// owner-accepted candidate (D-111 §9 recorded them as deliberately outside git). They were
// recovered from a session transcript — luck, not a process. This adapter and the tracked prompt
// template beside it exist so the next hairstyle does not depend on that luck again.
//
// THE PROMPT IS NOT WRITTEN HERE. It lives in fixtures/r2-hair/prompt-template-v1.txt, tracked,
// and is the round-4 template that produced the accepted afro, reused byte for byte. This file
// only substitutes the per-style geometry into it.
//
// HARD BOUNDARIES, mirroring openai-generate-item.mjs and openai-generate-torso-item.mjs:
//   * Exactly ONE image per invocation (n:1), one explicitly named style. NO bulk, NO loops.
//   * MAX_REQUESTS is enforced in code, not by convention.
//   * NO retry and NO fallback model. A failure is a result, not something to paper over: the
//     next attempt is a human decision because it costs money.
//   * API key from env OPENAI_API_KEY only — NEVER hardcoded, NEVER printed, NEVER written.
//   * Output is a gitignored build artifact. Nothing is promoted, registered or wired.
//   * Existing output is never overwritten.
//
// WHAT THIS TOOL DOES NOT DECIDE: whether a candidate is good. That is the gate
// (check-r2-hair-candidate.mjs) followed by owner sign-off at real render scale (D-059, D-105).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

// ── the frozen request contract ───────────────────────────────────────────────────────────────
export const MODEL = "gpt-image-2-2026-04-21";     // pinned; no fallback is permitted
export const SIZE = "1024x1536";                   // the authoring canvas the gate requires
export const BACKGROUND = "transparent";
export const OUTPUT_FORMAT = "png";
export const QUALITY = "high";
export const ENDPOINT = "https://api.openai.com/v1/images/generations";
export const MAX_REQUESTS = 1;                     // per invocation, enforced below
export const RETRIES = 0;                          // never; a failure ends the run

export const TEMPLATE_PATH = join("tools", "avatar", "fixtures", "r2-hair", "prompt-template-v1.txt");
export const OUT_ROOT = join("tools", "avatar", "build", "r2-hair-gen");

// ── per-style geometry ────────────────────────────────────────────────────────────────────────
// `w` and `low` are the measured C2 targets expressed as percentages of the authoring canvas, and
// they are re-derivable from the gate rather than invented here:
//     w   = (STYLE_TARGETS[style].xHi - xLo) / 160 × 100
//     low = STYLE_TARGETS[style].lowestY / 240 × 100
// For `short` that is (108−52)/160 = 35.0 and 56/240 = 23.3, matching the values below.
// `top` is the per-style C2 top anchor measured for round 3. Round 1 shipped no anchor at all and
// ended with "Fill the canvas exactly; do not add margins", which the model obeyed — every
// candidate came back 1.6–2.1× oversized (D-111 §3). Round 2 used one flat 13 % anchor for all
// seven, which ignored that the styles differ. That instruction is gone and must not return.
//
// afro carries the FIX-ROUND values, not round 3's: the owner rejected round 3's afro as too low
// and too big, and w 40 / top 1 / low 18 is what produced the asset that was accepted and shipped.
export const STYLES = Object.freeze({
  short:    { w: 35, top: 7.9, low: 23, desc: "a short, neat cut: close over the ears, a little length on top, a clean tapered outline" },
  tousled:  { w: 38, top: 5.8, low: 23, desc: "a tousled cut of similar length to short, but with broken, uneven locks and a few strands lifting away from the mass" },
  curly:    { w: 43, top: 4.6, low: 25, desc: "a compact head of curls: the outline reads as many small rounded clumps, wider than short and sitting a little lower" },
  long:     { w: 49, top: 7.1, low: 61, desc: "long straight hair falling well past the jaw and down over the shoulders, framing the face on both sides" },
  ponytail: { w: 41, top: 7.5, low: 51, desc: "hair gathered back into a ponytail: smooth over the skull, with the tail hanging clearly to one side and below the neck" },
  buzz:     { w: 34, top: 8.3, low: 20, desc: "a buzz cut: an extremely short, even crop that follows the skull closely with almost no volume" },
  afro:     { w: 40, top: 1.0, low: 18, desc: "a wide, rounded afro: a large soft halo of dense texture, by far the widest of the seven" },
});
export const ALLOWED_STYLES = Object.freeze(Object.keys(STYLES));

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Substitutes the style's geometry into the tracked template. Pure; no I/O beyond the template. */
export function buildPrompt(style, repoRoot = REPO) {
  if (!Object.prototype.hasOwnProperty.call(STYLES, style)) {
    throw new Error(`REFUSED: unknown style "${style}" — allowed: ${ALLOWED_STYLES.join(", ")}`);
  }
  const s = STYLES[style];
  const tpl = readFileSync(join(repoRoot, TEMPLATE_PATH), "utf8");
  const vals = { DESC: s.desc, WIDTH_PCT: String(s.w), TOP_PCT: String(s.top), LOW_PCT: String(s.low), EMPTY_PCT: String(100 - s.low) };
  const out = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!Object.prototype.hasOwnProperty.call(vals, k)) throw new Error(`REFUSED: template token ${m} has no value`);
    return vals[k];
  });
  if (/\{\{|\}\}/.test(out)) throw new Error("REFUSED: unsubstituted token left in the prompt");
  return out;
}

/** Everything about the request except the key. Safe to print and to write to disk. */
export function requestConfig(style, repoRoot = REPO) {
  const prompt = buildPrompt(style, repoRoot);
  return {
    endpoint: ENDPOINT, endpointType: "images.generations (direct generation, NOT edits)",
    model: MODEL, style, size: SIZE, background: BACKGROUND,
    output_format: OUTPUT_FORMAT, quality: QUALITY, n: 1,
    maxRequests: MAX_REQUESTS, retries: RETRIES, fallbackModel: null,
    outputDir: join(OUT_ROOT, style).replace(/\\/g, "/"),
    geometry: STYLES[style],
    promptChars: prompt.length,
    promptSha256: sha256(prompt),
    prompt,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const style = args.find((a) => !a.startsWith("--"));

  if (!style) {
    console.error(`usage: node tools/avatar/openai-generate-hair-item.mjs <style> [--dry-run]`);
    console.error(`       styles: ${ALLOWED_STYLES.join(", ")}`);
    process.exit(1);
  }

  let cfg;
  try { cfg = requestConfig(style); }
  catch (err) { console.error(err.message); process.exit(1); }

  console.log(`openai-generate-hair-item — ${dryRun ? "DRY RUN (no network)" : "LIVE (one paid request)"}`);
  console.log(`  endpoint       : ${cfg.endpoint}`);
  console.log(`  endpoint type  : ${cfg.endpointType}`);
  console.log(`  model          : ${cfg.model}   (pinned, no fallback)`);
  console.log(`  style          : ${cfg.style}`);
  console.log(`  size           : ${cfg.size}`);
  console.log(`  background     : ${cfg.background}`);
  console.log(`  output_format  : ${cfg.output_format}`);
  console.log(`  quality        : ${cfg.quality}`);
  console.log(`  n              : ${cfg.n}`);
  console.log(`  request budget : ${cfg.maxRequests}`);
  console.log(`  retries        : ${cfg.retries}`);
  console.log(`  fallback model : ${cfg.fallbackModel === null ? "none" : cfg.fallbackModel}`);
  console.log(`  geometry       : width ${cfg.geometry.w}% · top ${cfg.geometry.top}% · lowest ${cfg.geometry.low}%`);
  console.log(`  output dir     : ${cfg.outputDir}`);
  console.log(`  prompt chars   : ${cfg.promptChars}`);
  console.log(`  prompt sha256  : ${cfg.promptSha256}`);
  // Existence only. The value is never printed, never logged, never written.
  console.log(`  OPENAI_API_KEY : ${process.env.OPENAI_API_KEY ? "present" : "MISSING"}`);
  console.log(`  --- prompt ---`);
  console.log(cfg.prompt.split("\n").map((l) => "  | " + l).join("\n"));

  if (dryRun) { console.log(`\n  dry run complete — no request was sent.`); process.exit(0); }

  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) { console.error("REFUSED: OPENAI_API_KEY is not set"); process.exit(1); }

  const outDir = join(REPO, OUT_ROOT, style);
  const pngPath = join(outDir, `${style}.raw.png`);
  const metaPath = join(outDir, `${style}.request.json`);
  for (const p of [pngPath, metaPath]) {
    if (existsSync(p)) { console.error(`REFUSED: output already exists, refusing to overwrite: ${p}`); process.exit(1); }
  }
  mkdirSync(outDir, { recursive: true });

  // EXACTLY ONE fetch. There is no loop and no catch that retries.
  const startedAt = new Date().toISOString();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, prompt: cfg.prompt, n: 1, size: SIZE, background: BACKGROUND, output_format: OUTPUT_FORMAT, quality: QUALITY }),
  });
  const text = await res.text();
  console.log(`\n  HTTP ${res.status} ${res.statusText}`);

  // The manifest records everything EXCEPT the key and the Authorization header.
  const manifest = {
    tool: "openai-generate-hair-item", startedAt, finishedAt: new Date().toISOString(),
    request: { ...cfg, prompt: undefined, promptSha256: cfg.promptSha256 },
    response: { httpStatus: res.status, ok: res.ok, contentType: res.headers.get("content-type") },
  };

  if (!res.ok) {
    manifest.response.errorBodySha256 = createHash("sha256").update(text).digest("hex");
    writeFileSync(metaPath, JSON.stringify(manifest, null, 2), "utf8");
    console.error(`  REQUEST FAILED — no retry, no fallback. Manifest: ${metaPath}`);
    process.exit(1);
  }

  const json = JSON.parse(text);
  const images = Array.isArray(json.data) ? json.data : [];
  manifest.response.imageCount = images.length;
  if (images.length !== 1) {
    writeFileSync(metaPath, JSON.stringify(manifest, null, 2), "utf8");
    console.error(`  REFUSED: expected exactly 1 image, got ${images.length}`);
    process.exit(1);
  }
  const buf = Buffer.from(images[0].b64_json, "base64");
  writeFileSync(pngPath, buf);
  manifest.output = { path: join(OUT_ROOT, style, `${style}.raw.png`).replace(/\\/g, "/"), bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
  writeFileSync(metaPath, JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(join(outDir, `${style}.prompt.txt`), cfg.prompt, "utf8");

  console.log(`  image bytes    : ${buf.length}`);
  console.log(`  image sha256   : ${manifest.output.sha256}`);
  console.log(`  written        : ${pngPath}`);
  console.log(`\n  ONE request sent. Judge with: node tools/avatar/check-r2-hair-candidate.mjs <png> ${style}`);
}
