// Anti-gætte-pausen (migration 20261105130000_quiz_anti_guess_cooldown.sql) kørt på produktionens
// svarkæde i PGlite: de RIGTIGE svarfunktioner (process_question_attempt med G1's krop,
// process_text_answer, H5's process_question_attempt_v2 med alignmentens krop) bedømmer, og triggerne
// læser kun deres resultat. Docs: docs/quiz-anti-guess-cooldown.md.
//
// KONTROLLERET TID: PostgreSQL's now() kan ikke stilles. "Tiden går X sekunder" er derfor at flytte
// alle lagrede tidspunkter i quiz_cooldown_state X sekunder tilbage (advance()) — for reglen er det
// præcis det samme, og intet venter i realtid. Grænsetesten (E) kører i én transaktion, hvor now() er
// fast, så 60,000 s kan rammes eksakt.
//
// Samtidighed med rigtige forbindelser (test I/L) ligger i quiz-anti-guess-cooldown-concurrency.test.mjs
// (rigtig PostgreSQL 17); PGlite har kun én forbindelse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { baseSql, migrationSql, withTop10, PROD_ORDER, uid } from "./helpers/h5-integration-chain.mjs";
import { planReplay, NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const COOLDOWN_FILE = "20261105130000_quiz_anti_guess_cooldown.sql";
const SQL = migrationSql(COOLDOWN_FILE);

// En elev kan kun have én instans pr. spørgsmål (idx_student_question_instance), så hver svartype har
// en pulje, og serve() tager det næste ubrugte spørgsmål af den type for eleven.
const QM = "mc";       // multiple choice (process_question_attempt / _v2)
const QT = "text";     // kort tekst (process_text_answer)
const QL = "long";     // langt svar (lærerbedømmelse)
const QN = "number";   // tal
const POOL_SIZE = { mc: 60, text: 20, long: 5, number: 5 };
const POOL = Object.fromEntries(Object.entries(POOL_SIZE).map(([kind, n], k) =>
  [kind, Array.from({ length: n }, (_, i) => uid(9200 + k * 100 + i))]));
const questionRow = (kind, id, i) => {
  const [type, content, format, answerType] = {
    mc: ["mc", `{"type":"mc","question":"Cooldown MC ${i}?","options":["A","B","C"],"correct":"A"}`, "mc", "short"],
    text: ["text", `{"type":"text","question":"Cooldown tekst ${i}?","correct":"hund"}`, "text", "short"],
    long: ["text", `{"type":"text","question":"Cooldown essay ${i}?","correct":"-"}`, "text", "long"],
    number: ["number", `{"type":"number","question":"Cooldown 2+2 nr. ${i}?","correct":"4"}`, "number", "short"],
  }[kind];
  return `('${id}', '${type}', '${content}', 1, true, 'auto', 'cooldown-${kind}-${i}', '${format}', '${answerType}', '{}', 1000)`;
};
const SEED = `
  INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, metadata, difficulty_level) VALUES
  ${Object.entries(POOL).flatMap(([kind, ids]) => ids.map((id, i) => questionRow(kind, id, i))).join(",\n  ")};`;
const used = new Map();
function pick(pupil, kind) {
  const key = `${pupil}|${kind}`;
  const i = used.get(key) ?? 0;
  if (i >= POOL[kind].length) throw new Error(`testpuljen ${kind} er opbrugt`);
  used.set(key, i + 1);
  return POOL[kind][i];
}

async function chainDb({ withMigration = true } = {}) {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  for (const f of withTop10(PROD_ORDER)) await db.exec(migrationSql(f));
  await db.exec(SEED);
  if (withMigration) await db.exec(SQL);
  return db;
}
// Én database til alle elev-scenarier (hver test har sine egne elever, og test, der ændrer
// konfigurationen eller en funktion, sætter den tilbage) — unit-jobbet har en fast tidsgrænse.
let shared = null;
const sharedDb = async () => (shared ??= await chainDb());
async function withConfig(db, set, fn) {
  await db.exec(`UPDATE public.quiz_cooldown_config SET ${set}`);
  try { return await fn(); } finally {
    await db.exec("UPDATE public.quiz_cooldown_config SET wrong_answer_threshold = 10, window_seconds = 60, cooldown_seconds = 120");
  }
}

let nextPupil = 500;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 0, 0, 1, 1, current_date - 1);`);
  return id;
}
const serve = async (db, pupil, kind, key) => (await db.query(
  `INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered)
   VALUES ($1, $2, $3, false) RETURNING id`, [pupil, pick(pupil, kind), key])).rows[0].id;

async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
// De tre svarveje, kaldt som process-event kalder dem (backend-rollen).
const mc = async (db, p, qi, a) => (await as(db, "service_role", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, a]))[0].r;
const text = async (db, p, qi, a, ok) => (await as(db, "service_role", "SELECT public.process_text_answer($1, $2, $3, $4) AS r", [qi, p, a, ok]))[0].r;
const v2 = async (db, p, qi, a, sub = randomUUID()) =>
  (await as(db, "service_role", "SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, NULL, NULL) AS r", [p, qi, a, sub]))[0].r;

// Et forkert / rigtigt MC-svar på et nyt spørgsmål (ét åbent spørgsmål ad gangen, som i produktionen).
const wrong = async (db, p) => mc(db, p, await serve(db, p, QM, "A"), "B");
const right = async (db, p) => mc(db, p, await serve(db, p, QM, "A"), "A");
async function wrongTimes(db, p, n) { for (let i = 0; i < n; i++) await wrong(db, p); }

const state = async (db, p) => (await db.query(
  `SELECT cardinality(recent_wrong_at) AS n, counted_from, cooldown_started_at, cooldown_until,
          (cooldown_until > now()) IS TRUE AS active,
          extract(epoch FROM cooldown_until - cooldown_started_at)::int AS secs
   FROM public.quiz_cooldown_state WHERE student_id = $1`, [p])).rows[0] ?? null;
const events = async (db, p) => (await db.query(
  "SELECT started_at, ends_at, reason_code, question_instance_id FROM public.quiz_cooldown_events WHERE student_id = $1 ORDER BY id", [p])).rows;
const active = async (db, p) => (await state(db, p))?.active === true;

// "Tiden går secs sekunder" for én elev: alle hendes lagrede tidspunkter flyttes tilbage.
async function advance(db, p, secs) {
  await db.query(`UPDATE public.quiz_cooldown_state SET
      recent_wrong_at     = ARRAY(SELECT t - make_interval(secs => $2) FROM unnest(recent_wrong_at) t ORDER BY t),
      counted_from        = counted_from - make_interval(secs => $2),
      cooldown_started_at = cooldown_started_at - make_interval(secs => $2),
      cooldown_until      = cooldown_until - make_interval(secs => $2)
    WHERE student_id = $1`, [p, secs]);
}

async function learning(db, p) {
  const rows = async (sql) => (await db.query(sql, [p])).rows;
  return JSON.stringify({
    progress: await rows("SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak, last_activity_date FROM public.student_progress WHERE student_id = $1"),
    instances: await rows("SELECT id, answered, answered_at, user_answer, was_correct FROM public.question_instances WHERE student_id = $1 ORDER BY id"),
    daily: await rows("SELECT quest_id, progress FROM public.student_quest_progress WHERE student_id = $1 ORDER BY 1"),
    weekly: await rows("SELECT quest_id, progress FROM public.student_weekly_quest_progress WHERE student_id = $1 ORDER BY 1"),
    attempts: await rows("SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1"),
  });
}
const COOLDOWN_ERR = (e) => e?.code === "LQ429" && e?.message === "quiz_cooldown_active";

// ── Filen ────────────────────────────────────────────────────────────────────────────────────────

test("filen: unik version, efter K1, ikke anvendt i produktionen → NOT_IN_PRODUCTION (springes over i isoleret CI)", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f));
  assert.ok(files.includes(COOLDOWN_FILE));
  assert.equal(files.filter((f) => f.slice(0, 14) === COOLDOWN_FILE.slice(0, 14)).length, 1, "versionen er unik");
  assert.ok(COOLDOWN_FILE > "20261103110000_l1_k1_attempt_context.sql");
  assert.ok(NOT_IN_PRODUCTION[COOLDOWN_FILE], "skal stå i NOT_IN_PRODUCTION, indtil den er anvendt og verificeret");
  const decision = planReplay([COOLDOWN_FILE], () => SQL).plan.find((d) => d.file === COOLDOWN_FILE);
  assert.equal(decision.action, "skip");
});

test("filen ændrer ingen svarfunktion, skriver ingen elevdata og bruger aldrig db push", () => {
  const code = SQL.replace(/^\s*--.*$/gm, "");
  assert.equal(/\bFUNCTION\s+public\.(process_question_attempt|process_text_answer|release_open_question_outside|request_repeat_\w+)\w*\s*\(/i.test(code), false);
  assert.equal(/db\s+push/i.test(code), false);
  const outside = code.replace(/\$fn\$[\s\S]*?\$fn\$/g, "");
  assert.equal(/\b(UPDATE|DELETE\s+FROM|TRUNCATE)\s+public\.(question_instances|student_progress|questions)\b/i.test(outside), false);
  // Tallene 10 / 60 / 120 findes kun ét sted: konfigurationsrækken.
  assert.equal((code.match(/VALUES \(true, 10, 60, 120\)/g) ?? []).length, 1);
});

test("migrationen anvendes på produktionens kæde, stopper uden ændringer ved gentagelse, og efterlader ingen API-adgang", async () => {
  const db = await sharedDb();
  await assert.rejects(db.exec(SQL), /anvendes kun én gang/);
  const priv = async (sql) => (await db.query(`SELECT (${sql}) AS v`)).rows[0].v;
  for (const role of ["anon", "authenticated"]) {
    for (const t of ["quiz_cooldown_config", "quiz_cooldown_state", "quiz_cooldown_events"]) {
      assert.equal(await priv(`has_table_privilege('${role}', 'public.${t}', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`), false, `${role} på ${t}`);
    }
    assert.equal(await priv(`has_function_privilege('${role}', 'public.quiz_cooldown_guard()', 'EXECUTE')`), false);
    assert.equal(await priv(`has_function_privilege('${role}', 'public.quiz_cooldown_register()', 'EXECUTE')`), false);
  }
  assert.equal(await priv("has_function_privilege('anon', 'public.get_my_quiz_cooldown()', 'EXECUTE')"), false);
  assert.equal(await priv("has_function_privilege('authenticated', 'public.get_my_quiz_cooldown()', 'EXECUTE')"), true);
  const rls = (await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'quiz_cooldown_%' AND relkind = 'r' ORDER BY 1`)).rows;
  assert.deepEqual(rls.map((r) => r.relrowsecurity), [true, true, true]);
  const fns = (await db.query(`SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('quiz_cooldown_guard','quiz_cooldown_register','get_my_quiz_cooldown') ORDER BY 1`)).rows;
  for (const f of fns) { assert.equal(f.prosecdef, true, f.proname); assert.deepEqual(f.proconfig, ['search_path=""'], f.proname); }
});

