// The format mix (get-next-question v2): interaction-kind registry, server-derived band, the mix
// decision, its server reads, and its wiring into index.ts behind QUESTION_MIX_ENGINE.
//
// The modules are pure TypeScript with no Deno or network imports, so this file imports and runs
// exactly what the Edge Function runs. index.ts is a Deno entrypoint with URL imports; its wiring is
// pinned at source level (comments stripped, so an explanation can never satisfy a regex).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  INTERACTION_KINDS, KIND_ORDER, BASE_KIND, classifyQuestion, isServableKind, servableWireFormat,
} from "../../supabase/functions/_shared/interaction-kinds.ts";
import {
  foldBand, initialFoldState, parseServerBand, startBand, GRADE_START_BAND,
} from "../../supabase/functions/get-next-question/server-band.ts";
import {
  MIX_POLICY, planNextQuestions, resolveMixEngine, toMixHistory,
} from "../../supabase/functions/get-next-question/format-mix.ts";
import {
  loadFormatMixPlan, BAND_RPC, CANDIDATES_RPC, CANDIDATES_PER_GROUP, HISTORY_LIMIT, HISTORY_SELECT,
} from "../../supabase/functions/get-next-question/mix-flow.ts";
import { getWaveScore, sortByWave } from "../../supabase/functions/get-next-question/wave-order.ts";
import { resolveAnswerRenderer } from "../../js/answer-input.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const INDEX = read("../../supabase/functions/get-next-question/index.ts");
const INDEX_CODE = code(INDEX);
const MIX_CODE = code(read("../../supabase/functions/get-next-question/format-mix.ts"));
const FLOW_CODE = code(read("../../supabase/functions/get-next-question/mix-flow.ts"));

// The server's own mapAnswerFormat, taken from index.ts and run as-is (only its type annotation removed).
const mapAnswerFormat = (() => {
  const m = INDEX_CODE.match(/function mapAnswerFormat\(format: string \| null\) \{[\s\S]*?\n\}/);
  assert.ok(m, "mapAnswerFormat not found in index.ts");
  return new Function(`return (${m[0].replace("format: string | null", "format")});`)();
})();

// ── 1. Interaction kinds ─────────────────────────────────────────────────────────────────────────
test("registry: exactly one base kind (choice); Match par is registered but NOT servable", () => {
  assert.equal(BASE_KIND, "choice");
  assert.deepEqual(KIND_ORDER, ["choice", "short_text", "long_text", "number", "force_text", "match_pairs"]);
  assert.equal(INTERACTION_KINDS.match_pairs.servable, false);
  assert.equal(INTERACTION_KINDS.match_pairs.renderer, null);
  for (const k of KIND_ORDER.filter((k) => k !== "match_pairs")) assert.equal(INTERACTION_KINDS[k].servable, true, k);
  assert.equal(isServableKind("match_pairs"), false);
  assert.equal(isServableKind(null), false);
});

test("registry: long teacher-graded answers are their own kind and are never chosen by quota", () => {
  assert.notEqual(classifyQuestion({ answer_format: "text", answer_type: "long" }),
    classifyQuestion({ answer_format: "text", answer_type: "short" }));
  assert.equal(INTERACTION_KINDS.long_text.teacherGraded, true);
  assert.equal(INTERACTION_KINDS.long_text.maxShare, 0);
  assert.equal(INTERACTION_KINDS.short_text.teacherGraded, false);
});

test("classifyQuestion: the live formats", () => {
  assert.equal(classifyQuestion({ answer_format: "mc", answer_type: "short", content: { type: "mc" } }), "choice");
  assert.equal(classifyQuestion({ answer_format: "mc", answer_type: null }), "choice");
  assert.equal(classifyQuestion({ answer_format: "text", answer_type: "short" }), "short_text"); // Stav til
  assert.equal(classifyQuestion({ answer_format: "text", answer_type: "long" }), "long_text");
  assert.equal(classifyQuestion({ answer_format: "number", answer_type: "short" }), "number");
  assert.equal(classifyQuestion({ answer_format: "mc", content: { force_text: true } }), "force_text");
  assert.equal(classifyQuestion({ answer_format: "mc", force_text: true }), "force_text");
  assert.equal(classifyQuestion({ answer_format: "match" }), "match_pairs");
});

