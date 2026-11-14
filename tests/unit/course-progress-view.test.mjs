// Lærligverse F10-B2: the teacher's "Kursusforløb" section (js/course-progress-view.js) and its flag in
// js/student-detail.js. Pure functions with fixed test data — no backend, no browser.
//
// Proven:
//   1. FLAG: ENABLE_COURSE_PROGRESS_VIEW is a literal `false` constant in student-detail.js; the module is
//      imported only dynamically, inside the flag's branch, and the RPC is called only there.
//   2. ONE RULE SET: the evidence classification equals evidence.ts's `independent` state for every
//      combination with a known verdict, and the sequence port equals learning-sequence.ts nextStep() on
//      every history in a generated grid; both sources are pinned by sha256 so a change forces a review.
//   3. THE CONTRACT'S CASES, with fixed data: started/completed sequence, practice with and without help,
//      check solved independently, check solved at the 2nd attempt (never independent), application,
//      revisit ("Gentaget senere"), waiting revisit, legacy data without hints/mode ("Ikke registreret",
//      never 0), empty, malformed and partly malformed results, refused (null) and failed calls.
//   4. WORDS: never "lært", "mestret", "forstået", never a percentage; counts with the denominator.
//   5. DOM: text only (textContent), status in words, a table with scoped headers; markup in data is inert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  EVIDENCE_RULES, SEQUENCE_POLICY_ID, SEQUENCE_SOURCE, REVISIT_AFTER_HOURS, TEXT,
  classifyStepEvidence, nextStepFromHistory, normalizeCourseProgress, buildCourseProgressView, renderCourseProgress,
} from "../../js/course-progress-view.js";
import { assessObjectives } from "../../adventure-engine/packages/learning-bridge/src/evidence.ts";
import { nextStep, POLICY_ID, REVISIT_AFTER_HOURS as TS_REVISIT } from "../../supabase/functions/_shared/learning-sequence.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const sha12 = (p) => createHash("sha256").update(read(p)).digest("hex").slice(0, 12);
const MIGRATION = "supabase/migrations/20261109120000_laerligverse_course_progress_read.sql";

// ── 1. Flag ───────────────────────────────────────────────────────────────────────────────────────────