test("en fejlet forudsætning ændrer intet", async () => {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  await db.exec("ALTER TABLE public.questions RENAME COLUMN answer_type TO answer_kind");
  await assert.rejects(db.exec(SQL), /forventede kolonner mangler/);
  assert.equal((await db.query("SELECT to_regclass('public.quiz_cooldown_config') IS NULL AS gone")).rows[0].gone, true);
});

// ── 11.1 Grundfunktion ───────────────────────────────────────────────────────────────────────────

test("A: ni forkerte svar inden for 60 s → ingen pause", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 9);
  const s = await state(db, p);
  assert.equal(s.n, 9);
  assert.equal(s.active, false);
  assert.deepEqual(await events(db, p), []);
  // Det næste svar accepteres og bedømmes normalt.
  assert.equal((await right(db, p)).status, "correct");
});

test("B: ti forkerte svar inden for 60 s → 120 s pause; det tiende behandles normalt først", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 9);
  const tenth = await serve(db, p, QM, "A");
  const r = await mc(db, p, tenth, "B");
  assert.equal(r.status, "incorrect", "det tiende svar er bedømt og returneret normalt");
  const inst = (await db.query("SELECT answered, was_correct, answered_at FROM public.question_instances WHERE id = $1", [tenth])).rows[0];
  assert.equal(inst.answered, true);
  assert.equal(inst.was_correct, false);
  const s = await state(db, p);
  assert.equal(s.active, true);
  assert.equal(s.secs, 120);
  assert.equal(s.n, 0, "tællerens tidspunkter er tømt ved aktiveringen");
  assert.equal(s.cooldown_started_at.getTime(), inst.answered_at.getTime(), "pausen starter på det tiende svars servertidspunkt");
  const ev = await events(db, p);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].reason_code, "wrong_answer_burst");
  assert.equal(ev[0].question_instance_id, tenth);
  assert.equal(ev[0].ends_at.getTime() - ev[0].started_at.getTime(), 120_000);
});