test("classifyQuestion: anything the layers would disagree on is null — never served by the mix", () => {
  for (const row of [
    null, undefined, {}, { answer_format: "" }, { answer_format: null }, { answer_format: 3 },
    { answer_format: "MC" }, { answer_format: " mc" }, { answer_format: "TEXT" },  // case/space-sensitive server
    { answer_format: "text", answer_type: "Long" },                                // graded short, shown long
    { answer_format: "mc", answer_type: "long" },                                  // shown MC, graded by teacher
    { answer_format: "number", answer_type: "long" },
    { answer_format: "text", answer_type: "medium" },
    { answer_format: "longtext" },                                                 // server "text", browser unsupported
    { answer_format: "mc_number" },                                                // server "mc", browser "number"
    { answer_format: "matching" }, { answer_format: "drag_drop" },                 // unknown: server would say "mc"
    { answer_format: "text", content: { force_text: true } },
    { answer_format: "text", answer_type: "long", content: { force_text: true } },
  ]) {
    assert.equal(classifyQuestion(row), null, JSON.stringify(row));
  }
});

test("classifyQuestion agrees with the browser renderer AND the server's mapAnswerFormat for every kind it names", () => {
  const formats = ["mc", "mc_single", "number", "text", "match", "match_pairs", "MC", "Text", "longtext", "mc_number", "foo", "", null];
  const types = ["short", "long", "Long", "", null, "medium"];
  let named = 0;
  for (const answer_format of formats) for (const answer_type of types) for (const force_text of [false, true]) {
    const row = { answer_format, answer_type, content: force_text ? { question: "?", force_text: true } : { question: "?" } };
    const kind = classifyQuestion(row);
    if (kind === null) continue;
    named++;
    const spec = INTERACTION_KINDS[kind];
    if (spec.renderer !== null) assert.equal(resolveAnswerRenderer(row), spec.renderer, JSON.stringify(row));
    else assert.equal(resolveAnswerRenderer(row), "unsupported", JSON.stringify(row));
    if (kind !== "match_pairs") assert.equal(mapAnswerFormat(answer_format), spec.wireFormat, JSON.stringify(row));
  }
  assert.ok(named >= 6, "the matrix must exercise every named kind");
});

test("the mix engine holds no kind names of its own: a new kind is added in the registry only", () => {
  for (const name of ['"short_text"', '"long_text"', '"number"', '"force_text"', '"match_pairs"', '"choice"', '"mc"', '"text"']) {
    assert.equal(MIX_CODE.includes(name), false, `format-mix.ts must not name ${name}`);
  }
});

