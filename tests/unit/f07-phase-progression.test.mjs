// F-07 / D-362 phase progression with mastery, end to end on the SERVER side (PGlite, synthetic pupils only).
//
// Each step does what get-next-question + process-event do, with the real code:
//   advance_student_level + get_level_questions_for_student (real SQL) → loadLevelPlan (real TS, LEVEL_ENGINE=v1,
//   QUESTION_MIX_ENGINE=shadow) → applyPhaseGate (real TS, reads through a PGlite adapter) → insert the instance like
//   instance-insert.ts, OR — when nothing new is allowed — the repeat step exactly as index.ts orders it: the phase
//   repeat (migration 20261113170000, executed unmodified) when the gate asks for one, else the generic level repeat
//   → process_question_attempt (production's body). The client's wave phase follows app.js updateWavePhase (copied).
// The same walk WITHOUT the gate is the "before" picture and must show the known defect.
//
// Proves: order, repetition and the end of the course for profiles A–H incl. many wrong answers; no "no_questions"
// before the course is finished; rewards (10 + 5 first answer, 2 + 1 repeat); progress survives a reload.
// Does NOT prove: the HTTP layer, the due step (an open round is resumed before new questions), or the browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { loadLevelPlan } from "../../supabase/functions/get-next-question/level-flow.ts";
import { deriveQuestionScope } from "../../supabase/functions/get-next-question/scope.ts";
import { applyPhaseGate, phaseRank, MAX_REPEATS } from "../../supabase/functions/get-next-question/phase-gate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db, LABEL = new Map(), ROWS = [];

const TYPES = { p_student_id: "uuid", p_subject: "text", p_grade: "smallint", p_level: "integer", p_domains: "text[]", p_limit: "integer", p_question_ids: "uuid[]", p_max_repeats: "integer" };
function pgClient() {
  return {
    async rpc(fn, args) {
      const keys = Object.keys(args);
      try {
        const r = await db.query(`SELECT * FROM public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${TYPES[k]}`).join(", ")})`, keys.map((k) => args[k]));
        return { data: r.rows, error: null };
      } catch (e) { return { data: null, error: e }; }
    },
    from(table) {
      return {
        select(cols) {
          const f = { eq: [], in: [] };
          const qb = {
            eq(c, v) { f.eq.push([c, v]); return qb; },
            in(c, v) { f.in.push([c, v]); return qb; },
            then(res, rej) {
              const where = [...f.eq.map(([c], i) => `${c} = $${i + 1}`), ...f.in.map(([c], j) => `${c}::text = ANY($${f.eq.length + j + 1}::text[])`)];
              const sql = `SELECT ${cols} FROM public.${table}${where.length ? " WHERE " + where.join(" AND ") : ""}`;
              return db.query(sql, [...f.eq.map((x) => x[1]), ...f.in.map((x) => x[1])])
                .then((r) => ({ data: r.rows, error: null }), (e) => ({ data: null, error: e })).then(res, rej);
            },
          };
          return qb;
        },
      };
    },
  };
}
const asService = async (fn) => { await db.exec("SET ROLE service_role"); try { return await fn(); } finally { await db.exec("RESET ROLE"); } };

before(async () => {
  db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(read("supabase/migrations/20261108090100_stimulus_pilot_content.sql"));
  await db.exec(read("supabase/migrations/20261113170000_phase_repeat_rpc.sql"));
  const act = await db.query(`UPDATE public.questions SET is_active = true WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' = 'stimulus'
    RETURNING id, difficulty_level, content, metadata`);
  ROWS = act.rows.sort((a, b) => a.difficulty_level - b.difficulty_level);
  ROWS.forEach((q, i) => LABEL.set(q.id, `S${i + 1}`));
  assert.equal(ROWS.length, 7);
});
after(async () => { await db?.close(); });

let n = 900;
async function pupil({ grade = 7, domains = ["pilot_d362"], level = null, answered = 0, preAnswered = [] }) {
  const id = uid(n++);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `f07phase-${n}@example.test`]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', $2, $3::text[])", [id, grade, domains]);
  if (level !== null) await db.query("INSERT INTO public.student_subject_level (student_id, subject, level, answered) VALUES ($1, 'historie', $2, $3)", [id, level, answered]);
  for (const i of preAnswered) {
    await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer, difficulty_at_time, mastery_snapshot, repeat_count, next_review_at, was_correct, answered_at)
      VALUES ($1, $2, true, $3, 1, 1, 0, now(), true, now())`, [id, ROWS[i].id, ROWS[i].content.correct]);
  }
  return id;
}
const xp = async (p) => (await db.query("SELECT coalesce((SELECT xp FROM public.student_progress WHERE student_id = $1), 0) AS xp", [p])).rows[0].xp;