test("C: seks forkerte, to rigtige, fire forkerte → pause (rigtige svar nulstiller ikke)", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 6);
  assert.equal((await right(db, p)).status, "correct");
  assert.equal((await right(db, p)).status, "correct");
  await wrongTimes(db, p, 3);
  assert.equal(await active(db, p), false);
  await wrong(db, p);
  assert.equal(await active(db, p), true);
});

test("D: rullende vindue — ti forkerte spredt over mere end 60 s → ingen pause", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 9);
  await advance(db, p, 61);
  await wrong(db, p);
  let s = await state(db, p);
  assert.equal(s.active, false);
  assert.equal(s.n, 1, "de ni gamle er faldet ud af vinduet");
  // Vinduet ruller videre: 8 til (i alt 9 i vinduet) → stadig ingen; den 10. i vinduet → pause.
  await wrongTimes(db, p, 8);
  assert.equal(await active(db, p), false);
  await wrong(db, p);
  assert.equal(await active(db, p), true);
});

test("D2: delvis udløb — fem gamle falder ud, fem nye tæller med de fem, der stadig er inden for vinduet", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 5);
  await advance(db, p, 40);
  await wrongTimes(db, p, 4);
  await advance(db, p, 25);     // de første fem er nu 65 s gamle, de næste fire 25 s
  await wrong(db, p);
  let s = await state(db, p);
  assert.equal(s.n, 5);
  assert.equal(s.active, false);
  await wrongTimes(db, p, 5);
  assert.equal(await active(db, p), true);
});

