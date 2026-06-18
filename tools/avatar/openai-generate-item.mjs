// 164O — OpenAI Image API adapter: generate EXACTLY ONE raw glasses overlay item.
// ---------------------------------------------------------------------------
// Backend = OpenAI Image API ONLY (no other vendors). Claude Code orchestrates the
// repo/tooling/QA; this adapter just produces one raw PNG for the 164N gate.
//
// HARD BOUNDARIES:
//   * Exactly ONE image (n:1). One slot: eyes/glasses. NO bulk.
//   * API key from env OPENAI_API_KEY only — NEVER hardcoded, NEVER printed/stored.
//   * Output is a gitignored build artifact: tools/avatar/build/ai-input/glasses-test-raw.png
//   * No runtime/DB/assets/AVATAR_V2 changes. Master untouched.
//
// Run:  OPENAI_API_KEY=sk-... npm run avatar:generate-openai-item
// Then: npm run avatar:ai-test-item   (the existing 164N clip/QA gate)
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const IN_DIR = join(HERE, "build", "ai-input");
const RAW = join(IN_DIR, "glasses-test-raw.png");

// Model: default to the known OpenAI image model; override via OPENAI_IMAGE_MODEL
// (e.g. set to "gpt-image-2" if/when available on your account).
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const SIZE = "1024x1536";   // matches the 164N full-canvas; 164N uses it as-is

const PROMPT = [
  "A single pair of simple round eyeglasses as an ISOLATED accessory overlay.",
  "Transparent background. ONLY the glasses — no face, no eyes, no skin, no hair, no head,",
  "no body, no character, no scene, no text, no logo, no drop shadow.",
  "Style: premium anime mobile-game accessory, clean cel-shaded, round lenses,",
  "dark charcoal frame, subtle single highlight. Centered. Usable as a transparent overlay.",
].join(" ");

function instructAndExit() {
  console.log(JSON.stringify({
    status: "MISSING_OPENAI_API_KEY",
    howToSet: {
      bash:       "export OPENAI_API_KEY=sk-...   (then re-run)",
      powershell: "$env:OPENAI_API_KEY = 'sk-...'  (then re-run)",
    },
    note: "Key is read from the environment only and is never printed or stored. No generation was attempted.",
  }, null, 2));
}

async function main() {
  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) { instructAndExit(); return; }

  mkdirSync(IN_DIR, { recursive: true });
  let res;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, prompt: PROMPT, n: 1,
        size: SIZE, background: "transparent", output_format: "png", quality: "high",
      }),
    });
  } catch (e) {
    console.error(JSON.stringify({ status: "NETWORK_ERROR", message: String(e && e.message || e) }, null, 2));
    process.exit(1);
  }

  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j?.error?.message || JSON.stringify(j); } catch { detail = await res.text().catch(() => ""); }
    console.error(JSON.stringify({
      status: "OPENAI_API_ERROR", httpStatus: res.status, model: MODEL,
      message: detail, // never includes the key
      hint: res.status === 404 ? "Model may be unavailable on this account — set OPENAI_IMAGE_MODEL to a model you have access to." : undefined,
    }, null, 2));
    process.exit(1);
  }

  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) { console.error(JSON.stringify({ status: "NO_IMAGE_RETURNED", model: MODEL }, null, 2)); process.exit(1); }
  const bytes = Buffer.from(b64, "base64");
  writeFileSync(RAW, bytes);

  console.log(JSON.stringify({
    status: "GENERATED", model: MODEL, size: SIZE, bytes: bytes.length,
    output: "tools/avatar/build/ai-input/glasses-test-raw.png",
    next: "npm run avatar:ai-test-item   (runs the 164N clip/QA gate)",
  }, null, 2));
}

main();