function makeWave() { // app.js updateWavePhase, copied
  let phase = "challenge", cc = 0, ci = 0;
  return { get phase() { return phase; }, update(ok) {
    if (ok) { ci = 0; cc++; if (phase === "recovery" && cc >= 3) { phase = "challenge"; cc = 0; } else if (phase === "reinforcement" && cc >= 2) { phase = "challenge"; cc = 0; } else if (phase === "challenge" && cc >= 4) phase = "deep_challenge"; }
    else { cc = 0; ci++; if (ci >= 2) phase = "recovery"; else if (phase === "deep_challenge" || phase === "challenge") phase = "reinforcement"; }
  } };
}

// answer(label, attemptNo) → true/false. Walks until the COURSE is finished (all phases complete) or no_questions.
async function walk(profile, { gate, answer = () => true, maxSteps = 40, useLevel = true }) {
  const p = await pupil(profile);
  const client = pgClient();
  const wave = makeWave();
  const path = [];
  const attempts = new Map();
  const xp0 = await xp(p);
  let expectXp = 0, end = "max_steps", lastCourses = [];
  for (let step = 0; step < maxSteps; step++) {
    const prof = (await db.query("SELECT selected_grade, active_domains FROM public.profiles WHERE id = $1", [p])).rows[0];
    const scope = deriveQuestionScope(prof, "historie");
    const plan = await loadLevelPlan(client, { studentId: p, subject: "historie", grade: scope.grade, domains: scope.subjectDomains, wavePhase: wave.phase, lastMisconceptionType: null, mixEngine: "shadow" });
    let list = plan.ordered, repeatIds = [];
    if (gate) {
      const g = await applyPhaseGate(client, p, plan.ordered, scope.subjectDomains, useLevel ? { level: plan.level.level } : {});
      list = g.allowed; repeatIds = g.repeatIds; lastCourses = g.courses;
      // Course finished: nothing new is allowed and no phase repeat is due — from here on only the existing
      // generic repeat would run (unchanged behaviour after a finished course).
      if (g.applied && g.courses.every((c) => c.current === null) && !list.some((c) => c && c.content)) { end = "course_finished"; break; }
    }
    let qi = null, row = null, isRepeat = false;
    const next = list.find((c) => c && c.content);
    if (next) {
      row = next;
      qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer, difficulty_at_time, mastery_snapshot, next_review_at)
        VALUES ($1, $2, false, $3, 1, 1, now()) RETURNING id`, [p, next.id, next.content.correct])).rows[0].id;
    } else {
      // index.ts repeat step: the phase repeat when the gate asks for one, else the generic level repeat.
      const r = repeatIds.length > 0
        ? await asService(() => client.rpc("request_repeat_phase_question_for_student", { p_student_id: p, p_domains: scope.subjectDomains, p_question_ids: repeatIds, p_max_repeats: MAX_REPEATS }))
        : await asService(() => client.rpc("request_repeat_level_question_for_student", { p_student_id: p, p_domains: scope.subjectDomains }));
      if (r.error) throw r.error;
      const id = Object.values(r.data?.[0] ?? {})[0] ?? null;
      if (!id) { end = "no_questions"; break; }
      if (!gate) { end = "generic_repeat"; break; } // before-picture: stop when the course has been met once
      qi = id; isRepeat = true;
      const qid = (await db.query("SELECT question_id FROM public.question_instances WHERE id = $1", [id])).rows[0].question_id;
      row = ROWS.find((x) => x.id === qid);
    }
    const label = LABEL.get(row.id);
    const k = (attempts.get(label) ?? 0) + 1; attempts.set(label, k);
    const ok = answer(label, k);
    const wrong = row.content.options ? row.content.options.find((o) => o !== row.content.correct) : String(Number(row.content.correct) + 1);
    const res = await asService(async () => (await db.query("SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, ok ? row.content.correct : wrong])).rows[0].r);
    assert.equal(res.status, ok ? "correct" : "incorrect");
    if (ok) expectXp += isRepeat ? 2 : 10;
    path.push({ id: label, rank: phaseRank(row.metadata), ok, repeat: isRepeat });
    wave.update(ok);
  }
  return { p, path, end, attempts, courses: lastCourses, xpGain: (await xp(p)) - xp0, expectXp };
}
const fmt = (path) => path.map((s) => `${s.id}${s.repeat ? "r" : ""}${s.ok ? "+" : "-"}`).join(" ");
const nonDecreasing = (path) => path.every((s, i) => i === 0 || s.rank >= path[i - 1].rank);
const masteryOf = (courses) => (courses[0]?.phases ?? []).map((ph) => `${["intro", "forst", "anv"][ph.rank]}:${ph.allSecured ? "sikret" : `støtte(${ph.needsSupport.length})`}${ph.provisionalIndicator ? "+indikator" : ""}`).join(" ");

const PROFILES = [
  ["A ny elev, 7. klasse, alt rigtigt", {}, () => true],
  ["B lav mestring (2000), alt rigtigt", { level: 2000, answered: 40 }, () => true],
  ["C middel mestring (6000), alt rigtigt", { level: 6000, answered: 40 }, () => true],
  ["D høj mestring (9000), alt rigtigt", { level: 9000, answered: 40 }, () => true],
  ["F uden klassetrin", { grade: null }, () => true],
  ["E alt forkert (også alle gentagelser)", {}, () => false],
  ["E3 forkert første gang, rigtigt ved gentagelse", {}, (_l, k) => k >= 2],
  ["E4 hver anden opgave forkert første gang", {}, (l, k) => k >= 2 || Number(l.slice(1)) % 2 === 1],
  ["E5 kun anvendelse driller (S6, S7 forkert 2 gange)", {}, (l, k) => !(["S6", "S7"].includes(l) && k <= 2)],
];

const REPORT = [];
const BEFORE = [];
for (const [name, profile, answer] of PROFILES) {
  test(`gate: ${name}`, async () => {
    const before0 = await walk(profile, { gate: false, answer });
    const r = await walk(profile, { gate: true, answer });
    BEFORE.push(before0.path);
    REPORT.push(`# ${name}\n#   FØR:   ${fmt(before0.path)}\n#   EFTER: ${fmt(r.path)}   [${r.end}; ${masteryOf(r.courses)}]`);
    assert.equal(r.end, "course_finished", "never no_questions before the course is finished");
    assert.ok(nonDecreasing(r.path), `phases never step back: ${fmt(r.path)}`);
    assert.equal(r.path[0].id, "S1", "the introduction starts with S1 (authored order)");
    assert.equal(new Set(r.path.map((s) => s.id)).size, 7, "all 7 met");
    for (const [label, k] of r.attempts) assert.ok(k <= 1 + MAX_REPEATS, `${label}: at most ${1 + MAX_REPEATS} attempts`);
    assert.equal(r.xpGain, r.expectXp, "10 XP first answer, 2 XP repeat — nothing else, nothing twice");
  });
}