test("E: præcis grænse — et svar 60,000 s gammelt tæller ikke, 59,999 s gammelt tæller", async () => {
  for (const [ageMs, expectActive] of [[60_000, false], [59_999, true], [60_001, false]]) {
    const db = await sharedDb();
    const p = await addPupil(db);
    await wrong(db, p);                          // opretter tilstandsrækken
    const qi = await serve(db, p, QM, "A");
    await db.exec("BEGIN");                      // now() er fast i hele transaktionen
    await db.query(`UPDATE public.quiz_cooldown_state SET recent_wrong_at =
        ARRAY[now() - make_interval(secs => $2::double precision / 1000)] || ARRAY(SELECT now() - interval '1 second' FROM generate_series(1, 8))
      WHERE student_id = $1`, [p, ageMs]);
    await mc(db, p, qi, "B");                    // 1 på grænsen + 8 + dette = 10
    await db.exec("COMMIT");
    assert.equal(await active(db, p), expectActive, `alder ${ageMs} ms`);
  }
});

// ── 11.2 Under og efter pausen ───────────────────────────────────────────────────────────────────

test("F: under pausen afvises svar på alle svarveje med LQ429, og intet læringsdata ændres", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 10);
  assert.equal(await active(db, p), true);
  const qm = await serve(db, p, QM, "A");
  const before = await learning(db, p);
  const stBefore = JSON.stringify(await state(db, p));
  // Rigtigt svar via den gamle MC-vej: ingen XP, ingen mønter, ingen streak/quest.
  await assert.rejects(mc(db, p, qm, "A"), COOLDOWN_ERR);
  await assert.rejects(mc(db, p, qm, "B"), COOLDOWN_ERR);
  // H5's _v2: hverken forsøg, belønning eller lukket runde.
  await assert.rejects(v2(db, p, qm, "A"), COOLDOWN_ERR);
  // Tal og kort tekst.
  await db.exec(`DELETE FROM public.question_instances WHERE id = '${qm}'`);
  const qn = await serve(db, p, QN, "4");
  await assert.rejects(mc(db, p, qn, "4"), COOLDOWN_ERR);
  await db.exec(`DELETE FROM public.question_instances WHERE id = '${qn}'`);
  const qt = await serve(db, p, QT, "hund");
  await assert.rejects(text(db, p, qt, "hund", true), COOLDOWN_ERR);
  await db.exec(`DELETE FROM public.question_instances WHERE id = '${qt}'`);
  await serve(db, p, QM, "A");
  // Kun de serverede (og igen fjernede) testinstanser adskiller sig; svar, progression og quests ikke.
  const after = JSON.parse(await learning(db, p));
  const b = JSON.parse(before);
  assert.deepEqual(after.progress, b.progress);
  assert.deepEqual(after.daily, b.daily);
  assert.deepEqual(after.weekly, b.weekly);
  assert.deepEqual(after.attempts, b.attempts);
  assert.equal(after.instances.filter((i) => i.answered).length, b.instances.filter((i) => i.answered).length);
  assert.equal(JSON.stringify(await state(db, p)), stBefore, "afviste forsøg forlænger ikke pausen og tælles ikke");
  assert.equal((await events(db, p)).length, 1);
});

