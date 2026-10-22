// Deterministic selection simulation for the format mix (opgaveformer). No database, no network.
//
// Usage:  node tools/question-mix-sim/sim.mjs [--pupils 200] [--length 100] [--json out.json] [--sweep]
//
// WHAT THIS IS — AND IS NOT. A simulation of WHICH questions synthetic pupils would be served. It
// measures exposure (who meets which kind), level fit (to the engine's band AND to the pupil's
// synthetic ability), variety and spacing. It does NOT measure learning: the ability model is fixed per
// pupil and never improves, so no number here is evidence of a learning effect. That needs real
// classroom data (shadow logs first, then outcomes) — see docs/ARCHITECTURE.md.
//
// BANK   bank-shape-2026-10-19.json — the ACTIVE question bank read read-only on 2026-10-19 in physical
//        (ctid) order: grade, band, topic, answer_format, answer_type and a metadata profile per row.
//        No question text, no answer keys, no pupil data. Still the live active bank on 2026-10-20
//        (2,099 MC + 2 Stav til; the Danish content of #340 is not applied). Synthetic additions are
//        APPENDED physically, as new content is.
// SERVER the engines import the REAL modules the Edge Function runs:
//          get-next-question/format-mix.ts   planNextQuestions, MIX_POLICY
//          get-next-question/server-band.ts  foldBand / startBand — the TS specification of the SQL
//                                            advance_student_band (pinned equal in PGlite)
//          get-next-question/wave-order.ts   sortByWave (unchanged scoring)
//          _shared/interaction-kinds.ts      classifyQuestion / isServableKind (= SQL question_is_servable)
//        The SQL functions are emulated here; their equivalence to the real SQL is proven in
//        tests/unit/question-format-mix-migration-run.test.mjs.
// REPEATS are modelled as the server runs them. A/B/C (v1): request_repeat_question_for_student — only
//        when NO unserved question of any format is left; until then v1 serves whatever its window holds,
//        including formats the client cannot show (mapAnswerFormat says "mc"). D (v2):
//        request_repeat_question_servable_for_student — as soon as no SERVABLE unserved question is left.
//        Both reopen an answered auto-graded instance, incorrect first, oldest first.
// NOT MODELLED (proven elsewhere): an interrupted or repeated request is answered by index.ts's due step
//        with the SAME open instance before any selection runs (idx_one_open_question).
// PUPIL  wave phase + client band exactly as app.js (updateWavePhase / adjustDifficultyBand); answers
//        correctly with a logistic model of a fixed ability; a fixed per-pupil PRNG, so every run is identical.
//
// ENGINES compared
//   A   today: get_unserved_questions_for_student (LIMIT 50, physical order) + sortByWave, client band
//   B   md5(student||question) ORDER BY … LIMIT 50 + sortByWave, client band
//   C   the 2026-10-19 proposal "C v2": 50 per answer_format by md5 + kind pick, client band, counts
//       kept in the session
//   D   the implementation: get_question_candidates_for_student (servable only, 20 per
//       format/type/force_text/band, md5) + planNextQuestions with the SERVER band (fold of every
//       attempt) and the SERVER history window; servable repeats
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { planNextQuestions, MIX_POLICY } from "../../supabase/functions/get-next-question/format-mix.ts";
import { foldBand, initialFoldState, startBand } from "../../supabase/functions/get-next-question/server-band.ts";
import { sortByWave } from "../../supabase/functions/get-next-question/wave-order.ts";
import { classifyQuestion, isServableKind, BASE_KIND, INTERACTION_KINDS } from "../../supabase/functions/_shared/interaction-kinds.ts";

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const PUPILS = Number(arg("pupils", 200));
const LENGTH = Number(arg("length", 100));

