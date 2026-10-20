// Deterministic selection simulation for the format mix (opgaveformer). No database, no network.
//
// Usage:  node tools/question-mix-sim/sim.mjs [--pupils 200] [--length 100] [--json out.json]
//
// BANK   bank-shape-2026-10-19.json — the ACTIVE question bank read read-only on 2026-10-19 in physical
//        (ctid) order: grade, band, topic, answer_format, answer_type and a metadata profile per row.
//        No question text, no answer keys, no pupil data. Synthetic additions (future kinds) are
//        APPENDED physically, as new content is.
// SERVER the engines import the REAL modules the Edge Function runs:
//          supabase/functions/get-next-question/format-mix.ts   (planNextQuestions, MIX_POLICY)
//          supabase/functions/get-next-question/server-band.ts  (deriveServerBand)
//          supabase/functions/get-next-question/wave-order.ts   (sortByWave — unchanged scoring)
//          supabase/functions/_shared/interaction-kinds.ts      (classifyQuestion)
//        The SQL candidate functions are emulated here; their equivalence to the real SQL is proven in
//        tests/unit/question-candidates-stratified-migration-run.test.mjs (PGlite).
// NOT MODELLED HERE (proven elsewhere): an interrupted or repeated request is answered by index.ts's
//        due step with the SAME open instance before any selection runs (idx_one_open_question), and the
//        repeat step only starts once the scope is exhausted — both identical for every engine.
// PUPIL  wave phase + client band exactly as app.js (updateWavePhase / adjustDifficultyBand); answers
//        correctly with a logistic ability model; a fixed per-pupil PRNG, so every run is identical.
//
// ENGINES compared
//   A   today: get_unserved_questions_for_student (LIMIT 50, physical order) + sortByWave, client band
//   B   md5(student||question) ORDER BY … LIMIT 50 + sortByWave, client band
//   C   the 2026-10-19 proposal "C v2": 50 per answer_format by md5 + kind pick, client band, counts
//       kept in the session
//   D   the implementation: get_question_candidates_for_student (20 per format/type/force_text/band,
//       md5) + planNextQuestions with the SERVER band and the SERVER history window
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { planNextQuestions, MIX_POLICY } from "../../supabase/functions/get-next-question/format-mix.ts";
import { deriveServerBand } from "../../supabase/functions/get-next-question/server-band.ts";
import { sortByWave } from "../../supabase/functions/get-next-question/wave-order.ts";
import { classifyQuestion, BASE_KIND } from "../../supabase/functions/_shared/interaction-kinds.ts";

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
  return q;
}
// Future content, appended physically: realistic small amounts per kind, spread over grades 3–9,
// bands 1–5 and the history topics.
function withFuture(bank, spec) {
  const out = [...bank];
  let phys = bank.length;
  for (const [format, type, count] of spec) {
    for (let i = 0; i < count; i++) {
      out.push(row(phys++, { grade: 3 + (i % 7), band: 1 + (i % 5), domain: HISTORY_DOMAINS[i % HISTORY_DOMAINS.length],
        format, type, metadata: PROFILES[(i * 37) % PROFILES.length] }));
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
  stratified20: (pool, rank) => {
    const counts = new Map(); const out = [];
    for (const q of [...pool].sort((a, b) => rank(a) < rank(b) ? -1 : 1)) {
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

  // Prior history (pupils with many answers): served before the session, oldest first.
  const served = new Set(); const instances = []; // server-owned question_instances, oldest first
  const t0 = Date.UTC(2026, 8, 1);
  const prior = scn.prior ?? 0;
  if (prior > 0) {
    const pre = [...scn.pool].filter((q) => q.kind === BASE_KIND).sort((a, b) => rank(a) < rank(b) ? 1 : -1).slice(0, prior);
    pre.forEach((q, i) => { served.add(q.id); instances.push({ q, was_correct: r() < 0.6, answered_at: new Date(t0 + i * 6e4).toISOString() }); });
  }
  const seedBand = scn.placement ? Math.max(1, Math.min(4, Math.round(ability - 0.5))) : null;
  const st = { phase: "challenge", band: seedBand ?? GRADE_START_BAND[scn.grade] ?? 2, cc: 0, ci: 0, dc: 0, di: 0,
    n: 0, countFmt: {}, lastSpecialAt: -Infinity };
  const seq = []; let planMs = 0; let stabilityBreaks = 0;

  for (let i = 0; i < LENGTH; i++) {
    const pool = scn.pool.filter((q) => !served.has(q.id));
    if (pool.length === 0) break;
    let ordered, targetBand, reason = null;
    const t = performance.now();
    if (engine === "A" || engine === "B") {
      const cands = engine === "A" ? WINDOWS.physical50(pool) : WINDOWS.md5_50(pool, rank);
      ordered = sortByWave(cands, st.phase, null, st.band); targetBand = st.band;
    } else if (engine === "C") {
      ordered = pickCv2(WINDOWS.perFormat50(pool, rank), st); targetBand = st.band;
    } else {
      const cands = WINDOWS.stratified20(pool, rank);
      const newestFirst = [...instances].reverse();
      const band = deriveServerBand(scn.grade, seedBand ? { band: seedBand, completed_at: "x" } : null, newestFirst.slice(0, 60));
      const history = newestFirst.slice(0, MIX_POLICY.windowSize).map((h) => ({ kind: h.q.kind, domain: h.q.learning_objective }));
      const input = { candidates: cands, history, targetBand: band.band, wavePhase: st.phase, lastMisconceptionType: null, policy };
      const plan = planNextQuestions(input);
      if (i % 25 === 0) { // stability: the same server state must give the same answer
        const again = planNextQuestions(input);
        if (again.ordered[0]?.id !== plan.ordered[0]?.id) stabilityBreaks++;
      }
      ordered = plan.ordered; targetBand = band.band; reason = plan.decision.reason;
    }
    planMs += performance.now() - t;
    const q = ordered[0];
    if (!q) break; // nothing servable left (e.g. only Match par remains)

    served.add(q.id);
    const correct = r() < 1 / (1 + Math.exp(1.3 * (q.difficulty_band - ability)));
    instances.push({ q, was_correct: q.kind === "long_text" ? null : correct, answered_at: new Date(t0 + (prior + i) * 6e4).toISOString() });
    seq.push({ id: q.id, kind: q.kind, band: q.difficulty_band, domain: q.learning_objective, targetBand, reason });

    st.countFmt[q.answer_format] = (st.countFmt[q.answer_format] ?? 0) + 1;
    if (q.answer_format !== "mc") st.lastSpecialAt = st.n;
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
  const kinds = [...new Set(scn.pool.map((q) => q.kind))].filter((k) => k && k !== BASE_KIND).sort();
  const out = { served: Math.round(avg(runs.map((r) => r.seq.length))) };
  for (const k of kinds) {
    const available = scn.pool.filter((q) => q.kind === k).length;
    const reach = (n) => pct(runs.filter((r) => r.seq.slice(0, n).some((x) => x.kind === k)).length / PUPILS);
    const share = (n) => (100 * avg(runs.map((r) => r.seq.slice(0, n).filter((x) => x.kind === k).length / Math.max(1, Math.min(n, r.seq.length))))).toFixed(1);
    const firsts = runs.map((r) => r.seq.findIndex((x) => x.kind === k)).filter((i) => i >= 0).sort((a, b) => a - b);
    out[k] = { available, firstMedian: firsts.length ? firsts[Math.floor(firsts.length / 2)] + 1 : null,
      reach20: reach(20), reach40: reach(40), reach100: reach(100),
      share20: share(20), share40: share(40), share100: share(100) };
  }
  const all = runs.flatMap((r) => r.seq);
  out.nonBaseShare100 = (100 * all.filter((x) => x.kind !== BASE_KIND).length / Math.max(1, all.length)).toFixed(1);
  out.bandExact = pct(all.filter((x) => x.band === x.targetBand).length / Math.max(1, all.length));
  out.bandWithin1 = pct(all.filter((x) => Math.abs(x.band - x.targetBand) <= 1).length / Math.max(1, all.length));
  const first20 = runs.map((r) => r.seq.slice(0, 20));
  out.domainsFirst20 = avg(first20.map((s) => new Set(s.map((x) => x.domain)).size)).toFixed(1);
  out.topDomainShare20 = pct(avg(first20.map((s) => { const c = {}; s.forEach((x) => (c[x.domain] = (c[x.domain] ?? 0) + 1));
    return s.length ? Math.max(...Object.values(c)) / s.length : 0; })));
  let b2b = 0, gapViol = 0, gapViolBaseLeft = 0, dupes = 0;
  for (const r of runs) {
    const ids = new Set();
    r.seq.forEach((x, i) => {
      if (ids.has(x.id)) dupes++; ids.add(x.id);
      if (x.kind !== BASE_KIND) {
        for (let j = Math.max(0, i - MIX_POLICY.gap); j < i; j++) if (r.seq[j].kind !== BASE_KIND) {
          gapViol++; if (x.reason !== "base_exhausted") gapViolBaseLeft++; break; }
        if (i > 0 && r.seq[i - 1].kind !== BASE_KIND) b2b++;
      }
    });
  }
  out.nonBaseBackToBack = b2b; out.gapViolations = gapViol; out.duplicateQuestions = dupes;
  if (engine === "D") out.gapViolationsWhileBaseLeft = gapViolBaseLeft;
  let j = 0, n = 0;
  for (let a = 0; a < Math.min(40, PUPILS); a++) for (let b = a + 1; b < Math.min(40, PUPILS); b++) {
    const A = new Set(first20[a].map((x) => x.id)), B = new Set(first20[b].map((x) => x.id));
    const inter = [...A].filter((x) => B.has(x)).length; j += inter / Math.max(1, A.size + B.size - inter); n++;
  }
  out.overlapBetweenPupils20 = pct(j / Math.max(1, n));
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
    for (const [label, policy] of Object.entries(VARIANTS)) { sweep[scn.name][label] = evaluate(scn, "D", policy); process.stderr.write(`✔ ${scn.name} · ${label}
`); }
  }
  const out = arg("json", null);
  if (out) writeFileSync(out, JSON.stringify(sweep, null, 1)); else console.log(JSON.stringify(sweep, null, 1));
  process.exit(0);
}

const report = { generated: "deterministic", pupils: PUPILS, length: LENGTH, policy: MIX_POLICY, scenarios: {} };
for (const scn of SCENARIOS) {
  const res = { pool: scn.pool.length };
  for (const engine of ["A", "B", "C", "D"]) res[engine] = evaluate(scn, engine);
  report.scenarios[scn.name] = res;
  process.stderr.write(`✔ ${scn.name}\n`);
}
const outPath = arg("json", null);
if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 1));
else console.log(JSON.stringify(report, null, 1));
