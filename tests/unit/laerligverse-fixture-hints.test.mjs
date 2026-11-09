// F10-B2 (L3 test delivery): the isolated server fixture carries the SAME teacher-reviewed hint texts the
// game shows, so the server's hint log (PR #653) has real content to serve in the isolated stack.
// Proven:
//   1. VERBATIM: every fixture item's content.hints equals host-items.ts's hints for that item, in order —
//      no text is invented or edited here (the teacher review pack and the approval fingerprints are built
//      from host-items.ts, not from the fixture, and stay byte-identical: review-pack/approval-register --check).
//   2. PRACTICE ONLY (LP13-3 A): items whose learning_step is guided_practice or revision may carry hints;
//      every check / application / revisit item carries none.
//   3. A HINT IS HELP, NOT THE KEY: no hint names the correct option's label verbatim, and no hint is the
//      correct option's description (option_details).
//   4. NEVER PUBLIC: toPublicQuestion drops content.hints (PUBLIC_CONTENT_KEYS has no "hints").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE, fixture } from "../../tools/laerligverse/review-pack.mjs";
import { ARCHIVE_ITEMS } from "../../adventure-engine/packages/archive-prototype/src/host-items.ts";
import { toPublicQuestion, PUBLIC_CONTENT_KEYS } from "../../supabase/functions/_shared/question-dto.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const onDisk = JSON.parse(readFileSync(FIXTURE, "utf8"));
const PRACTICE = new Set(["guided_practice", "revision"]);

test("1. the fixture on disk is the generated one, and its hints are host-items.ts's, verbatim", async () => {
  assert.deepEqual(onDisk, await fixture(), "run node tools/laerligverse/review-pack.mjs");
  assert.equal(onDisk.length, ARCHIVE_ITEMS.length);
  for (const item of onDisk) {
    const src = ARCHIVE_ITEMS.find((i) => i.id === item.tag);
    assert.ok(src, `${item.tag} comes from host-items.ts`);
    assert.deepEqual(item.content.hints, [...src.hints], `${item.tag}: verbatim, same order`);
  }
  assert.ok(onDisk.some((i) => i.content.hints.length > 0), "at least one item has hints (not vacuous)");
});

test("2. practice steps only: check, application and revisit items carry no hints", () => {
  for (const item of onDisk) {
    assert.ok(Array.isArray(item.content.hints), `${item.tag}: hints is an array`);
    if (!PRACTICE.has(item.learning_step)) assert.deepEqual(item.content.hints, [], `${item.tag} (${item.learning_step})`);
    assert.ok(item.content.hints.length <= 3, `${item.tag}: at most 3 levels (K1 hints_used 0–3)`);
    for (const h of item.content.hints) assert.ok(typeof h === "string" && h.trim().length > 0 && h.length <= 400);
  }
});

test("3. a hint is help, not the key: it never names the correct label nor repeats its description", () => {
  for (const item of onDisk) {
    const correct = item.content.correct;
    const detail = item.content.option_details[item.content.options.indexOf(correct)];
    for (const h of item.content.hints) {
      assert.ok(!h.toLowerCase().includes(String(correct).toLowerCase()), `${item.tag}: "${h}" names the answer`);
      assert.notEqual(h, detail, `${item.tag}: a hint must not be the correct source's description`);
    }
  }
});

test("4. never public: the DTO drops content.hints", () => {
  assert.ok(!PUBLIC_CONTENT_KEYS.includes("hints"));
  const withHints = onDisk.find((i) => i.content.hints.length > 0);
  // toPublicQuestion(rawContent, format, rawMetadata, instanceKey) — the exact call get-next-question makes.
  const pub = toPublicQuestion(withHints.content, "mc", { learning_step: withHints.learning_step }, "00000000-0000-4000-8000-0000000000aa");
  assert.ok(!Object.hasOwn(pub.content ?? {}, "hints"), "no hints in the public question");
  assert.ok(!JSON.stringify(pub).includes(withHints.content.hints[0]), "no hint text anywhere in the public payload");
});