// ── Bank ──────────────────────────────────────────────────────────────────────────────────────────
const shape = JSON.parse(readFileSync(new URL("./bank-shape-2026-10-19.json", import.meta.url), "utf8"));
const PROFILES = shape.profiles.map((p) => {
  const [dt, cr, it, cs, mis] = p.split("/").map((x) => (x === "-" ? null : x));
  return { difficulty_type: dt, challenge_role: cr, insight_type: it, cognitive_skill: cs, misconception_type: mis };
});
const HISTORY_DOMAINS = shape.domains.filter((d) => d !== "english");
const md5 = (s) => createHash("md5").update(s).digest("hex");
const uuidFor = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function realBank() {
  return shape.rows.split(" ").map((code, phys) => {
    const [g, b, d, f, t, m] = code.split(".");
    return row(phys, { grade: +g, band: +b, domain: shape.domains[+d], format: f, type: t, metadata: PROFILES[+m] });
  });
}
function row(phys, { grade, band, domain, format, type = "short", metadata, forceText = false }) {
  const q = { id: uuidFor(phys), phys, target_grade: grade, difficulty_band: band, learning_objective: domain,
    answer_format: format, answer_type: type, metadata, content: forceText ? { force_text: true } : {} };
  q.kind = classifyQuestion(q);
  q.servable = isServableKind(q.kind);
  q.autoGraded = q.servable && !INTERACTION_KINDS[q.kind].teacherGraded;
  return q;
}
// Future content, appended physically: realistic small amounts per kind, spread over grades 3–9,
// bands 1–5 and the history topics.
function withFuture(bank, spec, startPhys = bank.length) {
  const out = [...bank];
  let phys = startPhys;
  for (const [format, type, count, opts = {}] of spec) {
    for (let i = 0; i < count; i++) {
      out.push(row(phys++, { grade: opts.grade ?? 3 + (i % 7), band: opts.band ?? 1 + (i % 5),
        domain: opts.domain ?? HISTORY_DOMAINS[i % HISTORY_DOMAINS.length], format, type,
        metadata: PROFILES[(i * 37) % PROFILES.length] }));
    }
  }
  return out;
}
const mcOnly = (bank) => bank.filter((q) => q.answer_format === "mc");

// ── Candidate windows (SQL emulation) ─────────────────────────────────────────────────────────────
const groupKey = (q) => `${q.answer_format}/${q.answer_type ?? "short"}/${q.content?.force_text === true}/${q.difficulty_band}`;
const WINDOWS = {
  physical50: (pool) => pool.slice(0, 50),
  md5_50: (pool, rank) => [...pool].sort((a, b) => rank(a) < rank(b) ? -1 : 1).slice(0, 50),
  perFormat50: (pool, rank) => {
    const by = new Map();
    for (const q of [...pool].sort((a, b) => rank(a) < rank(b) ? -1 : 1)) {
      const k = q.answer_format; if (!by.has(k)) by.set(k, []);
      if (by.get(k).length < 50) by.get(k).push(q);
    }
    return [...by.values()].flat();
  },
  // get_question_candidates_for_student: servable rows only (question_is_servable), 20 per stratum.
  stratified20: (pool, rank) => {
    const counts = new Map(); const out = [];
    for (const q of [...pool].filter((x) => x.servable).sort((a, b) => rank(a) < rank(b) ? -1 : 1)) {
      const k = groupKey(q); const c = counts.get(k) ?? 0;
      if (c < 20) { counts.set(k, c + 1); out.push(q); }
    }
    return out;
  },
};

// C v2 kind pick (the 2026-10-19 proposal, session counts, client band).
function pickCv2(cands, st) {
  const special = [...new Set(cands.map((q) => q.answer_format))].filter((f) => f !== "mc");
  const share = special.length ? Math.min(0.15, 0.30 / special.length) : 0;
  let best = null, bestDeficit = 0;
  if (st.n - st.lastSpecialAt >= 3) {
    for (const f of special) {
      if (!cands.some((q) => q.answer_format === f && Math.abs(q.difficulty_band - st.band) <= 1)) continue;
      const deficit = share * (st.n + 1) - (st.countFmt[f] ?? 0);
      if (deficit >= 1 && deficit > bestDeficit) { best = f; bestDeficit = deficit; }
    }
  }
  const fmt = best ?? (cands.some((q) => q.answer_format === "mc") ? "mc" : null);
  const pool = fmt ? cands.filter((q) => q.answer_format === fmt) : cands;
  return sortByWave(pool, st.phase, null, st.band);
}

// The repeat RPCs: reopen an answered, auto-graded instance (never text, never long, never
// teacher-graded); incorrect first, oldest answer first. `servableOnly` = the v2 twin.
function pickRepeat(instances, servableOnly) {
  const eligible = instances.filter((i) => i.answered && i.was_correct !== null
    && i.q.answer_format !== "text" && i.q.answer_type !== "long" && (!servableOnly || i.q.servable));
  eligible.sort((a, b) => (a.was_correct === b.was_correct ? 0 : a.was_correct ? 1 : -1) || a.answered_at - b.answered_at);
  return eligible[0] ?? null;
}