test("F2: afvisningen bærer det autoritative sluttidspunkt (DETAIL, UTC)", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 10);
  const until = (await state(db, p)).cooldown_until;
  const qi = await serve(db, p, QM, "A");
  const err = await mc(db, p, qi, "A").then(() => null, (e) => e);
  assert.ok(COOLDOWN_ERR(err));
  assert.equal(new Date(err.detail).getTime(), until.getTime());
});

test("G: efter 120 s accepteres svar igen og belønnes efter de normale regler", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 10);
  const qi = await serve(db, p, QM, "A");
  await advance(db, p, 119);
  await assert.rejects(mc(db, p, qi, "A"), COOLDOWN_ERR);
  await advance(db, p, 1);
  const xp = (await db.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
  assert.equal((await mc(db, p, qi, "A")).status, "correct");
  const xp2 = (await db.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
  assert.deepEqual([xp2.xp - xp.xp, xp2.coins - xp.coins], [10, 5], "uændret sats: +10 XP, +5 mønter");
});

test("H: fejlene, der udløste pausen, udløser ikke en ny — heller ikke når vinduet er længere end pausen", async () => {
  const db = await sharedDb();
  await withConfig(db, "cooldown_seconds = 30", async () => {   // konfigurerbarhed
  const p = await addPupil(db);
  await wrongTimes(db, p, 10);
  assert.equal((await state(db, p)).secs, 30);
  await advance(db, p, 30);                    // de ti fejl er 30 s gamle: stadig i 60 s-vinduet
  await wrong(db, p);
  let s = await state(db, p);
  assert.equal(s.active, false);
  assert.equal(s.n, 1, "kun fejlen efter pausen tæller");
  await wrongTimes(db, p, 8);
  assert.equal(await active(db, p), false);
  await wrong(db, p);
  assert.equal(await active(db, p), true, "ti NYE fejl giver en ny pause");
  assert.equal((await events(db, p)).length, 2);
  });
});

test("konfiguration: tærskel og vindue læses fra quiz_cooldown_config", async () => {
  const db = await sharedDb();
  await withConfig(db, "wrong_answer_threshold = 3, window_seconds = 10", async () => {
  const p = await addPupil(db);
  await wrongTimes(db, p, 2);
  await advance(db, p, 11);
  await wrongTimes(db, p, 2);
  assert.equal(await active(db, p), false);
  await wrong(db, p);
  assert.equal(await active(db, p), true);
  });
});

// ── 11.3 Dataintegritet ──────────────────────────────────────────────────────────────────────────

test("K: samme svar sendt to gange (gammel vej og H5-replay) registreres én gang", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  const qi = await serve(db, p, QM, "A");
  assert.equal((await mc(db, p, qi, "B")).status, "incorrect");
  assert.equal((await mc(db, p, qi, "B")).status, "incorrect");   // retry: CAS answered = false
  assert.equal((await state(db, p)).n, 1);
  const qi2 = await serve(db, p, QM, "A");
  const sub = randomUUID();
  assert.equal((await v2(db, p, qi2, "B", sub)).outcome, "recorded");
  assert.equal((await v2(db, p, qi2, "B", sub)).outcome, "replay");
  assert.equal((await state(db, p)).n, 2);
});

