// D-139 — the pinned prompt for the ONE head-only underlay call.
//
// The prompt was approved verbatim by the owner. The risk these tests exist for is not a typo: it
// is that the text drifts between approval and transmission — a rewrap, a "clearer" wording, a
// stray CRLF from a Windows editor — and the call then sends something nobody approved. So the
// wrapper file and the fenced block that is actually transmitted are BOTH pinned by byte count and
// SHA-256, and the pins are checked against the file, the contract and the adapter at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../tools/avatar/openai-generate-r3-underlay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PROMPT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3-underlay", "r3-underlay-prompt.md");
const CONTRACT = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");

const RAW = readFileSync(PROMPT_PATH);
const MD = RAW.toString("utf8");
const EXTRACT = A.extractPrompt(MD);

/** The call entry, found the way the adapter finds it: by call id, not by position. */
function authorisedCall() {
  const calls = CONTRACT.authorisedCalls.calls.filter((c) => c.callId === A.CALL_ID);
  assert.equal(calls.length, 1, "exactly one authorised call must carry this id");
  return calls[0];
}

test("the wrapper file matches its pin exactly", () => {
  assert.equal(RAW.length, A.PROMPT_FILE.bytes);
  assert.equal(sha(RAW), A.PROMPT_FILE.sha256);
});

test("the file is LF-only — a CRLF checkout would change every transmitted byte", () => {
  assert.ok(!MD.includes("\r"), "the prompt file must contain no CR");
});

test("the transmitted text is the fenced block, and only the fenced block", () => {
  assert.ok(EXTRACT.ok, EXTRACT.why || "extraction failed");
  const fences = MD.split("\n").filter((l) => l.trimEnd() === "```").length;
  assert.equal(fences, 2, "exactly two fences, so there is no ambiguity about what is sent");
  // everything outside the block is documentation and must not reach the wire
  assert.ok(!EXTRACT.prompt.includes("Nothing in this file authorises a call"));
  assert.ok(!EXTRACT.prompt.includes("## Provenance"));
  assert.ok(MD.includes("Nothing in this file authorises a call"), "the wrapper must still say so");
});

test("the transmitted text matches its pin exactly", () => {
  const buf = Buffer.from(EXTRACT.prompt, "utf8");
  assert.equal(buf.length, A.PROMPT_BODY.bytes);
  assert.equal(sha(buf), A.PROMPT_BODY.sha256);
});

test("the transmitted text ends with exactly one newline", () => {
  assert.ok(EXTRACT.prompt.endsWith("\n"));
  assert.ok(!EXTRACT.prompt.endsWith("\n\n"));
  assert.equal(A.PROMPT_TRAILING_NEWLINES, 1);
});

test("the first line is the pinned opening, so the call cannot start with something else", () => {
  assert.equal(EXTRACT.prompt.split("\n")[0], A.PROMPT_FIRST_LINE);
});

test("every required section is present", () => {
  for (const marker of A.PROMPT_MARKERS) {
    assert.ok(EXTRACT.prompt.includes(marker), "the prompt is missing " + JSON.stringify(marker));
  }
});

test("the ear line is present verbatim — it is the owner's explicit instruction", () => {
  assert.ok(EXTRACT.prompt.includes("- The ears, in the same position, shape and size."));
  const keep = EXTRACT.prompt.split("KEEP EXACTLY AS THEY ARE IN IMAGE 1:")[1].split("\n\n")[0];
  assert.ok(keep.includes("The ears"), "the ears must be listed under what is KEPT, not elsewhere");
});

test("the prompt asks for what the contract says the model may produce", () => {
  const p = EXTRACT.prompt;
  assert.match(p, /Remove all hair completely/);
  assert.match(p, /Remove all facial features/);
  assert.match(p, /bald cranium/);
  for (const absent of ["No eyes", "no irises", "no pupils", "no eyebrows", "no nose", "no mouth"]) {
    assert.ok(p.includes(absent), "the prompt must forbid " + absent);
  }
});

test("Image 2 is fenced to style, and is explicitly forbidden to supply hair or a face", () => {
  const p = EXTRACT.prompt;
  assert.match(p, /Image 2 is a reference for HEAD SHAPE, SKIN TONE and LINE STYLE ONLY/);
  assert.match(p, /Do not copy its hair/);
  assert.match(p, /Do\s+not copy its face/, "the sentence wraps across a line in the approved text");
});