// ── One pupil ─────────────────────────────────────────────────────────────────────────────────────
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const GRADE_START_BAND = { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3 };

function runPupil(scn, engine, idx, policy = MIX_POLICY) {
  const pupilId = `11111111-0000-4000-8000-${String(scn.seed * 10000 + idx).padStart(12, "0")}`;
  const r = rng(scn.seed * 7919 + idx * 104729 + 17);
  const [aLo, aHi] = scn.ability ?? [1.0, 5.0];
  const ability = aLo + r() * (aHi - aLo);
  const rankCache = new Map();
  const rank = (q) => { let v = rankCache.get(q.id); if (v === undefined) rankCache.set(q.id, v = md5(pupilId + q.id)); return v; };

  // Server state: question_instances (one per question, latest verdict only) and — for D — the band
  // fold over EVERY attempt (what advance_student_band folds, one attempt at a time).
  const served = new Set(); const instances = []; const attempts = [];
  let clock = 0;
  const prior = scn.prior ?? 0;
  if (prior > 0) {
    const pre = [...scn.pool].filter((q) => q.kind === BASE_KIND).sort((a, b) => rank(a) < rank(b) ? 1 : -1).slice(0, prior);
    for (const q of pre) {
      const correct = r() < 0.6;
      served.add(q.id);
      instances.push({ q, answered: true, was_correct: correct, answered_at: ++clock, created: clock });
      attempts.push({ id: q.id, was_correct: correct, answered_at: new Date(Date.UTC(2026, 8, 1) + clock * 6e4).toISOString() });
    }
  }
  const placement = scn.placement ? { band: Math.max(1, Math.min(4, Math.round(ability - 0.5))), completed_at: "x" } : null;
  const st = { phase: "challenge", band: placement?.band ?? GRADE_START_BAND[scn.grade] ?? 2, cc: 0, ci: 0, dc: 0, di: 0,
    n: 0, countFmt: {}, lastSpecialAt: -Infinity };
  const seq = []; let planMs = 0; let stabilityBreaks = 0;

  for (let i = 0; i < LENGTH; i++) {
    const pool = scn.pool.filter((q) => !served.has(q.id));
    // Pool state BEFORE choosing — measured independently of any decision.reason.
    const mcLeft = pool.some((q) => q.kind === BASE_KIND);
    const autoLeft = pool.some((q) => q.autoGraded);
    let q = null, targetBand, repeat = null;
    const t = performance.now();
    if (engine === "D") {
      const { seed } = startBand(scn.grade, placement);
      targetBand = foldBand(initialFoldState(seed), attempts).band;
      const cands = WINDOWS.stratified20(pool, rank);
      const history = [...instances].sort((a, b) => b.created - a.created).slice(0, policy.windowSize)
        .map((h) => ({ kind: h.q.kind, domain: h.q.learning_objective }));
      const input = { candidates: cands, history, targetBand, wavePhase: st.phase, lastMisconceptionType: null, policy };
      const plan = planNextQuestions(input);
      if (i % 25 === 0 && planNextQuestions(input).ordered[0]?.id !== plan.ordered[0]?.id) stabilityBreaks++;
      q = plan.ordered[0] ?? null;
      if (!q && !pool.some((x) => x.servable)) repeat = pickRepeat(instances, true);
    } else {
      targetBand = st.band;
      if (pool.length > 0) {
        const cands = engine === "A" ? WINDOWS.physical50(pool) : engine === "B" ? WINDOWS.md5_50(pool, rank) : WINDOWS.perFormat50(pool, rank);
        q = (engine === "C" ? pickCv2(cands, st) : sortByWave(cands, st.phase, null, st.band))[0] ?? null;
      } else {
        repeat = pickRepeat(instances, false);
      }
    }
    planMs += performance.now() - t;
    if (!q && !repeat) break; // "no questions"
    const item = q ?? repeat.q;

    const correct = r() < 1 / (1 + Math.exp(1.3 * (item.difficulty_band - ability)));
    const verdict = item.autoGraded ? correct : null; // a long answer waits for the teacher
    clock++;
    if (q) {
      served.add(q.id);
      instances.push({ q, answered: true, was_correct: verdict, answered_at: clock, created: clock });
    } else {
      repeat.was_correct = verdict; repeat.answered_at = clock; // the reopened instance, answered again
    }
    if (verdict !== null) attempts.push({ id: item.id, was_correct: verdict, answered_at: new Date(Date.UTC(2026, 8, 1) + clock * 6e4).toISOString() });
    seq.push({ id: item.id, kind: item.kind, servable: item.servable, band: item.difficulty_band, domain: item.learning_objective,
      targetBand, ability, repeat: !q, mcLeft, autoLeft });

    st.countFmt[item.answer_format] = (st.countFmt[item.answer_format] ?? 0) + 1;
    if (item.answer_format !== "mc") st.lastSpecialAt = st.n;
    st.n++;
    if (correct) { st.ci = 0; st.cc++;
      if (st.phase === "recovery" && st.cc >= 3) { st.phase = "challenge"; st.cc = 0; }
      else if (st.phase === "reinforcement" && st.cc >= 2) { st.phase = "challenge"; st.cc = 0; }
      else if (st.phase === "challenge" && st.cc >= 4) st.phase = "deep_challenge";
    } else { st.cc = 0; st.ci++;
      if (st.ci >= 2) st.phase = "recovery";
      else if (st.phase === "deep_challenge" || st.phase === "challenge") st.phase = "reinforcement";
    }
    if (correct) { st.di = 0; st.dc++; if (st.dc >= 3 && st.band < 5) { st.band++; st.dc = 0; } }
    else { st.dc = 0; st.di++; if (st.di >= 2 && st.band > 1) { st.band--; st.di = 0; } }
  }
  return { seq, planMs, stabilityBreaks, ability };
}