test("K2: replay af det tiende svar under pausen giver det oprindelige resultat og tæller ikke igen", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 9);
  const qi = await serve(db, p, QM, "A");
  const sub = randomUUID();
  assert.equal((await v2(db, p, qi, "B", sub)).outcome, "recorded");
  assert.equal(await active(db, p), true);
  const st = JSON.stringify(await state(db, p));
  const replay = await v2(db, p, qi, "B", sub);
  assert.equal(replay.outcome, "replay");
  assert.equal(replay.status, "incorrect");
  assert.equal(JSON.stringify(await state(db, p)), st);
  // Den gamle vej på et allerede besvaret spørgsmål: samme resultat, ingen ny registrering.
  assert.equal((await mc(db, p, qi, "B")).status, "incorrect");
  assert.equal(JSON.stringify(await state(db, p)), st);
});

test("M: en svarfunktion, der fejler, efterlader ingen falsk fejlregistrering", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  await wrongTimes(db, p, 3);
  const before = JSON.stringify(await state(db, p));
  // En teknisk fejl EFTER bedømmelsen i samme transaktion (streak-hjælperen kaster): alt rulles tilbage.
  await db.exec(`ALTER FUNCTION public.update_streak(uuid) RENAME TO update_streak_broken`);
  const qi = await serve(db, p, QM, "A");
  await assert.rejects(mc(db, p, qi, "B"));
  await db.exec(`ALTER FUNCTION public.update_streak_broken(uuid) RENAME TO update_streak`);
  assert.equal(JSON.stringify(await state(db, p)), before);
  // Et ukendt spørgsmål / en anden elevs spørgsmål: afvist før noget skrives.
  await assert.rejects(mc(db, p, randomUUID(), "B"), /Instance not found/);
  assert.equal(JSON.stringify(await state(db, p)), before);
});