test("completed ≠ secured ≠ needs support ≠ indicator: A all secured; E completes with every question needing support; E3 secured only by repeats", async () => {
  const A = await walk({}, { gate: true, answer: () => true });
  assert.deepEqual(A.courses[0].phases.map((p) => [p.completed, p.allSecured, p.needsSupport.length, p.provisionalIndicator]), [[true, true, 0, true], [true, true, 0, true], [true, true, 0, true]]);
  const E = await walk({}, { gate: true, answer: () => false });
  assert.deepEqual(E.courses[0].phases.map((p) => [p.completed, p.allSecured, p.needsSupport.length, p.provisionalIndicator]), [[true, false, 2, false], [true, false, 3, false], [true, false, 2, false]]);
  assert.equal(E.path.length, 7 * (1 + MAX_REPEATS), "every question practised to the bound, then the course ends");
  const E3 = await walk({}, { gate: true, answer: (_l, k) => k >= 2 });
  assert.deepEqual(E3.courses[0].phases.map((p) => [p.completed, p.allSecured, p.needsSupport.length, p.provisionalIndicator]), [[true, true, 0, false], [true, true, 0, false], [true, true, 0, false]], "secured only by repeats: completed and secured, indicator false");
  assert.equal(E3.path.length, 14);
});

test("wrong answers are practised in the SAME phase before moving on (no later phase while a repeat is due)", async () => {
  const r = await walk({}, { gate: true, answer: (l, k) => !(l === "S1" && k === 1) }); // S1 wrong once
  const s = fmt(r.path);
  assert.match(s, /^S1- S2\+ S1r\+ /, `S2 first (spacing), then the S1 repeat, before any understanding question: ${s}`);
});