// ── Metrics ───────────────────────────────────────────────────────────────────────────────────────
const pct = (x) => Math.round(100 * x);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function evaluate(scn, engine, policy = MIX_POLICY) {
  const runs = Array.from({ length: PUPILS }, (_, i) => runPupil(scn, engine, i, policy));
  const kinds = [...new Set(scn.pool.map((q) => q.kind ?? "unknown"))].filter((k) => k !== BASE_KIND).sort();
  const out = { served: Math.round(avg(runs.map((r) => r.seq.length))) };
  for (const k of kinds) {
    const available = scn.pool.filter((q) => (q.kind ?? "unknown") === k).length;
    const is = (x) => (x.kind ?? "unknown") === k && !x.repeat;
    const reach = (n) => pct(runs.filter((r) => r.seq.slice(0, n).some(is)).length / PUPILS);
    const share = (n) => (100 * avg(runs.map((r) => r.seq.slice(0, n).filter(is).length / Math.max(1, Math.min(n, r.seq.length))))).toFixed(1);
    const firsts = runs.map((r) => r.seq.findIndex(is)).filter((i) => i >= 0).sort((a, b) => a - b);
    out[k] = { available, firstMedian: firsts.length ? firsts[Math.floor(firsts.length / 2)] + 1 : null,
      reach20: reach(20), reach40: reach(40), reach100: reach(100), share20: share(20), share40: share(40), share100: share(100) };
  }
  const all = runs.flatMap((r) => r.seq);
  const n = Math.max(1, all.length);
  out.nonBaseShare100 = (100 * all.filter((x) => x.kind !== BASE_KIND).length / n).toFixed(1);
  out.unrenderableServed = all.filter((x) => !x.servable).length;
  out.repeatsServed = all.filter((x) => x.repeat).length;
  // Level fit: to the band the ENGINE targeted, and to the pupil's synthetic ability.
  out.bandExact = pct(all.filter((x) => x.band === x.targetBand).length / n);
  out.bandWithin1 = pct(all.filter((x) => Math.abs(x.band - x.targetBand) <= 1).length / n);
  out.distToEngineBand = avg(all.map((x) => Math.abs(x.band - x.targetBand))).toFixed(2);
  out.distToAbility = avg(all.map((x) => Math.abs(x.band - x.ability))).toFixed(2);
  out.abilityWithin1 = pct(all.filter((x) => Math.abs(x.band - x.ability) <= 1).length / n);
  const first20 = runs.map((r) => r.seq.slice(0, 20));
  out.domainsFirst20 = avg(first20.map((s) => new Set(s.map((x) => x.domain)).size)).toFixed(1);
  out.topDomainShare20 = pct(avg(first20.map((s) => { const c = {}; s.forEach((x) => (c[x.domain] = (c[x.domain] ?? 0) + 1));
    return s.length ? Math.max(...Object.values(c)) / s.length : 0; })));
  // Spacing, judged on the POOL STATE (mcLeft/autoLeft recorded before each choice), never on decision.reason.
  let b2b = 0, gapAll = 0, gapWithMcLeft = 0, longBeforeAuto = 0, dupes = 0;
  for (const r of runs) {
    const ids = new Set();
    r.seq.forEach((x, i) => {
      if (!x.repeat) { if (ids.has(x.id)) dupes++; ids.add(x.id); }
      if (x.kind === "long_text" && x.autoLeft) longBeforeAuto++;
      if (x.kind !== BASE_KIND) {
        for (let j = Math.max(0, i - MIX_POLICY.gap); j < i; j++) if (r.seq[j].kind !== BASE_KIND) {
          gapAll++; if (x.mcLeft) gapWithMcLeft++; break; }
        if (i > 0 && r.seq[i - 1].kind !== BASE_KIND) b2b++;
      }
    });
  }
  Object.assign(out, { nonBaseBackToBack: b2b, gapViolations: gapAll, gapViolationsWithMcLeft: gapWithMcLeft,
    longServedWhileAutoGradedLeft: longBeforeAuto, duplicateQuestions: dupes });
  let j = 0, m = 0;
  for (let a = 0; a < Math.min(40, PUPILS); a++) for (let b = a + 1; b < Math.min(40, PUPILS); b++) {
    const A = new Set(first20[a].map((x) => x.id)), B = new Set(first20[b].map((x) => x.id));
    const inter = [...A].filter((x) => B.has(x)).length; j += inter / Math.max(1, A.size + B.size - inter); m++;
  }
  out.overlapBetweenPupils20 = pct(j / Math.max(1, m));
  out.planMsPerRequest = (avg(runs.map((r) => r.planMs)) / Math.max(1, avg(runs.map((r) => r.seq.length)))).toFixed(3);
  out.stabilityBreaks = runs.reduce((a, r) => a + r.stabilityBreaks, 0);
  return out;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────────────────────────
const REAL = realBank();
const FUTURE = withFuture(REAL, [["text", "short", 40], ["number", "short", 30], ["match", "short", 30], ["text", "long", 5]]);
const scope = (bank, grade, domains) => bank.filter((q) => q.target_grade <= grade && domains.includes(q.learning_objective));

const SCENARIOS = [];
let seed = 1;
// The 16 scenarios of the first run (unchanged definitions, so the numbers stay comparable).
for (const grade of [3, 5, 7, 8, 9]) SCENARIOS.push({ name: `Rigtig bank · historie · ${grade}. kl.`, grade, pool: scope(REAL, grade, HISTORY_DOMAINS), seed: seed++ });
SCENARIOS.push({ name: "Rigtig bank · 7. kl. · ét emne (world_war_2)", grade: 7, pool: scope(REAL, 7, ["world_war_2"]), seed: seed++ });
SCENARIOS.push({ name: "Rigtig bank · 8. kl. · tre emner", grade: 8, pool: scope(REAL, 8, ["world_war_2", "cold_war", "vikings"]), seed: seed++ });
SCENARIOS.push({ name: "Rigtig bank · 7. kl. · svage elever", grade: 7, pool: scope(REAL, 7, HISTORY_DOMAINS), ability: [0.5, 2.0], seed: seed++ });
SCENARIOS.push({ name: "Rigtig bank · 7. kl. · stærke elever + placering", grade: 7, pool: scope(REAL, 7, HISTORY_DOMAINS), ability: [3.5, 5.5], placement: true, seed: seed++ });
SCENARIOS.push({ name: "Rigtig bank · 7. kl. · 300 tidligere svar", grade: 7, pool: scope(REAL, 7, HISTORY_DOMAINS), prior: 300, seed: seed++ });
SCENARIOS.push({ name: "Kun MC · 7. kl.", grade: 7, pool: scope(mcOnly(REAL), 7, HISTORY_DOMAINS), seed: seed++ });
SCENARIOS.push({ name: "Fremtidig bank · 9. kl. (+40 stav, 30 tal, 30 match par, 5 lange)", grade: 9, pool: scope(FUTURE, 9, HISTORY_DOMAINS), seed: seed++ });
SCENARIOS.push({ name: "Fremtidig bank · 5. kl. · ét emne", grade: 5, pool: scope(FUTURE, 5, ["vikings"]), seed: seed++ });
SCENARIOS.push({ name: "Næsten udtømt pulje · 7. kl. · world_war_2 (40 tidligere svar)", grade: 7, pool: scope(REAL, 7, ["world_war_2"]), prior: 40, seed: seed++ });
SCENARIOS.push({ name: "Tom pulje", grade: 7, pool: [], seed: seed++ });
SCENARIOS.push({ name: "Kun Match par tilbage (kan ikke vises)", grade: 7, pool: FUTURE.filter((q) => q.kind === "match_pairs"), seed: seed++ });
// Regression cases of the 2026-10-20 review.
const REG_LONG = withFuture([], [["text", "short", 3, { grade: 7, band: 1, domain: "world_war_2" }], ["text", "long", 3, { grade: 7, band: 1, domain: "world_war_2" }]], 50000);
SCENARIOS.push({ name: "REGRESSION · ingen MC · 3 Stav til + 3 lange svar", grade: 7, pool: REG_LONG, seed: seed++ });
const REG_REPEAT = [...scope(REAL, 7, ["democracy_power"]).filter((q) => q.kind === BASE_KIND).slice(0, 20),
  ...withFuture([], [["match", "short", 30, { grade: 7, domain: "democracy_power" }]], 60000)];
SCENARIOS.push({ name: "REGRESSION · 20 besvarede MC + kun Match par nye", grade: 7, pool: REG_REPEAT, prior: 20, seed: seed++ });
SCENARIOS.push({ name: "REGRESSION · stærke elever · 300 tidligere svar (niveau bevares)", grade: 7, pool: scope(REAL, 7, HISTORY_DOMAINS),
  ability: [3.5, 5.5], prior: 300, seed: seed++ });

if (process.argv.includes("--sweep")) {
  // Policy hypotheses, engine D only, on the scenarios where they matter.
  const VARIANTS = {
    "valgt (30 % / gap 3 / ±1 / vindue 20)": MIX_POLICY,
    "gap 2": { ...MIX_POLICY, gap: 2 },
    "gap 5": { ...MIX_POLICY, gap: 5 },
    "±2 bånd": { ...MIX_POLICY, bandTolerance: 2 },
    "±0 bånd": { ...MIX_POLICY, bandTolerance: 0 },
    "total 20 %": { ...MIX_POLICY, totalShare: 0.20 },
    "total 40 %": { ...MIX_POLICY, totalShare: 0.40 },
    "vindue 10": { ...MIX_POLICY, windowSize: 10 },
    "vindue 40": { ...MIX_POLICY, windowSize: 40 },
  };
  const pick = (name) => SCENARIOS.find((s) => s.name.startsWith(name));
  const sweep = {};
  for (const scn of [pick("Rigtig bank · historie · 7."), pick("Rigtig bank · historie · 9."), pick("Fremtidig bank · 9.")]) {
    sweep[scn.name] = {};
    for (const [label, policy] of Object.entries(VARIANTS)) { sweep[scn.name][label] = evaluate(scn, "D", policy); process.stderr.write(`✔ ${scn.name} · ${label}\n`); }
  }
  const out = arg("json", null);
  if (out) writeFileSync(out, JSON.stringify(sweep, null, 1)); else console.log(JSON.stringify(sweep, null, 1));
  process.exit(0);
}

const report = { generated: "deterministic", pupils: PUPILS, length: LENGTH, policy: MIX_POLICY, scenarios: {} };
const only = arg("only", null);
for (const scn of SCENARIOS) {
  if (only && !scn.name.includes(only)) continue;
  const res = { pool: scn.pool.length };
  for (const engine of ["A", "B", "C", "D"]) res[engine] = evaluate(scn, engine);
  report.scenarios[scn.name] = res;
  process.stderr.write(`✔ ${scn.name}\n`);
}
const outPath = arg("json", null);
if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 1));
else console.log(JSON.stringify(report, null, 1));