test("N/O: lange svar og lærerbedømmelse tæller aldrig — heller ikke senere, og de spærres ikke under pausen", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  const teacher = uid(9999);
  await db.exec(`INSERT INTO auth.users VALUES ('${teacher}') ON CONFLICT DO NOTHING`);
  // Ni rigtige forkerte svar + et langt svar, som en lærer senere vurderer forkert.
  await wrongTimes(db, p, 9);
  const ql = await serve(db, p, QL, "-");
  await db.query("UPDATE public.question_instances SET user_answer = 'mit essay' WHERE id = $1", [ql]);   // afventer lærer
  assert.equal((await state(db, p)).n, 9);
  await db.query(`UPDATE public.question_instances SET answered = true, answered_at = now(), was_correct = false,
    teacher_score = 0, reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [ql, teacher]);
  assert.equal((await state(db, p)).n, 9, "lærerens senere 'forkert' tæller ikke");
  assert.equal(await active(db, p), false, "ingen tilbagevirkende pause");
  // Under en aktiv pause kan læreren stadig bedømme, og runder kan frigives (was_correct sættes ikke).
  await wrong(db, p);
  assert.equal(await active(db, p), true);
  const ql2 = await serve(db, p, QL, "-");
  await db.query(`UPDATE public.question_instances SET answered = true, was_correct = true, teacher_score = 3,
    reviewed_by = $2 WHERE id = $1`, [ql2, teacher]);
  const qr = await serve(db, p, QM, "A");
  await db.query("UPDATE public.question_instances SET answered = true, answered_at = now() WHERE id = $1", [qr]);
  // Kort tekst uden endelig bedømmelse (process_question_attempt's tekstgren: was_correct NULL) tæller ikke.
  await advance(db, p, 120);
  const qt = await serve(db, p, QT, "hund");
  assert.equal((await mc(db, p, qt, "kat")).status, "pending");
  assert.equal((await state(db, p)).n, 0);
});

test("kort tekst via process_text_answer tæller som forkert, når den automatiske bedømmelse siger forkert", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  for (let i = 0; i < 10; i++) await text(db, p, await serve(db, p, QT, "hund"), "kat", false);
  assert.equal(await active(db, p), true);
});

// ── 11.4 Sikkerhed ───────────────────────────────────────────────────────────────────────────────

test("P/R: elever kan ikke læse, skrive eller nulstille pausetilstand; get_my_quiz_cooldown viser kun egen pause", async () => {
  const db = await sharedDb();
  const a = await addPupil(db);
  const b = await addPupil(db);
  await wrongTimes(db, a, 10);
  for (const role of ["authenticated", "anon"]) {
    await db.exec(`SELECT set_config('test.uid', '${b}', false)`);
    await assert.rejects(as(db, role, "SELECT * FROM public.quiz_cooldown_state"), /permission denied/);
    await assert.rejects(as(db, role, "UPDATE public.quiz_cooldown_state SET cooldown_until = NULL"), /permission denied/);
    await assert.rejects(as(db, role, "DELETE FROM public.quiz_cooldown_state"), /permission denied/);
    await assert.rejects(as(db, role, "INSERT INTO public.quiz_cooldown_events (student_id, started_at, ends_at, reason_code) VALUES ($1, now(), now() + interval '1 s', 'wrong_answer_burst')", [b]), /permission denied/);
    await assert.rejects(as(db, role, "UPDATE public.quiz_cooldown_config SET wrong_answer_threshold = 1000"), /permission denied/);
    await assert.rejects(as(db, role, "SELECT public.quiz_cooldown_register()"), /permission denied|trigger functions can only be called as triggers/);
  }
  await assert.rejects(as(db, "anon", "SELECT public.get_my_quiz_cooldown()"), /permission denied/);
  // Svarfunktionerne er backend-only (eksisterende lockdown): en elev kan ikke svare for en anden.
  await db.exec(`SELECT set_config('test.uid', '${b}', false)`);
  const qa = await serve(db, a, QM, "A");
  await assert.rejects(as(db, "authenticated", "SELECT public.process_question_attempt($1, $2, 'A', 0)", [a, qa]), /permission denied/);
  // Egen status: B er ikke i pause, A er.
  const mine = async (who) => { await db.exec(`SELECT set_config('test.uid', '${who}', false)`); return (await as(db, "authenticated", "SELECT public.get_my_quiz_cooldown() AS r"))[0].r; };
  const sb = await mine(b);
  assert.deepEqual([sb.active, sb.ends_at], [false, null]);
  const sa = await mine(a);
  assert.equal(sa.active, true);
  assert.equal(new Date(sa.ends_at).getTime(), (await state(db, a)).cooldown_until.getTime());
  assert.equal(typeof sa.server_now, "string");
  assert.deepEqual(Object.keys(sa).sort(), ["active", "ends_at", "server_now"], "hverken tærskel, vindue eller antal fejl");
  await db.exec("SELECT set_config('test.uid', '', false)");
  const none = (await as(db, "authenticated", "SELECT public.get_my_quiz_cooldown() AS r"))[0].r;
  assert.equal(none.active, false);
});

test("Q: tid kommer kun fra serveren — svarfunktionernes klienttidsparameter påvirker hverken vindue eller pause", async () => {
  const db = await sharedDb();
  const p = await addPupil(db);
  for (let i = 0; i < 10; i++) {
    const qi = await serve(db, p, QM, "A");
    // p_question_shown_at er klientens ur; et vildt forkert ur ændrer intet.
    await as(db, "service_role", "SELECT public.process_question_attempt($1, $2, 'B', $3)", [p, qi, i % 2 ? 0 : 9_999_999_999_999]);
  }
  const s = await state(db, p);
  assert.equal(s.active, true);
  assert.equal(s.secs, 120);
});

// ── Regression ───────────────────────────────────────────────────────────────────────────────────

test("regression: uden pause giver svarvejene samme resultat og belønning med og uden migrationen", async () => {
  const run = async (withMigration) => {
    const db = await chainDb({ withMigration });
    const p = await addPupil(db);
    const out = [];
    for (const [q, key, ans] of [[QM, "A", "A"], [QM, "A", "B"], [QN, "4", "4"], [QN, "4", "5"]]) {
      out.push((await mc(db, p, await serve(db, p, q, key), ans)).status);
    }
    out.push((await text(db, p, await serve(db, p, QT, "hund"), "hund", true)).status ?? "ok");
    out.push((await v2(db, p, await serve(db, p, QM, "A"), "A")).outcome);
    const prog = (await db.query("SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak FROM public.student_progress WHERE student_id = $1", [p])).rows[0];
    const quests = (await db.query("SELECT count(*)::int AS n, sum(progress)::int AS s FROM public.student_quest_progress WHERE student_id = $1", [p])).rows[0];
    return JSON.stringify({ out, prog, quests });
  };
  assert.equal(await run(true), await run(false));
});