test("the background and the format are stated in the prompt as well as in the parameters", () => {
  const p = EXTRACT.prompt;
  assert.match(p, /No background\. The background must be fully transparent\./);
  assert.match(p, /1024 x 1536 pixels, PNG, with a transparent background/);
  assert.match(p, /One image only\./);
});

test("the prompt does NOT ask for the same head size — that would contradict gates.notCompared", () => {
  // Removing the hair legitimately lowers the topmost pixel. A prompt that demanded the same head
  // size would push the model to keep the hair volume, and the recorded gate says the opposite.
  assert.ok(!/same head size/i.test(EXTRACT.prompt));
  assert.match(EXTRACT.prompt, /Smaller than the haired silhouette/);
  assert.match(CONTRACT.firstCall.gates.notCompared, /must NOT be compared directly with H1/);
});

test("the contract pins the same prompt bytes the adapter does", () => {
  const call = authorisedCall();
  assert.equal(call.prompt.fileSha256, A.PROMPT_FILE.sha256);
  assert.equal(call.prompt.fileBytes, A.PROMPT_FILE.bytes);
  assert.equal(call.prompt.transmittedSha256, A.PROMPT_BODY.sha256);
  assert.equal(call.prompt.transmittedBytes, A.PROMPT_BODY.bytes);
  assert.equal(call.prompt.lineEndings, "LF");
  assert.equal(call.prompt.trailingNewlines, 1);
});

test("the contract records that the text is the owner's, unedited", () => {
  const call = authorisedCall();
  assert.equal(call.prompt.approvedVerbatimOn, "2026-09-11");
  assert.match(call.prompt.noEditorialChange, /No rewording, rewrap, reordering or editorial improvement/);
});

test("a single changed byte in the fenced block breaks extraction against the pin", () => {
  const tampered = MD.replace("bald cranium with a clean, even outline", "bald cranium with a clean even outline");
  assert.notEqual(tampered, MD, "the tamper must actually change something");
  const ex = A.extractPrompt(tampered);
  assert.ok(ex.ok, "it still parses — the pin, not the parser, is what catches this");
  assert.notEqual(sha(Buffer.from(ex.prompt, "utf8")), A.PROMPT_BODY.sha256);
});

test("a CRLF version of the same text is refused outright", () => {
  const crlf = MD.split("\n").join("\r\n");
  const ex = A.extractPrompt(crlf);
  assert.equal(ex.ok, false);
  assert.match(ex.why, /CR/);
});

test("an extra trailing newline inside the block is refused", () => {
  // The wrapper's own trailing content is stripped, so the tamper has to sit INSIDE the fence.
  const lines = MD.split("\n");
  const fenceIdx = lines.map((l, i) => (l.trimEnd() === "```" ? i : -1)).filter((i) => i >= 0);
  lines.splice(fenceIdx[0] + 1, 0, "");
  const ex = A.extractPrompt(lines.join("\n"));
  assert.ok(ex.ok === false || sha(Buffer.from(ex.prompt, "utf8")) !== A.PROMPT_BODY.sha256,
    "a blank line inserted into the block must not still hash to the approved text");
});

test("the prompt file authorises nothing on its own", () => {
  assert.match(MD, /Nothing in this file authorises a call/);
});

// ── D-141 §7: the prepared v2 prompt ─────────────────────────────────────────────────────────
//
// A new fixture, pinned the same way. The four changes from D-139's text each target the measured
// failure: the model shrank the neck along with the cranium, and nothing in the prompt said the
// neck had to stay. D-139's prompt is untouched, and one test holds it to that.

const V2_PATH = join(REPO, "tools", "avatar", "fixtures", "r3-underlay", "r3-underlay-prompt-v2.md");
const V2_RAW = readFileSync(V2_PATH);
const V2_MD = V2_RAW.toString("utf8");
/**
 * v2 is extracted here with the documented rule, NOT with A.extractPrompt: that function is pinned
 * to D-139's section markers (it requires "CHANGE ONLY THE HEAD:", which v2 deliberately replaces),
 * and D-141 implements no adapter of its own. The rule is the same either way: the single fenced
 * block, LF endings, exactly one trailing newline.
 */
function extractFenced(md) {
  if (md.includes("\r")) return { ok: false, why: "the file contains CR" };
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === "```") fences.push(i);
  if (fences.length !== 2) return { ok: false, why: "expected exactly 2 fences, found " + fences.length };
  return { ok: true, prompt: lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, "") + "\n" };
}
const V2 = extractFenced(V2_MD);

