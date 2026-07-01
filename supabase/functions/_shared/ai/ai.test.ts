// ── AI abstraction layer: default-off + fail-soft unit tests (157S) ──────────
// Run with Deno's built-in test runner (no new dependency): `npm run test:unit:ai`
// (or `deno test --allow-env supabase/functions/_shared/ai/`). Asserts only the
// default-off / advisory / minimisation guarantees — no provider is configured, so
// nothing is sent anywhere and no external service is contacted.

import { createAiService } from "./index.ts";
import { minimiseGradeInput } from "./redact.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}

Deno.test("ai: unavailable by default (no flag / no provider configured)", () => {
  const ai = createAiService();
  assert(ai.isAvailable() === false, "isAvailable should be false by default");
});

Deno.test("ai: grade returns advisory-unavailable, never throws", async () => {
  const ai = createAiService();
  const r = await ai.grade({ answer: "Et elevsvar." });
  assert(r.available === false, "available should be false");
  assert(r.data === null, "no suggestion when unavailable");
  assert(typeof r.reason === "string", "reason should be present");
});

Deno.test("ai: grade with empty answer is safe", async () => {
  const ai = createAiService();
  const r = await ai.grade({ answer: "" });
  assert(r.available === false, "empty answer → unavailable");
});

Deno.test("ai: minimiseGradeInput scrubs PII and drops extra fields", () => {
  const m = minimiseGradeInput({
    answer: "Skriv til mig paa a@b.com",
    rubric: "Kort begrundelse",
    questionText: "Hvad skete der?",
    // deno-lint-ignore no-explicit-any
    ...( { studentName: "Anna", email: "x@y.dk" } as any),
  });
  assert(m.answer.includes("[redacted-email]"), "email in answer scrubbed");
  assert(m.rubric === "Kort begrundelse", "rubric preserved");
  assert(m.questionText === "Hvad skete der?", "question preserved");
  // deno-lint-ignore no-explicit-any
  assert((m as any).studentName === undefined, "extra PII field dropped");
  // deno-lint-ignore no-explicit-any
  assert((m as any).email === undefined, "extra PII field dropped");
  assert(m.language === "da", "default language");
});