test("G elev med gennemført introduktion: starts directly with forståelsestjek", async () => {
  const r = await walk({ preAnswered: [0, 1] }, { gate: true });
  REPORT.push(`# G introduktion allerede gennemført\n#   EFTER: ${fmt(r.path)}`);
  assert.equal(r.path[0].rank, 1);
  assert.equal(r.path.length, 5);
});

test("H elev uden pilotadgang: never served a pilot row, with or without the gate", async () => {
  for (const gate of [false, true]) {
    const r = await walk({ domains: ["revolutions_democracy"] }, { gate });
    assert.equal(r.path.length, 0);
  }
});

test("reload mid-phase: progress lives in the database — a fresh evaluation still holds later phases", async () => {
  const p = await pupil({});
  const plan = await loadLevelPlan(pgClient(), { studentId: p, subject: "historie", grade: 7, domains: ["pilot_d362"], wavePhase: "challenge", lastMisconceptionType: null, mixEngine: "shadow" });
  const first = (await applyPhaseGate(pgClient(), p, plan.ordered)).allowed[0];
  await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer, difficulty_at_time, mastery_snapshot, next_review_at)
    VALUES ($1, $2, false, $3, 1, 1, now())`, [p, first.id, first.content.correct]);
  const again = await loadLevelPlan(pgClient(), { studentId: p, subject: "historie", grade: 7, domains: ["pilot_d362"], wavePhase: "recovery", lastMisconceptionType: null, mixEngine: "shadow" });
  const g = await applyPhaseGate(pgClient(), p, again.ordered);
  assert.ok(g.allowed.every((c) => phaseRank(c.metadata) === 0), "only introduktion while an intro row is still open");
  assert.equal(g.held, 5);
});

test("race between two tabs: the losing phase repeat returns no row, the open round exists → index.ts answers 409 and the retry gets that round", async () => {
  const p = await pupil({});
  const client = pgClient();
  const plan = async () => loadLevelPlan(client, { studentId: p, subject: "historie", grade: 7, domains: ["pilot_d362"], wavePhase: "challenge", lastMisconceptionType: null, mixEngine: "shadow" });
  // both intro questions answered wrong → a phase repeat is due
  for (const i of [0, 1]) {
    const qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer, difficulty_at_time, mastery_snapshot, next_review_at)
      VALUES ($1, $2, false, $3, 1, 1, now()) RETURNING id`, [p, ROWS[i].id, ROWS[i].content.correct])).rows[0].id;
    await asService(() => db.query("SELECT public.process_question_attempt($1, $2, 'feil', 0)", [p, qi]));
  }
  // tab A and tab B evaluate the SAME state (the race window)
  const lv = await plan();
  const gA = await applyPhaseGate(client, p, lv.ordered, ["pilot_d362"], { level: lv.level.level });
  const gB = await applyPhaseGate(client, p, lv.ordered, ["pilot_d362"], { level: lv.level.level });
  assert.deepEqual(gA.repeatIds.length, 2); assert.deepEqual(gB.repeatIds, gA.repeatIds);
  assert.equal(gA.allowed.filter((c) => phaseRank(c.metadata) !== null).length, 0, "nothing new is allowed: only the repeat");
  const call = () => asService(() => client.rpc("request_repeat_phase_question_for_student", { p_student_id: p, p_domains: ["pilot_d362"], p_question_ids: gA.repeatIds, p_max_repeats: 2 }));
  const a = Object.values((await call()).data[0])[0];
  const b = Object.values((await call()).data[0])[0];
  assert.ok(a, "tab A reopens one round");
  assert.equal(b, null, "tab B loses the race → no row → index.ts returns 409 phase_state_changed (not no_questions)");
  // B's automatic retry: the due step serves the pupil's open round — exactly A's
  const open = (await db.query("SELECT id FROM public.question_instances WHERE student_id = $1 AND answered = false", [p])).rows;
  assert.deepEqual(open.map((r) => r.id), [a]);
});