test("v2: the wrapper file matches its pin", () => {
  assert.equal(V2_RAW.length, 6242);
  assert.equal(sha(V2_RAW), "8a4e817f0a9171968211a2b4c90dff3d6507ca9dc6f3e73b5edc2bf9bc9ec141");
});

test("v2: LF only, one fenced block, exactly one trailing newline", () => {
  assert.ok(!V2_MD.includes("\r"), "the file must be LF-only");
  assert.equal(V2_MD.split("\n").filter((l) => l.trimEnd() === "```").length, 2);
  assert.ok(V2.ok, V2.why || "extraction failed");
  assert.ok(V2.prompt.endsWith("\n"));
  assert.ok(!V2.prompt.endsWith("\n\n"));
});

test("v2: the transmitted text matches its pin", () => {
  const buf = Buffer.from(V2.prompt, "utf8");
  assert.equal(buf.length, 2731);
  assert.equal(sha(buf), "76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693");
});

test("v2: the four changes that target the measured failure are all present", () => {
  const p = V2.prompt;
  assert.match(p, /CHANGE ONLY THE HEAD ABOVE THE NECK:/, "(a) the head is bounded at the neck");
  assert.match(p, /Its width, its outline and both of its sides must be identical to Image 1/, "(b) the neck is pinned");
  assert.match(p, /Do not\s+make the neck longer, shorter, narrower or wider\./);
  assert.match(p, /WHERE THE HEAD MEETS THE NECK:/, "(c) the join is addressed");
  assert.match(p, /ABOVE THE JAW ONLY/, "(d) what gets smaller is bounded");
  assert.match(p, /The neck does not become smaller\./);
});

test("v2: the join instruction asks for a taper, not a single-row step", () => {
  const p = V2.prompt;
  assert.match(p, /widen out to meet the neck at exactly the width the neck has in Image 1/);
  assert.match(p, /no step, no notch and no change of width/);
  assert.match(p, /Do not put the\s+change of width into a single row\./);
});

test("v2: everything the owner approved for D-139 is carried over unchanged", () => {
  const p = V2.prompt;
  assert.equal(p.split("\n")[0], A.PROMPT_FIRST_LINE);
  assert.match(p, /Image 2 is a reference for HEAD SHAPE, SKIN TONE and LINE STYLE ONLY/);
  assert.match(p, /Do not copy its hair/);
  assert.match(p, /Do\s+not copy its face/);
  assert.ok(p.includes("- The ears, in the same position, shape and size."), "the ears line is the owner's instruction");
  for (const absent of ["No eyes", "no irises", "no pupils", "no eyebrows", "no nose", "no mouth"]) {
    assert.ok(p.includes(absent), "the absence list must survive: " + absent);
  }
  assert.match(p, /No background\. The background must be fully transparent\./);
  assert.match(p, /1024 x 1536 pixels, PNG, with a transparent background/);
  assert.match(p, /One image only\./);
});

test("v2: it still does not ask for the same head size", () => {
  assert.ok(!/same head size/i.test(V2.prompt));
  assert.match(CONTRACT.firstCall.gates.notCompared, /must NOT be compared directly with H1/);
});

test("v2: the file authorises nothing and says a call can still fail", () => {
  assert.match(V2_MD, /Nothing in this file authorises a call/);
  assert.match(V2_MD, /A next call\s+can still fail/);
  assert.match(V2_MD, /requires a separate owner-visual review/);
});

test("D-139's prompt is untouched by D-141", () => {
  assert.equal(RAW.length, A.PROMPT_FILE.bytes);
  assert.equal(sha(RAW), A.PROMPT_FILE.sha256);
  assert.equal(sha(RAW), "8a5cb283a4cb5803adf45d8d35e68a0c058a6604ffc9869ec58ea1ee514724f6");
  assert.notEqual(sha(V2_RAW), sha(RAW), "the two prompts are different files");
  // the D-139 adapter still points at the D-139 prompt, not the prepared one
  assert.equal(A.PROMPT_FILE.name, "r3-underlay-prompt.md");
});

test("the register records both prompt hashes", () => {
  const row = readFileSync(join(REPO, "docs", "project-state.md"), "utf8")
    .split("\n").filter((l) => l.startsWith("| **D-141** |"))[0];
  assert.ok(row, "the D-141 row must exist");
  assert.ok(row.includes("8a4e817f0a9171968211a2b4c90dff3d6507ca9dc6f3e73b5edc2bf9bc9ec141"), "the file hash");
  assert.ok(row.includes("76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693"), "the transmitted hash");
  assert.ok(row.includes("2.731 B"), "the transmitted byte count");
});