test("flag: a literal false constant, the module and the RPC reached only inside the flag's branch", () => {
  const src = read("js/student-detail.js");
  assert.equal(src.match(/const ENABLE_COURSE_PROGRESS_VIEW = false;/g)?.length, 1);
  assert.equal(/ENABLE_COURSE_PROGRESS_VIEW\s*=\s*true/.test(src), false);
  assert.equal(/localStorage|URLSearchParams\([^)]*\)\.get\("course/.test(src.split("COURSE-PROGRESS-VIEW BEGIN")[1] ?? ""), false);
  // No static import of the view module.
  assert.equal(/^import[^\n]*course-progress-view/m.test(src), false);
  assert.equal(src.match(/import\("\.\/course-progress-view\.js"\)/g)?.length, 1);
  assert.equal(src.match(/\.rpc\("get_course_progress"/g)?.length, 1);
  // The only caller of the loader is the guarded block, and the block holds nothing else.
  const block = src.split("// COURSE-PROGRESS-VIEW BEGIN")[1].split("// COURSE-PROGRESS-VIEW END")[0];
  assert.equal(block.trim(), "if (ENABLE_COURSE_PROGRESS_VIEW === true) {\n    await loadCourseProgressSection();\n  }");
  assert.equal(src.match(/loadCourseProgressSection\(\)/g)?.length, 2, "defined once, called once (in the block)");
  // The page itself is untouched: the section is created by the script, never in the HTML.
  const html = read("student-detail.html");
  assert.equal(/Kursusforløb|courseProgress|course-progress/.test(html), false);
});

// ── 2. One rule set ───────────────────────────────────────────────────────────────────────────────────

test("rule sources are pinned: evidence.ts and learning-sequence.ts as reviewed, in the module and the RPC", () => {
  assert.equal(EVIDENCE_RULES, `evidence.ts@${sha12("adventure-engine/packages/learning-bridge/src/evidence.ts")}`,
    "evidence.ts changed: review classifyStepEvidence and get_course_progress, then update both pins");
  assert.equal(SEQUENCE_SOURCE, `learning-sequence.ts@${sha12("supabase/functions/_shared/learning-sequence.ts")}`,
    "learning-sequence.ts changed: review nextStepFromHistory, then update the pin");
  assert.equal(SEQUENCE_POLICY_ID, POLICY_ID);
  assert.equal(REVISIT_AFTER_HOURS, TS_REVISIT);
  assert.ok(read(MIGRATION).includes(`c_rules     CONSTANT text := '${EVIDENCE_RULES}';`));
});

const T0 = Date.parse("2026-11-03T08:00:00Z");
const iso = (h) => new Date(T0 + h * 3_600_000).toISOString();

test("evidence: equals evidence.ts's `independent` state for every combination with a known verdict", () => {
  const modes = [null, "quiz_v1", "practice", "check", "review", "application", "diagnostic"];
  const hints = [null, 0, 1, 3];
  const steps = ["independent_application", "transfer", "revisit"];
  let compared = 0;
  for (const step of steps) for (const correct of [true, false]) for (const mode of modes) for (const h of hints) {
    const [a] = assessObjectives([{
      kind: "attempt", source: "server", objective: "o", at: iso(1), instanceId: "i", roundNo: 1, submissionId: "s",
      grading: "auto", wasCorrect: correct, isRepeat: false, mode, hintsUsed: h, situation: null, evidenceValid: null,
    }]);
    const expected = { observed: "shown_independently", unknown: "unknown", not_observed: "not_shown" }[a.states.independent.status];
    assert.equal(classifyStepEvidence({ step, status: "answered", correct, mode, hintsUsed: h }), expected, `${step} ${correct} ${mode} ${h}`);
    compared++;
  }
  assert.equal(compared, 3 * 2 * 7 * 4);
  // Practice steps are never evidence (mayBecomeEvidence = false), whatever the facts.
  for (const step of ["guided_practice", "revision"]) {
    assert.equal(classifyStepEvidence({ step, status: "answered", correct: true, mode: "check", hintsUsed: 0 }), "practice");
  }
  // The one documented addition: a first answer the server no longer knows is unknown, not "not shown".
  assert.equal(classifyStepEvidence({ step: "transfer", status: "answered", correct: null, mode: "application", hintsUsed: 0 }), "unknown");
  assert.equal(classifyStepEvidence({ step: "transfer", status: "served", correct: null, mode: null, hintsUsed: null }), "not_shown");
  assert.equal(classifyStepEvidence({ step: "bogus", status: "answered", correct: true, mode: "check", hintsUsed: 0 }), "unknown");
});

test("sequence: the port equals learning-sequence.ts nextStep() on a generated grid of histories", () => {
  const choices = {
    guided_practice: [null, { c: true, h: 0 }, { c: false, h: 0 }],
    revision: [null, { c: true, h: 1 }],
    independent_application: [null, { c: true, h: 2 }, { c: false, h: 2 }],
    transfer: [null, { c: true, h: 3 }, { c: null, h: 3 }, { c: true, h: Number.NaN }],
    revisit: [null, { c: false, h: 30 }],
  };
  const keys = Object.keys(choices);
  let n = 0;
  const walk = (i, hist) => {
    if (i === keys.length) {
      for (const now of [T0 + 10 * 3_600_000, T0 + 30 * 3_600_000, T0 + 100 * 3_600_000]) {
        const withServed = [...hist, { step: "transfer", answered: false, wasCorrect: null, answeredAt: null }, { step: null, answered: true, wasCorrect: true, answeredAt: iso(0) }];
        for (const h of [hist, withServed]) {
          const ts = nextStep(h, now);
          const js = nextStepFromHistory(h, now);
          const strip = ({ policy, mode, ...rest }) => rest;
          assert.deepEqual(js, strip(ts), JSON.stringify(h));
          n++;
        }
      }
      return;
    }
    for (const c of choices[keys[i]]) {
      walk(i + 1, c === null ? hist : [...hist, { step: keys[i], answered: true, wasCorrect: c.c, answeredAt: Number.isNaN(c.h) ? null : iso(c.h) }]);
    }
  };
  walk(0, []);
  assert.equal(n, 3 * 2 * 3 * 4 * 2 * 3 * 2);
});

// ── 3. The contract's cases ───────────────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-11-12T12:00:00Z");
function step(o) {
  const answered = o.status !== "served";
  return {
    step: o.step, status: answered ? "answered" : "served",
    correct: o.correct ?? null, attempt_no: o.attempt_no ?? (o.correct === true ? 1 : null),
    hints_used: o.hints ?? null, mode: o.mode ?? null,
    evidence: o.evidence, first_answer_at: answered ? o.at : null, served_at: o.served ?? o.at,
    grading: o.grading ?? (o.source === "attempt" ? "auto" : null), source: o.source ?? null,
    sequence: { answered, was_correct: o.seqCorrect ?? o.correct ?? null, answered_at: answered ? o.at : null },
  };
}
const H5 = { source: "attempt" };
const COMPLETE = {
  objective_id: "kildekritik_ophav", started_at: "2026-11-03T08:00:00Z",
  steps: [
    step({ ...H5, step: "guided_practice", correct: false, hints: 2, mode: "practice", evidence: "practice", at: "2026-11-03T08:05:00Z" }),
    step({ ...H5, step: "revision", correct: true, hints: 0, mode: "practice", evidence: "practice", at: "2026-11-03T08:10:00Z" }),
    step({ ...H5, step: "independent_application", correct: true, hints: 0, mode: "check", evidence: "shown_independently", at: "2026-11-03T08:15:00Z" }),
    step({ ...H5, step: "transfer", correct: false, attempt_no: 2, seqCorrect: true, hints: 0, mode: "application", evidence: "not_shown", at: "2026-11-03T08:20:00Z" }),
    step({ ...H5, step: "revisit", correct: true, hints: 1, mode: "review", evidence: "not_shown", at: "2026-11-11T09:00:00Z" }),
  ],
};
const WAITING = {
  objective_id: "kildekritik_formaal", started_at: "2026-11-12T08:00:00Z",
  steps: [
    step({ ...H5, step: "guided_practice", correct: true, hints: 0, mode: "practice", evidence: "practice", at: "2026-11-12T08:05:00Z" }),
    step({ ...H5, step: "independent_application", correct: true, hints: 0, mode: "check", evidence: "shown_independently", at: "2026-11-12T08:10:00Z" }),
    step({ ...H5, step: "transfer", correct: true, hints: 0, mode: "application", evidence: "shown_independently", at: "2026-11-12T10:00:00Z" }),
  ],
};
const LEGACY = {
  objective_id: "kildekritik_legacy", started_at: "2026-11-05T08:00:00Z",
  steps: [
    step({ source: "instance", step: "guided_practice", correct: true, evidence: "practice", at: "2026-11-05T08:05:00Z" }),
    step({ source: "instance", step: "independent_application", correct: true, evidence: "unknown", at: "2026-11-05T08:10:00Z" }),
    step({ step: "transfer", status: "served", evidence: "not_shown", served: "2026-11-05T08:11:00Z" }),
  ],
};
const result = (objectives) => ({ version: 1, rules: EVIDENCE_RULES, sources: { attempt_log: true, mode: false, hints: false }, objectives });
const rowsOf = (view, i) => view.objectives[i].rows.map((r) => [r.step, r.status, r.help, r.evidence]);

test("a completed sequence: practice with and without help, check independent, 2nd attempt, revisit later", () => {
  const view = buildCourseProgressView(result([COMPLETE]), null, NOW);
  assert.equal(view.state, "ok");
  const o = view.objectives[0];
  assert.equal(o.title, "kildekritik_ophav");
  assert.equal(o.startedText, "Påbegyndt 3. nov. 2026");
  assert.equal(o.completedText, "Gennemført 11. nov. 2026");
  assert.deepEqual(rowsOf(view, 0), [
    ["Vejledt øvelse", "Gennemført", "2 hints", "Øvelse (tæller ikke)"],
    ["Revision", "Gennemført", "0 hints", "Øvelse (tæller ikke)"],
    ["Selvstændig kontrol", "Løst", "0 hints", "Løst selvstændigt"],
    ["Anvendelse (transfer)", "Løst ved 2. forsøg", "0 hints", "Ikke løst selvstændigt"],
    ["Repetition", "Løst", "1 hint", "Ikke løst selvstændigt"],
  ]);
  assert.equal(o.rows[4].note, "Gentaget senere (8 dage efter anvendelsen)");
  assert.equal(o.rows.filter((r) => r.note !== null).length, 1);
  assert.equal(o.summary, "Løst selvstændigt i 1 af 3 bedømte trin.");
  assert.equal(o.nextText, null);
  assert.equal(o.footer, `Registrering: serverens forsøg (H5) · regler: ${EVIDENCE_RULES} · sekvens: laerligverse-test-policy-v0`);
});

test("a waiting revisit: shown as 'Venter til …', no evidence, application solved independently", () => {
  const view = buildCourseProgressView(result([WAITING]), null, NOW);
  const o = view.objectives[0];
  assert.equal(o.completedText, "Ikke gennemført endnu");
  assert.deepEqual(rowsOf(view, 0), [
    ["Vejledt øvelse", "Gennemført", "0 hints", "Øvelse (tæller ikke)"],
    ["Selvstændig kontrol", "Løst", "0 hints", "Løst selvstændigt"],
    ["Anvendelse (transfer)", "Løst", "0 hints", "Løst selvstændigt"],
    ["Repetition", "Venter til 13. nov. 2026", "—", "—"],
  ]);
  assert.equal(o.summary, "Løst selvstændigt i 2 af 2 bedømte trin.");
  // Once due, the revisit is the next step instead.
  const later = buildCourseProgressView(result([WAITING]), null, Date.parse("2026-11-13T07:00:00Z"));
  assert.equal(later.objectives[0].nextText, "Næste trin: Repetition");
  assert.equal(later.objectives[0].rows.length, 3);
});

test("legacy data without hints or mode: 'Ikke registreret' — never 0 — and a served step not yet answered", () => {
  const view = buildCourseProgressView(result([LEGACY]), null, NOW);
  const o = view.objectives[0];
  assert.deepEqual(rowsOf(view, 0), [
    ["Vejledt øvelse", "Gennemført", "Ikke registreret", "Øvelse (tæller ikke)"],
    ["Selvstændig kontrol", "Løst", "Ikke registreret", "Ikke registreret"],
    ["Anvendelse (transfer)", "Ikke besvaret endnu", "—", "—"],
  ]);
  assert.equal(o.summary, "Løst selvstændigt: ikke registreret (1 bedømt trin).");
  assert.equal(o.nextText, null, "the served step is on the page already");
  assert.equal(o.footer.startsWith("Registrering: kun opgaveinstanser (ingen forsøgslog)"), true);
  assert.equal(JSON.stringify(view).includes("0 hints"), false);
});

test("mixed known and unknown assessments: the count states its own denominator and the unknown ones", () => {
  const mixed = { ...COMPLETE, steps: [...COMPLETE.steps, step({ source: "instance", step: "revisit", correct: true, evidence: "unknown", at: "2026-11-12T09:00:00Z" })] };
  const o = buildCourseProgressView(result([mixed]), null, NOW).objectives[0];
  assert.equal(o.summary, "Løst selvstændigt i 1 af 3 bedømte trin · ikke registreret for 1.");
});

test("a server classification the facts do not support is shown as 'Ikke registreret', never upgraded", () => {
  const forged = { ...LEGACY, steps: [step({ source: "attempt", step: "independent_application", correct: true, mode: "check", hints: null, evidence: "shown_independently", at: iso(1) })] };
  const view = buildCourseProgressView(result([forged]), null, NOW);
  assert.deepEqual(rowsOf(view, 0)[0], ["Selvstændig kontrol", "Løst", "Ikke registreret", "Ikke registreret"]);
  const weird = { ...LEGACY, steps: [step({ source: "attempt", step: "transfer", correct: true, mode: "application", hints: 0, evidence: "mastered", at: iso(1) })] };
  assert.equal(buildCourseProgressView(result([weird]), null, NOW).objectives[0].rows[0].evidence, "Ikke registreret");
});

test("pending teacher grade and a first answer the server no longer knows", () => {
  const o = { ...LEGACY, steps: [
    step({ source: "attempt", step: "transfer", correct: null, grading: "teacher", mode: "application", hints: 0, evidence: "unknown", at: iso(1) }),
    { ...step({ step: "independent_application", correct: null, evidence: "unknown", at: iso(2) }), first_answer_at: null, attempt_no: null },
  ] };
  assert.deepEqual(rowsOf(buildCourseProgressView(result([o]), null, NOW), 0), [
    ["Anvendelse (transfer)", "Afventer lærerens bedømmelse", "0 hints", "Ikke registreret"],
    ["Selvstændig kontrol", "Førstesvar ikke registreret", "Ikke registreret", "Ikke registreret"],
  ]);
});

test("empty, refused, failed and malformed results each give an explicit message — never a crash", () => {
  assert.deepEqual(buildCourseProgressView(result([]), null, NOW), { state: "empty", message: TEXT.empty, objectives: [], skippedNote: null });
  assert.equal(buildCourseProgressView(null, null, NOW).message, "Kursusforløbet er ikke tilgængeligt for denne elev.");
  assert.equal(buildCourseProgressView(undefined, null, NOW).state, "unavailable");
  assert.equal(buildCourseProgressView(null, { message: "boom" }, NOW).message, "Kursusforløbet kunne ikke hentes. Prøv igen senere.");
  for (const bad of ["x", 42, [], {}, { objectives: "nej" }, { objectives: null }, true]) {
    const v = buildCourseProgressView(bad, null, NOW);
    assert.equal(v.state, "malformed", JSON.stringify(bad));
    assert.equal(v.message, "Kursusdata har et uventet format og kan ikke vises.");
  }
  const partly = buildCourseProgressView(result([42, { objective_id: "", steps: [] }, { objective_id: "a", steps: [null, { step: "transfer", status: "weird" }, LEGACY.steps[0]] }]), null, NOW);
  assert.equal(partly.state, "ok");
  assert.equal(partly.objectives.length, 1);
  assert.equal(partly.objectives[0].rows.length, 1);
  assert.equal(partly.skippedNote, "4 poster kunne ikke læses og er udeladt.");
  // Wrong types inside an otherwise valid step become "not registered", never a number.
  const n = normalizeCourseProgress(result([{ objective_id: "b", started_at: "ikke en dato", steps: [{ step: "transfer", status: "answered", correct: "ja", hints_used: 7, attempt_no: -1, first_answer_at: 5, sequence: "x" }] }]));
  assert.equal(n.ok, true);
  assert.deepEqual([n.objectives[0].startedAt, n.objectives[0].steps[0].correct, n.objectives[0].steps[0].hintsUsed, n.objectives[0].steps[0].attemptNo], [null, null, null, null]);
  const v = buildCourseProgressView(result([{ objective_id: "b", steps: [] }]), null, Number.NaN);
  assert.equal(v.objectives[0].startedText, "Påbegyndt (tidspunkt ikke registreret)");
  assert.equal(v.objectives[0].summary, "Ingen bedømte trin besvaret endnu.");
  assert.equal(v.objectives[0].nextText, "Næste trin: Vejledt øvelse");
});

// ── 4. Words ──────────────────────────────────────────────────────────────────────────────────────────

test("words: never lært/mestret/forstået, never a percentage, never mastery vocabulary", () => {
  const views = [COMPLETE, WAITING, LEGACY].map((o) => buildCourseProgressView(result([o]), null, NOW));
  const src = read("js/course-progress-view.js");
  const strings = [...src.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]).join("\n");
  for (const text of [JSON.stringify(views), strings]) {
    assert.equal(/\blært|\bmestre|\bmestret|\bmestring|\bforstået|\bforståelse/i.test(text), false);
    assert.equal(/%|procent/i.test(text), false);
  }
});

// ── 5. DOM ────────────────────────────────────────────────────────────────────────────────────────────

// A minimal document: enough for renderCourseProgress (createElement, textContent, attributes, children).
function fakeDoc() {
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(), children: [], attrs: {}, className: "", _text: "",
      get firstChild() { return this.children[0] ?? null; },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      set textContent(v) { this.children = []; this._text = String(v); },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set innerHTML(_v) { throw new Error("innerHTML must not be used"); },
    };
    return node;
  };
  return { createElement: make };
}
const all = (n, pred, out = []) => { if (pred(n)) out.push(n); for (const c of n.children) all(c, pred, out); return out; };