test("more than 50 candidates: a crowded window from another domain cannot break the phases (and without the level the gate stays conservative)", async () => {
  // 60 regular, active questions in the pupil's other domain, all nearer the pupil's level than any pilot row
  const fill = [];
  for (let i = 0; i < 60; i++) {
    fill.push((await db.query(`INSERT INTO public.questions (type, content, answer_format, answer_type, metadata, difficulty, question_type,
        is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
      VALUES ('mc_single', $1::jsonb, 'mc', 'short', '{}'::jsonb, 1, 'auto', true, 'revolutions_democracy', 7, 1, $2) RETURNING id`,
    [JSON.stringify({ type: "mc", question: `F07QA vindue ${i}: vælg A`, options: ["A", "B", "C", "D"], correct: "A", accepted_answers: ["A"] }), 5850 + (i % 15)])).rows[0].id);
  }
  try {
    const profile = { domains: ["revolutions_democracy", "pilot_d362"], level: 5857, answered: 400 };
    const pilotPath = (r) => r.path.filter((s) => s.rank !== null);
    const withLevel = await walk(profile, { gate: true, maxSteps: 90 });
    const pw = pilotPath(withLevel);
    REPORT.push(`# I pilot + 60 andre kandidater (vindue 50)\n#   pilotopgaver i rækkefølge: ${fmt(pw)}`);
    assert.equal(new Set(pw.map((s) => s.id)).size, 7, "all 7 pilot questions met");
    assert.ok(nonDecreasing(pw), `phases never step back with a full window: ${fmt(pw)}`);
    assert.equal(pw[0].id, "S1");
    // sensitivity: without the per-course fetch (no level) the gate stays conservative — it never lets a later phase through early
    const noLevel = await walk(profile, { gate: true, maxSteps: 90, useLevel: false });
    assert.ok(nonDecreasing(pilotPath(noLevel)), "conservative without the level: no back-step either");
  } finally {
    await db.query("UPDATE public.questions SET is_active = false WHERE id = ANY($1::uuid[])", [fill]);
  }
});

test("the walk WITHOUT the gate reproduces the known defect (test sensitivity)", () => {
  assert.equal(BEFORE.length, PROFILES.length);
  assert.ok(BEFORE.filter((p) => !nonDecreasing(p) || p[0].rank !== 0).length >= 3);
});

test("print FØR/EFTER", () => { for (const r of REPORT) console.log(r); });