// ── 2. Wave order moved verbatim ─────────────────────────────────────────────────────────────────
test("getWaveScore/sortByWave now live in wave-order.ts and index.ts imports them (no second copy)", () => {
  assert.equal(/function getWaveScore\(/.test(INDEX_CODE), false);
  assert.equal(/function sortByWave\(/.test(INDEX_CODE), false);
  assert.match(INDEX_CODE, /import \{ sortByWave \} from "\.\/wave-order\.ts";/);
  // The scoring is unchanged: spot values from the original table.
  const meta = { difficulty_type: "factual", cognitive_skill: "recall", challenge_role: "reinforcement", insight_type: "conceptual_bridge" };
  assert.equal(getWaveScore(meta, "recovery", null), 25);
  assert.equal(getWaveScore(meta, "recovery", null, 2, 2), 31);
  assert.equal(getWaveScore(meta, "recovery", null, 3, 2), 28);
  assert.equal(getWaveScore(meta, "challenge", null, 5, 2), 2);
  assert.equal(getWaveScore(null, "deep_challenge", null, 1, 1), 0);
  const qs = [{ id: "a" }, { id: "b" }];
  assert.equal(sortByWave(qs, "challenge", null, null), qs, "challenge without a band keeps the input untouched");
});

// ── 3. Server-owned band (TS specification of advance_student_band) ──────────────────────────────
const at = (i) => new Date(Date.UTC(2026, 9, 1, 8, 0, i)).toISOString();
const verdicts = (pattern, from = 0) => [...pattern].map((c, i) => ({ id: `v-${String(from + i).padStart(4, "0")}`,
  was_correct: c === "1", answered_at: at(from + i) }));
const fold = (seed, ...parts) => parts.reduce((st, p) => foldBand(st, p), initialFoldState(seed));

test("server band: seed = completed placement, else the grade's start band, else 2", () => {
  assert.deepEqual(startBand(7, { band: 3, completed_at: at(0) }), { seed: 3, seedSource: "placement" });
  assert.equal(startBand(7, { band: 3, completed_at: null }).seedSource, "grade", "an open placement is no seed");
  assert.equal(startBand(9, null).seed, GRADE_START_BAND[9]);
  assert.equal(startBand(3, null).seed, 1);
  assert.deepEqual(startBand(null, null), { seed: 2, seedSource: "default" });
  assert.equal(startBand(7, { band: 9, completed_at: at(0) }).seedSource, "grade", "an out-of-range band is no seed");
});

test("server band: app.js's rule — 3 correct up, 2 incorrect down, clamped 1..5", () => {
  assert.equal(fold(1, verdicts("111")).band, 2);
  assert.equal(fold(1, verdicts("11")).band, 1);
  assert.equal(fold(2, verdicts("00")).band, 1);
  assert.equal(fold(2, verdicts("0101")).band, 2, "alternating never moves");
  assert.equal(fold(3, verdicts("1".repeat(30))).band, 5);
  assert.equal(fold(1, verdicts("0".repeat(10))).band, 1);
});

test("REGRESSION: earned progression is kept — 12 correct reach band 5 and 60 alternating answers keep it", () => {
  const climb = verdicts("1".repeat(12));
  assert.equal(fold(1, climb).band, 5);
  const alternating = verdicts("10".repeat(30), 12);
  assert.equal(fold(1, climb, alternating).band, 5, "the old newest-60 replay returned band 1 here");
  assert.equal(fold(1, [...climb, ...alternating]).folded, 72);
});

test("server band: incremental folding equals one full fold, in (answered_at, id) order whatever the input order", () => {
  const all = verdicts("110111001011100011101");
  const once = fold(1, all);
  assert.deepEqual(fold(1, all.slice(0, 5), all.slice(5, 6), all.slice(6, 15), all.slice(15)), once);
  assert.deepEqual(fold(1, [...all].reverse()), once);
  // Same answered_at: the id decides, deterministically.
  const tie = [{ id: "b", was_correct: false, answered_at: at(1) }, { id: "a", was_correct: true, answered_at: at(1) }];
  assert.deepEqual(fold(2, tie), fold(2, [...tie].reverse()));
});

test("server band: a re-answered repeat is a new attempt; open/unanswered rows are skipped", () => {
  const first = [{ id: "i1", was_correct: true, answered_at: at(1) }, { id: "i2", was_correct: true, answered_at: at(2) }];
  const reanswer = [{ id: "i1", was_correct: true, answered_at: at(9) }]; // same instance, new answered_at
  assert.equal(fold(1, first, reanswer).band, 2, "three correct attempts, two of them on the same instance");
  assert.equal(fold(1, [{ id: "x", was_correct: null, answered_at: at(3) }, { id: "y", was_correct: true, answered_at: null }]).folded, 0);
});

test("parseServerBand: one well-formed row, anything else is an error (never a silent default)", () => {
  assert.deepEqual(parseServerBand([{ band: 3, seed: 1, seed_source: "grade", folded: 9, newly_folded: 1 }]),
    { band: 3, seed: 1, seedSource: "grade", folded: 9, newlyFolded: 1 });
  for (const bad of [null, [], [{}, {}], [{ band: 6, seed: 1, seed_source: "grade", folded: 0, newly_folded: 0 }],
    [{ band: 2, seed: 1, seed_source: "client", folded: 0, newly_folded: 0 }],
    [{ band: 2, seed: 1, seed_source: "grade", folded: -1, newly_folded: 0 }]]) {
    assert.throws(() => parseServerBand(bad), /advance_student_band/, JSON.stringify(bad));
  }
});

test("server band: the request body and profile bands are not inputs", () => {
  const src = code(read("../../supabase/functions/get-next-question/server-band.ts"));
  for (const name of ["current_band", "placement_band", "current_difficulty_band", "body"]) {
    assert.equal(src.includes(name), false, name);
  }
});

// ── 4. The mix decision ──────────────────────────────────────────────────────────────────────────
const DOMAINS = ["vikings", "middle_ages", "world_war_2", "cold_war"];
const mc = (i, band = 1, domain = DOMAINS[i % 4]) => ({ id: `mc-${i}`, answer_format: "mc", answer_type: "short",
  content: { question: `q${i}`, options: ["a", "b"] }, difficulty_band: band, learning_objective: domain, metadata: {} });
const txt = (i, band = 1) => ({ id: `tx-${i}`, answer_format: "text", answer_type: "short", content: { question: `t${i}` },
  difficulty_band: band, learning_objective: "world_war_2", metadata: null });
const num = (i, band = 1) => ({ id: `nu-${i}`, answer_format: "number", answer_type: "short", content: { question: `n${i}` },
  difficulty_band: band, learning_objective: "industrialisation", metadata: null });
const long = (i) => ({ id: `lo-${i}`, answer_format: "text", answer_type: "long", content: { question: `l${i}` },
  difficulty_band: 1, learning_objective: "vikings", metadata: null });
const match = (i) => ({ id: `ma-${i}`, answer_format: "match", answer_type: "short", content: { question: `m${i}` },
  difficulty_band: 1, learning_objective: "vikings", metadata: null });
const hist = (...kinds) => kinds.map((kind) => ({ kind, domain: null }));
const plan = (candidates, history, targetBand = 1, wavePhase = "challenge") =>
  planNextQuestions({ candidates, history, targetBand, wavePhase, lastMisconceptionType: null });

test("mix: a new pupil starts with the base kind; Stav til becomes due once it is a whole question behind", () => {
  const cands = [...Array.from({ length: 30 }, (_, i) => mc(i)), txt(0), txt(1)];
  // share = min(0.15, 0.30 / 1 qualified kind) = 0.15 → due when 0.15·(n+1) ≥ 1 → n ≥ 6.
  for (let n = 0; n <= 5; n++) {
    const p = plan(cands, hist(...Array(n).fill("choice")));
    assert.equal(p.decision.kind, "choice", `n=${n}`);
    assert.equal(p.ordered[0].answer_format, "mc");
  }
  const p6 = plan(cands, hist(...Array(6).fill("choice")));
  assert.equal(p6.decision.kind, "short_text");
  assert.equal(p6.decision.reason, "due");
  assert.equal(p6.ordered[0].id, "tx-0");
  assert.equal(p6.ordered.length, cands.length, "every candidate stays available as insert fallback");
});

test("mix: fractional shares — exactly one question behind is due (0.30 / 3 · 10 is 0.999… in floating point)", () => {
  const force = { id: "ft-0", answer_format: "mc", answer_type: "short", content: { question: "f", options: ["a", "b"], force_text: true },
    difficulty_band: 1, learning_objective: "vikings", metadata: {} };
  const cands = [...Array.from({ length: 30 }, (_, i) => mc(i)), txt(0), num(0), force];
  assert.equal(plan(cands, hist(...Array(8).fill("choice"))).decision.kind, "choice");
  assert.equal(plan(cands, hist(...Array(9).fill("choice"))).decision.kind, "short_text");
});

test("mix: at least `gap` other new questions between two non-base questions", () => {
  const cands = [...Array.from({ length: 30 }, (_, i) => mc(i)), txt(0), num(0)];
  const window = hist("choice", "choice", "short_text", ...Array(17).fill("choice")); // non-base 2 questions ago
  assert.equal(plan(cands, window).decision.kind, "choice");
  const later = hist("choice", "choice", "choice", "short_text", ...Array(16).fill("choice"));
  assert.equal(plan(cands, later).decision.kind, "number", "3 since the last non-base: the most-behind kind is due");
  assert.equal(MIX_POLICY.gap, 3);
});

test("mix: per-kind share and the total non-base share cap the window", () => {
  const cands = [...Array.from({ length: 30 }, (_, i) => mc(i)), txt(0), num(0)];
  // 20 in the window: share per kind = min(0.15, 0.30/2) = 0.15 → 0.15·21 = 3.15 → ≤ 3 per kind.
  const full = hist("choice", "choice", "choice", "short_text", "choice", "choice", "choice", "short_text", "choice",
    "choice", "choice", "short_text", "choice", "choice", "choice", "choice", "choice", "choice", "choice", "choice");
  assert.equal(plan(cands, full).decision.kind, "number", "short_text has its 3; number is behind");
  const capped = hist("choice", "choice", "choice", "number", "choice", "choice", "short_text", "number", "short_text",
    "number", "short_text", "choice", "choice", "choice", "choice", "choice", "choice", "choice", "choice", "choice");
  assert.equal(plan(cands, capped).decision.kind, "choice", "6 of 20 non-base = 0.30 → the total cap holds");
});

test("mix: a quota is never met with an off-level question — the kind must have a candidate within ±1 band", () => {
  const cands = [...Array.from({ length: 30 }, (_, i) => mc(i, 4)), txt(0, 1), txt(1, 2)];
  const window = hist(...Array(10).fill("choice"));
  const p = plan(cands, window, 4);
  assert.equal(p.decision.kind, "choice");
  assert.deepEqual(p.decision.qualified, []);
  assert.equal(plan([...cands, txt(2, 3)], window, 4).decision.kind, "short_text", "band 3 is within ±1 of 4");
  assert.equal(plan([...cands, txt(2, 3)], window, 4).ordered[0].id, "tx-2");
});

test("mix: within a kind — band tier first, then wave score, then a fresh domain, then SQL (hash) order", () => {
  const cands = [mc(0, 3, "vikings"), mc(1, 1, "vikings"), mc(2, 1, "cold_war"), mc(3, 2, "vikings")];
  const p = planNextQuestions({ candidates: cands, history: [{ kind: "choice", domain: "vikings" }], targetBand: 1,
    wavePhase: "challenge", lastMisconceptionType: null });
  // in-band (1,2): band 1 scores +6, band 2 +3; among the band-1 pair, cold_war is fresh.
  assert.deepEqual(p.ordered.map((q) => q.id), ["mc-2", "mc-1", "mc-3", "mc-0"]);
});

test("mix: only servable kinds are ever ordered — Match par and unclassifiable rows are dropped", () => {
  const cands = [mc(0), match(0), match(1), { id: "x", answer_format: "drag_drop" }, { id: 5, answer_format: "mc" }, null];
  const p = plan(cands, hist(...Array(20).fill("choice")));
  assert.deepEqual(p.ordered.map((q) => q.id), ["mc-0"]);
  assert.equal(p.decision.dropped, 5);
  const only = plan([match(0)], []);
  assert.deepEqual(only.ordered, []);
  assert.equal(only.decision.kind, null);
  assert.equal(only.decision.reason, "empty");
});

test("mix: long answers are never chosen by quota, only when nothing else is left", () => {
  const cands = [mc(0), long(0)];
  assert.equal(plan(cands, hist(...Array(20).fill("choice"))).decision.kind, "choice");
  assert.deepEqual(plan(cands, hist(...Array(20).fill("choice"))).ordered.map((q) => q.id), ["mc-0", "lo-0"]);
  const rest = plan([long(0)], hist(...Array(20).fill("choice")));
  assert.equal(rest.decision.kind, "long_text");
  assert.equal(rest.decision.reason, "base_exhausted");
});

test("mix: base kind exhausted → the remaining kinds are served regardless of quota (never a false 'no questions')", () => {
  const p = plan([txt(0), num(0, 4)], hist("short_text"));
  assert.equal(p.decision.reason, "base_exhausted");
  assert.equal(p.ordered.length, 2);
  assert.equal(plan([], []).decision.reason, "empty");
  assert.deepEqual(plan(null, null).ordered, []);
});

test("REGRESSION: no MC left — an auto-graded kind is chosen before a long teacher-graded answer", () => {
  const p = plan([txt(0), long(0)], hist("short_text"));
  assert.equal(p.decision.reason, "base_exhausted");
  assert.equal(p.decision.kind, "short_text", "short_text is behind by less than long_text's 0 — it must still win");
  assert.deepEqual(p.ordered.map((q) => q.id), ["tx-0", "lo-0"], "the long answer stays last, also as insert fallback");
  const withNumber = plan([long(0), num(0), txt(0)], hist("short_text"));
  assert.equal(withNumber.decision.kind, "number");
  assert.equal(withNumber.ordered.at(-1).id, "lo-0");
  assert.equal(plan([long(0)], hist("short_text")).decision.kind, "long_text", "only when nothing auto-graded is left");
});

test("mix: only-MC banks behave as before apart from the band tier and domain variety", () => {
  const cands = Array.from({ length: 40 }, (_, i) => mc(i, 1 + (i % 4)));
  const p = plan(cands, hist(...Array(20).fill("choice")), 2);
  assert.equal(p.decision.kind, "choice");
  assert.ok(p.ordered.slice(0, 30).every((q) => Math.abs(q.difficulty_band - 2) <= 1));
});

test("mix: deterministic — the same server state gives the same order", () => {
  const cands = [...Array.from({ length: 30 }, (_, i) => mc(i, 1 + (i % 5))), txt(0), num(0, 2)];
  const h = toMixHistory([{ questions: { answer_format: "mc", answer_type: "short", learning_objective: "vikings" } }]);
  assert.deepEqual(plan(cands, h, 2, "recovery"), plan(cands, h, 2, "recovery"));
});

test("toMixHistory: classifies the embedded question (object or array embed), tolerates missing parts", () => {
  assert.deepEqual(toMixHistory([
    { questions: { answer_format: "text", answer_type: "short", learning_objective: "world_war_2" } },
    { questions: [{ answer_format: "mc", answer_type: null, learning_objective: "vikings", force_text: true }] },
    { questions: null }, null, "x",
  ]), [
    { kind: "short_text", domain: "world_war_2" },
    { kind: "force_text", domain: "vikings" },
    { kind: null, domain: null }, { kind: null, domain: null }, { kind: null, domain: null },
  ]);
  assert.deepEqual(toMixHistory(undefined), []);
});

test("resolveMixEngine: only the exact values switch away from v1", () => {
  assert.equal(resolveMixEngine(undefined), "v1");
  assert.equal(resolveMixEngine(""), "v1");
  assert.equal(resolveMixEngine("V2"), "v1");
  assert.equal(resolveMixEngine("true"), "v1");
  assert.equal(resolveMixEngine("shadow"), "shadow");
  assert.equal(resolveMixEngine("v2"), "v2");
});

// ── 5. The server reads (recording stub client) ──────────────────────────────────────────────────
function stubClient(data = {}) {
  const calls = [];
  const result = (key) => Promise.resolve(data[key] ?? { data: key === BAND_RPC ? BAND_ROW : [], error: null });
  return {
    calls,
    rpc(fn, args) { calls.push({ rpc: fn, args }); return result(fn); },
    from(table) {
      const call = { from: table };
      calls.push(call);
      const chain = {
        select(cols) { call.select = cols; return chain; },
        eq(col, val) { call.eq = [col, val]; return chain; },
        order(col, opts) { call.order = [col, opts]; return chain; },
        limit(n) { call.limit = n; return result(table); },
      };
      return chain;
    },
  };
}

const PUPIL = "22222222-2222-4222-8222-222222222222";
const INPUT = { studentId: PUPIL, grade: 7, domains: ["world_war_2"], wavePhase: "challenge", lastMisconceptionType: null };
const BAND_ROW = [{ band: 2, seed: 1, seed_source: "grade", folded: 3, newly_folded: 0 }];

test("mix-flow: exactly three backend calls, all scoped to the verified student", async () => {
  const c = stubClient();
  await loadFormatMixPlan(c, INPUT);
  assert.deepEqual(c.calls, [
    { rpc: CANDIDATES_RPC, args: { p_student_id: PUPIL, p_grade: 7, p_domains: ["world_war_2"], p_per_group: CANDIDATES_PER_GROUP } },
    { from: "question_instances", select: HISTORY_SELECT, eq: ["student_id", PUPIL], order: ["created_at", { ascending: false }], limit: HISTORY_LIMIT },
    { rpc: BAND_RPC, args: { p_student_id: PUPIL, p_grade: 7 } },
  ]);
  assert.equal(CANDIDATES_RPC, "get_question_candidates_for_student");
  assert.equal(BAND_RPC, "advance_student_band");
  assert.equal(HISTORY_LIMIT, MIX_POLICY.windowSize);
});

test("mix-flow: the history read never selects content, a key or an answer — only content->force_text", () => {
  assert.equal(/correct_answer|user_answer|was_correct|\bcontent\b(?!->force_text)/.test(HISTORY_SELECT), false, HISTORY_SELECT);
  assert.match(HISTORY_SELECT, /force_text:content->force_text/);
});

test("mix-flow: band from the server RPC, order from the mix; the request's band is not an input", async () => {
  const c = stubClient({
    [CANDIDATES_RPC]: { data: [mc(0, 1), mc(1, 2), mc(2, 3)], error: null },
    [BAND_RPC]: { data: [{ band: 3, seed: 1, seed_source: "placement", folded: 40, newly_folded: 1 }], error: null },
  });
  const { plan: p, band } = await loadFormatMixPlan(c, INPUT);
  assert.equal(band.band, 3);
  assert.equal(band.seedSource, "placement");
  assert.equal(p.decision.targetBand, 3);
  assert.equal(p.ordered[0].id, "mc-2");
  assert.equal(/current_difficulty_band|currentDifficultyBand|current_band/.test(FLOW_CODE), false);
});

test("mix-flow: every error is thrown (loud 500 in index.ts) — a malformed band too, and a missing student id", async () => {
  for (const key of [CANDIDATES_RPC, "question_instances", BAND_RPC]) {
    const boom = { message: `boom-${key}` };
    await assert.rejects(loadFormatMixPlan(stubClient({ [key]: { data: null, error: boom } }), INPUT), (e) => e === boom);
  }
  await assert.rejects(loadFormatMixPlan(stubClient({ [BAND_RPC]: { data: [], error: null } }), INPUT), /advance_student_band/);
  await assert.rejects(loadFormatMixPlan(stubClient(), { ...INPUT, studentId: "" }), /missing student id/);
});

test("servableWireFormat: the registry's wire format — null, never \"mc\", for anything not servable", () => {
  assert.equal(servableWireFormat({ answer_format: "mc" }), "mc");
  assert.equal(servableWireFormat({ answer_format: "text", answer_type: "short" }), "text");
  assert.equal(servableWireFormat({ answer_format: "text", answer_type: "long" }), "text");
  assert.equal(servableWireFormat({ answer_format: "number" }), "number");
  assert.equal(servableWireFormat({ answer_format: "mc", content: { force_text: true } }), "mc");
  for (const f of ["match", "matching", "drag_drop", "MC", "", null]) {
    assert.equal(servableWireFormat({ answer_format: f }), null, String(f));
    assert.equal(mapAnswerFormat(f), "mc", `v1's mapAnswerFormat still says "mc" for ${f} — the debt v2 removes`);
  }
});

// ── 6. Wiring in index.ts ────────────────────────────────────────────────────────────────────────
test("index.ts: the engine is a server secret, v1 by default, and v1 is today's selection unchanged", () => {
  assert.match(INDEX_CODE, /const mixEngine = resolveMixEngine\(Deno\.env\.get\("QUESTION_MIX_ENGINE"\)\);/);
  assert.equal(/body\??\.\s*(mix|engine|question_mix)/i.test(INDEX_CODE), false, "the request cannot pick the engine");
  const v1 = INDEX_CODE.slice(INDEX_CODE.indexOf("} else {", INDEX_CODE.indexOf('if (mixEngine === "v2")')));
  assert.match(v1, /await admin\(\)\.rpc\(\s*"get_unserved_questions_for_student"/);
  assert.match(v1, /sortedQuestions = sortByWave\(\s*questions \|\| \[\],\s*wavePhase,\s*lastMisconceptionType,\s*currentDifficultyBand\s*\);/);
  assert.match(INDEX_CODE, /mixEngine === "v2" \? servableWireFormat\(row\) : mapAnswerFormat\(row\.answer_format as string \| null\)/,
    "v1 keeps mapAnswerFormat's behaviour");
});

test("index.ts: v2 judges repeats on the servable pool; v1 keeps the old repeat call", () => {
  assert.match(INDEX_CODE, /mixEngine === "v2"\s*\? await admin\(\)\.rpc\(\s*"request_repeat_question_servable_for_student",\s*\{ p_student_id: student_id, p_grade: selectedGrade, p_domains: subjectDomains \}\s*\)\s*: await admin\(\)\.rpc\(\s*"request_repeat_question_for_student",\s*\{ p_student_id: student_id, p_grade: selectedGrade, p_domains: subjectDomains \}/);
});

test("index.ts: due, new and repeat paths all take the format from wireFormat and skip an unservable row", () => {
  assert.equal((INDEX_CODE.match(/mapAnswerFormat\(/g) ?? []).length, 2, "the definition and wireFormat's v1 branch only");
  assert.equal((INDEX_CODE.match(/= wireFormat\((q|rq)\);\s*if \((format|resolved) === null\) throw new Error\(`Unservable format: /g) ?? []).length, 3);
  assert.ok(INDEX_CODE.indexOf("const wireFormat =") < INDEX_CODE.indexOf("for (const instance of sortedDue)"));
});

test("index.ts: v2 orders by the mix plan and never by the request's band", () => {
  const start = INDEX_CODE.indexOf('if (mixEngine === "v2") {');
  const v2 = INDEX_CODE.slice(start, INDEX_CODE.indexOf("} else {", start));
  assert.match(v2, /await loadFormatMixPlan\(admin\(\) as unknown as MixReadClient, \{\s*studentId: student_id,\s*grade: selectedGrade,\s*domains: subjectDomains,/);
  assert.match(v2, /sortedQuestions = plan\.ordered;/);
  assert.equal(/sortByWave|currentDifficultyBand\s*[,)]/.test(v2.replace(/client_band: currentDifficultyBand/, "")), false);
});

test("index.ts: the FORMAT_MIX logs carry no pupil identity, no answer and no key", () => {
  const logs = [...INDEX_CODE.matchAll(/console\.log\("FORMAT_MIX:", JSON\.stringify\(\{([\s\S]*?)\}\)\);/g)].map((m) => m[1]);
  assert.equal(logs.length, 2, "the v2 and the shadow log");
  // Each log names the pupil only by the one-way pseudonym, computed right before it from the verified id.
  assert.equal((INDEX_CODE.match(/const pupil = await pupilLogHash\(student_id\);\s*console\.log\("FORMAT_MIX:"/g) ?? []).length, 2);
  for (const body of logs) {
    assert.match(body, /engine: mixEngine, pupil, \.\.\.plan\.decision,/);
    for (const forbidden of ["student_id", "user", "correct", "normalized", "content", "answer", "email", "name"]) {
      assert.equal(new RegExp(String.raw`\b${forbidden}\b`, "i").test(body), false, `FORMAT_MIX must not log ${forbidden}`);
    }
  }
  // The decision object itself: kinds, counts, the band — nothing per question but ids in shadow.
  assert.deepEqual(Object.keys(planNextQuestions({ candidates: [], history: [], targetBand: 1, wavePhase: "challenge",
    lastMisconceptionType: null }).decision).sort(), ["dropped", "gapSinceNonBase", "kind", "qualified", "reason", "served", "targetBand", "window"]);
});

test("index.ts: the engine is read inside the request handler — unsetting the secret needs no deploy", () => {
  assert.ok(INDEX_CODE.indexOf("serve(async (req) => {") < INDEX_CODE.indexOf("const mixEngine = resolveMixEngine("));
});

test("index.ts: shadow serves v1; a shadow failure is logged and never changes the response", () => {
  const start = INDEX_CODE.indexOf('if (mixEngine === "shadow") {');
  assert.ok(start > INDEX_CODE.indexOf("sortedQuestions = sortByWave("), "shadow runs after v1 has chosen");
  const shadow = INDEX_CODE.slice(start, INDEX_CODE.indexOf("for (const q of sortedQuestions)"));
  assert.match(shadow, /try \{[\s\S]*await loadFormatMixPlan\(admin\(\) as unknown as MixReadClient[\s\S]*\} catch \(e\) \{\s*console\.error\("FORMAT_MIX_SHADOW_FAILED:"/);
  assert.equal(/sortedQuestions\s*=/.test(shadow), false, "shadow never reassigns what is served");
});

test("index.ts: both engines feed the same insert loop, public DTO and answer-key path", () => {
  const loop = INDEX_CODE.slice(INDEX_CODE.indexOf("for (const q of sortedQuestions)"));
  assert.match(loop, /normalized = normalizeContent\(q\.content, format\);/);
  assert.match(loop, /pub = toPublicQuestion\(q\.content, format, q\.metadata\);/);
  assert.match(loop, /correctAnswer: normalized\.correct,/);
  assert.match(INDEX_CODE, /content: inserted\.pub\.content,/);
  // The due (spaced repetition / interrupted request) step still runs before any new question.
  assert.ok(INDEX_CODE.indexOf("for (const instance of sortedDue)") < INDEX_CODE.indexOf('if (mixEngine === "v2") {'));
});