test("DOM: a table per objective with scoped headers, status in words, data as text only", () => {
  const doc = fakeDoc();
  const panel = doc.createElement("div");
  panel.appendChild(doc.createElement("p"));
  const evil = { ...LEGACY, objective_id: "<img src=x onerror=alert(1)>" };
  renderCourseProgress(panel, buildCourseProgressView(result([COMPLETE, evil]), null, NOW), doc);
  assert.equal(panel.children[0].className, "course-progress-intro");
  const cards = all(panel, (n) => n.tagName === "ARTICLE");
  assert.equal(cards.length, 2);
  assert.equal(all(cards[1], (n) => n.tagName === "H4")[0].textContent, "<img src=x onerror=alert(1)>");
  assert.equal(all(panel, (n) => n.tagName === "IMG").length, 0);
  const heads = all(cards[0], (n) => n.tagName === "TH" && n.attrs.scope === "col").map((n) => n.textContent);
  assert.deepEqual(heads, ["Trin", "Status", "Hjælp", "Evidens"]);
  assert.equal(all(cards[0], (n) => n.tagName === "TH" && n.attrs.scope === "row").length, 5);
  const evidence = all(cards[0], (n) => n.className === "course-progress-evidence");
  assert.deepEqual(evidence.map((n) => [n.textContent, n.attrs["data-evidence"]]), [
    ["Øvelse (tæller ikke)", "practice"], ["Øvelse (tæller ikke)", "practice"], ["Løst selvstændigt", "shown_independently"],
    ["Ikke løst selvstændigt", "not_shown"], ["Ikke løst selvstændigt", "not_shown"],
  ]);
  assert.ok(cards[0].textContent.includes("Gentaget senere (8 dage efter anvendelsen)"));
  // A message state replaces the previous content and is announced.
  renderCourseProgress(panel, buildCourseProgressView("x", null, NOW), doc);
  assert.equal(panel.children.length, 2);
  assert.equal(panel.children[1].attrs.role, "status");
  assert.equal(panel.children[1].textContent, TEXT.malformed);
  // A broken view object never throws.
  renderCourseProgress(panel, null, doc);
  assert.equal(panel.children[1].textContent, TEXT.malformed);
  renderCourseProgress(null, null, doc);
});
