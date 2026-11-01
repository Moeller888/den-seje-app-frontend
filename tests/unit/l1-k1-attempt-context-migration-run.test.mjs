// RUNTIME proof for migration 20261101220000_l1_k1_attempt_context (L1 K1), PGlite.
//
// Built on the MERGED H5 chain (helpers/h5-integration-chain.mjs): production's order G1 → H5 bootstrap
// → H5 alignment, and the repository's order, each followed by K1. The migration file and the
// documented rollback run UNMODIFIED. Synthetic pupils only.
//
// What this proves (L1-A acceptance criteria named in the PR):
//   * K1 adds exactly the six columns with their constraints; both _v2 functions are replaced with the
//     two new parameters; the old signatures are gone; EXECUTE stays service_role only.
//   * The new bodies are the old ones plus ONLY K1's lines (textual proof), and answers grade, pay,
//     advance streak and quests, replay, refuse stale rounds and conflicting submissions exactly as before.
//   * mode / hints_used are validated (refused, never defaulted) and stored as the server passed them;
//     server_interval_ms only on the first round, capped; question_content_sha256 deterministic and
//     changes with the content; objective columns stay NULL (no retroactive fill); append-only holds.
//   * The guard refuses a non-empty history or unknown bodies with no change; a re-run changes nothing;
//     the rollback restores H5's exact schema and refuses once an attempt exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  REPO_ORDER, PROD_ORDER, ALIGN, MC_V2, TEXT_V2, MD5, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const K1 = "20261101220000_l1_k1_attempt_context.sql";
const K1_SQL = () => migrationSql(K1);
const MC_K1 = "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)";
const TEXT_K1 = "public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)";
const NEW_MD5 = { mc: "c4fde09c4c7f13c8a9905e9f8b763296", text: "6877fdfa91ec30bd06e099f21ac840ad" };

function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(readFileSync(join(ROOT, "docs/operations/l1-k1-attempt-context-rollback.md"), "utf8").split("\r\n").join("\n"));
  assert.ok(m && /ROLLBACK L1 K1/.test(m[1]));
  return m[1];
}
async function chain(order) {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  for (const f of order) await db.exec(migrationSql(f));
  return db;
}
const withK1 = async (order = PROD_ORDER) => { const db = await chain(order); await db.exec(K1_SQL()); return db; };
const md5Of = async (db, sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;
const srcOf = async (db, sig) => (await db.query("SELECT prosrc AS s FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.s ?? null;
const fingerprint = async (db) => (await db.query(FINGERPRINT_SQL)).rows[0].f;

let nextPupil = 2000;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
async function serve(db, pupil, qIndex, { repeat = 0, createdAgo = null } = {}) {
  const key = TOP10_BEFORE[qIndex].content.correct;
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
    answered, next_review_at, created_at) VALUES ($1, $2, $3, $4, false, now(), now() - coalesce($5::interval, '0'))
    RETURNING id`, [pupil, TOP10_ID[qIndex], key, repeat, createdAgo])).rows[0].id;
}
async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
// The same call on both generations: the old signature, or K1's with the server's mode and hints.
const mcOld = async (db, p, qi, a, round, sub) =>
  (await as(db, "service_role", `SELECT public.process_question_attempt_v2($1,$2,$3,$4,$5,NULL,NULL) AS r`, [p, qi, a, round, sub]))[0].r;
const mcNew = async (db, p, qi, a, round, sub, mode = "quiz_v1", hints = 0) =>
  (await as(db, "service_role", `SELECT public.process_question_attempt_v2($1,$2,$3,$4,$5,NULL,NULL,$6,$7) AS r`, [p, qi, a, round, sub, mode, hints]))[0].r;
async function effects(db, pupil) {
  const rows = async (sql) => (await db.query(sql, [pupil])).rows;
  return {
    progress: await rows(`SELECT xp, coins, correct_answers, total_correct_answers, current_streak, longest_streak FROM public.student_progress WHERE student_id = $1`),
    instances: await rows(`SELECT answered, user_answer, was_correct, repeat_count FROM public.question_instances WHERE student_id = $1 ORDER BY question_id`),
    daily: await rows(`SELECT d.quest_key, p.progress FROM public.student_quest_progress p JOIN public.daily_quests d ON d.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
    weekly: await rows(`SELECT w.quest_key, p.progress FROM public.student_weekly_quest_progress p JOIN public.weekly_quests w ON w.id = p.quest_id WHERE p.student_id = $1 ORDER BY 1`),
    attempts: await rows(`SELECT attempt_no, grading, status, was_correct, user_answer, is_repeat, correct_answer_shown,
      xp_awarded, coins_awarded, source FROM public.question_attempts WHERE student_id = $1 ORDER BY created_at, attempt_no`),
  };
}

// A scenario run on one database through `call`: first answers right and wrong, a replay, a conflicting
// submission, a stale round after a reopen, and a correct repeat.
async function scenario(db, call) {
  const p = await addPupil(db);
  const out = [];
  const right = TOP10_BEFORE[0].content.correct;
  const qi1 = await serve(db, p, 0);
  const sub = randomUUID();
  out.push((await call(db, p, qi1, right, 1, sub)));
  out.push((await call(db, p, qi1, right, 1, sub)));            // replay
  out.push((await call(db, p, qi1, right, 1, randomUUID())));   // round closed
  const qi2 = await serve(db, p, 1);
  out.push((await call(db, p, qi2, "forkert svar", 1, randomUUID())));
  await db.exec(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = '${qi1}'`);
  out.push((await call(db, p, qi1, right, 1, randomUUID())));   // stale round
  out.push((await call(db, p, qi1, right, 2, randomUUID())));   // correct repeat
  return { outcomes: out, effects: await effects(db, p) };
}

test("the file: unique version after the H5 alignment, not replayed until applied, D-110 header", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes(K1));
  assert.equal(files.filter((f) => f.slice(0, 14) === K1.slice(0, 14)).length, 1, "version unique");
  assert.ok(K1 > ALIGN, "after the H5 alignment");
  assert.match(NOT_IN_PRODUCTION[K1] ?? "", /not applied in production/);
  const read = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
  assert.equal(planReplay(files, read).plan.find((p) => p.file === K1).action, "skip");
  const sql = K1_SQL();
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  assert.equal(/db\s+push/i.test(sql.replace(/^\s*--.*$/gm, "")), false);
});

test("schema: six columns with their constraints; old signatures gone; new bodies; EXECUTE service_role only", async () => {
  for (const order of [PROD_ORDER, REPO_ORDER]) {
    const db = await withK1(order);
    const cols = (await db.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'question_attempts' AND column_name IN ('mode','hints_used','server_interval_ms','objective_ids',
      'objective_mapping_version','question_content_sha256') ORDER BY column_name`)).rows;
    assert.deepEqual(cols.map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default]), [
      ["hints_used", "smallint", "NO", null], ["mode", "text", "NO", null], ["objective_ids", "ARRAY", "YES", null],
      ["objective_mapping_version", "integer", "YES", null], ["question_content_sha256", "text", "NO", null],
      ["server_interval_ms", "integer", "YES", null]]);
    assert.equal(await md5Of(db, MC_V2), null, "old MC signature gone");
    assert.equal(await md5Of(db, TEXT_V2), null, "old text signature gone");
    assert.equal(await md5Of(db, MC_K1), NEW_MD5.mc);
    assert.equal(await md5Of(db, TEXT_K1), NEW_MD5.text);
    for (const sig of [MC_K1, TEXT_K1]) {
      for (const [role, can] of [["anon", false], ["authenticated", false], ["service_role", true]]) {
        assert.equal((await db.query(`SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS x`)).rows[0].x, can, `${role} ${sig}`);
      }
    }
  }
});

test("textually: each new body is the old body plus ONLY K1's lines", async () => {
  const before = await chain(PROD_ORDER);
  const after = await withK1();
  const k1Only = /K1|p_mode|p_hints_used|v_content_sha|v_interval|invalid_mode|invalid_hints|END IF;|interval from|on mastery, level|integer range|jsonb_build_object\('content'|THEN least\(|^\s*END;$|^\s*$|^\s*--|^\s*misconception_type_shown, answered_at, xp_awarded, coins_awarded, source,$|^\s*mode, hints_used, server_interval_ms, question_content_sha256\)$|'process_(question_attempt|text_answer)_v2',$|^\s*SELECT q\.answer_format, q\.answer_type, q\.content$|^\s*INTO v_format, v_type, v_content$|^\s*v_content\s+jsonb;$/;
  for (const [oldSig, newSig] of [[MC_V2, MC_K1], [TEXT_V2, TEXT_K1]]) {
    const oldL = (await srcOf(before, oldSig)).split("\n");
    const newL = (await srcOf(after, newSig)).split("\n");
    // Every old line appears in the new body in order, except the lines K1 had to extend.
    const extended = [/^\s*misconception_type_shown, answered_at, xp_awarded, coins_awarded, source\)$/,
      /'process_(question_attempt|text_answer)_v2'\)$/, /^\s*SELECT q\.answer_format, q\.answer_type$/, /^\s*INTO v_format, v_type$/];
    let j = 0;
    for (const line of oldL) {
      if (extended.some((r) => r.test(line))) continue;
      while (j < newL.length && newL[j] !== line) {
        assert.match(newL[j], k1Only, `${newSig}: unexpected new line ${JSON.stringify(newL[j])}`);
        j++;
      }
      assert.ok(j < newL.length, `${newSig}: old line missing ${JSON.stringify(line)}`);
      j++;
    }
  }
});

test("behaviour: grading, amounts, streak, quests, replay, round_closed and stale_round are unchanged", async () => {
  const strip = (r) => { const { ...x } = r; return x; };
  const a = await scenario(await chain(PROD_ORDER), mcOld);
  const b = await scenario(await withK1(), (db, p, qi, ans, round, sub) => mcNew(db, p, qi, ans, round, sub));
  assert.deepEqual(b.outcomes.map(strip), a.outcomes.map(strip));
  assert.deepEqual(b.effects, a.effects);
  assert.deepEqual(a.outcomes.map((o) => o.outcome), ["recorded", "replay", "round_closed", "recorded", "stale_round", "recorded"]);
});

test("mode and hints: stored as the server passed them; unknown values refused with nothing written", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  for (const [mode, hints, reason] of [["guessed", 0, "invalid_mode"], [null, 0, "invalid_mode"], ["QUIZ_V1", 0, "invalid_mode"],
    ["quiz_v1", 4, "invalid_hints"], ["quiz_v1", -1, "invalid_hints"], ["quiz_v1", null, "invalid_hints"]]) {
    const qi = await serve(db, p, 2);
    const r = await mcNew(db, p, qi, "x", 1, randomUUID(), mode, hints);
    assert.deepEqual(r, { outcome: "invalid_request", reason }, `${mode}/${hints}`);
    await db.exec(`DELETE FROM public.question_instances WHERE id = '${qi}'`);
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.question_attempts")).rows[0].n, 0);
  for (const [i, mode, hints] of [[3, "diagnostic", 0], [4, "practice", 2]]) {
    const qi = await serve(db, p, i);
    assert.equal((await mcNew(db, p, qi, TOP10_BEFORE[i].content.correct, 1, randomUUID(), mode, hints)).outcome, "recorded");
  }
  const rows = (await db.query("SELECT mode, hints_used, objective_ids, objective_mapping_version FROM public.question_attempts ORDER BY created_at")).rows;
  assert.deepEqual(rows, [{ mode: "diagnostic", hints_used: 0, objective_ids: null, objective_mapping_version: null },
    { mode: "practice", hints_used: 2, objective_ids: null, objective_mapping_version: null }]);
});

test("server_interval_ms: first round only, from the server's own rows, capped; NULL on repeats", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  const right = TOP10_BEFORE[5].content.correct;
  const qi = await serve(db, p, 5, { createdAgo: "90 seconds" });
  await mcNew(db, p, qi, right, 1, randomUUID());
  await db.exec(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = '${qi}'`);
  await mcNew(db, p, qi, right, 2, randomUUID());
  const old = await serve(db, p, 6, { createdAgo: "60 days" });
  await mcNew(db, p, old, "x", 1, randomUUID());
  const r = (await db.query(`SELECT question_instance_id = '${qi}' AS first, attempt_no, server_interval_ms FROM public.question_attempts ORDER BY created_at`)).rows;
  assert.ok(r[0].server_interval_ms >= 90000 && r[0].server_interval_ms < 3600000, String(r[0].server_interval_ms));
  assert.equal(r[1].attempt_no, 2);
  assert.equal(r[1].server_interval_ms, null);
  assert.equal(r[2].server_interval_ms, 2147483647, "capped, never an overflow error");
  await assert.rejects(db.exec(`INSERT INTO public.question_attempts SELECT * FROM public.question_attempts LIMIT 0`).then(() =>
    db.exec(`ALTER TABLE public.question_attempts DISABLE TRIGGER question_attempts_append_only;
      UPDATE public.question_attempts SET server_interval_ms = 5 WHERE attempt_no = 2`)), /question_attempts_interval_first_round_check/);
});

test("question_content_sha256: the server's content and key, deterministic, changes with the content", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  const right = TOP10_BEFORE[7].content.correct;
  const a = await serve(db, p, 7); await mcNew(db, p, a, right, 1, randomUUID());
  const q = await addPupil(db);
  const b = await serve(db, q, 7); await mcNew(db, q, b, right, 1, randomUUID());
  await db.exec(`UPDATE public.questions SET content = jsonb_set(content, '{question}', '"Rettet tekst"') WHERE id = '${TOP10_ID[7]}'`);
  const c = await serve(db, (await addPupil(db)), 7);
  await mcNew(db, (await db.query(`SELECT student_id FROM public.question_instances WHERE id = '${c}'`)).rows[0].student_id, c, right, 1, randomUUID());
  const shas = (await db.query("SELECT question_content_sha256 AS s FROM public.question_attempts ORDER BY created_at")).rows.map((r) => r.s);
  assert.equal(shas[0], shas[1], "same content and key → same fingerprint");
  assert.notEqual(shas[2], shas[0], "a content correction changes it");
  const expected = (await db.query(`SELECT encode(sha256(convert_to(jsonb_build_object('content', q.content, 'correct_answer', qi.correct_answer)::text, 'UTF8')), 'hex') AS s
    FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = '${c}'`)).rows[0].s;
  assert.equal(shas[2], expected);
});

test("text path: process_text_answer_v2 stores mode, hints, interval and fingerprint the same way", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  await db.exec(`UPDATE public.questions SET answer_format = 'text', content = content - 'options' WHERE id = '${TOP10_ID[8]}'`);
  const qi = await serve(db, p, 8);
  const r = (await as(db, "service_role", `SELECT public.process_text_answer_v2($1,$2,'svar',true,1,$3,NULL,NULL,'check',1) AS r`, [qi, p, randomUUID()]))[0].r;
  assert.equal(r.outcome, "recorded");
  const row = (await db.query("SELECT mode, hints_used, server_interval_ms IS NOT NULL AS has_interval, length(question_content_sha256) AS l, source FROM public.question_attempts")).rows[0];
  assert.deepEqual(row, { mode: "check", hints_used: 1, has_interval: true, l: 64, source: "process_text_answer_v2" });
  const bad = (await as(db, "service_role", `SELECT public.process_text_answer_v2($1,$2,'svar',true,1,$3,NULL,NULL,'nope',0) AS r`, [qi, p, randomUUID()]))[0].r;
  assert.deepEqual(bad, { outcome: "invalid_request", reason: "invalid_mode" });
});

test("guard: a non-empty history or unknown bodies abort with no change; a re-run changes nothing", async () => {
  const withRow = await chain(PROD_ORDER);
  const p = await addPupil(withRow);
  const qi = await serve(withRow, p, 9);
  await mcOld(withRow, p, qi, "x", 1, randomUUID());
  const fp = await fingerprint(withRow);
  await assert.rejects(withRow.exec(K1_SQL()), /K1: question_attempts har 1 række\(r\)/);
  assert.deepEqual(await fingerprint(withRow), fp);

  const unaligned = await chain(PROD_ORDER.filter((f) => f !== ALIGN));
  const fp2 = await fingerprint(unaligned);
  await assert.rejects(unaligned.exec(K1_SQL()), /K1: process_question_attempt_v2 har ikke H5-alignmentens krop/);
  assert.deepEqual(await fingerprint(unaligned), fp2);

  const done = await withK1();
  const fp3 = await fingerprint(done);
  await done.exec(K1_SQL());
  assert.deepEqual(await fingerprint(done), fp3, "a second run changes nothing");
});

test("rollback: restores H5's exact schema while empty; refuses once an attempt exists", async () => {
  const h5 = await chain(PROD_ORDER);
  const db = await withK1();
  await db.exec(rollbackSql());
  assert.deepEqual(await fingerprint(db), await fingerprint(h5));
  assert.equal(await md5Of(db, MC_V2), MD5.mcV2Aligned);
  assert.equal(await md5Of(db, TEXT_V2), MD5.textV2);

  const used = await withK1();
  const p = await addPupil(used);
  await mcNew(used, p, await serve(used, p, 0), "x", 1, randomUUID());
  const fp = await fingerprint(used);
  await assert.rejects(used.exec(rollbackSql()), /K1 rollback: question_attempts har 1 række\(r\); historik slettes ikke/);
  assert.deepEqual(await fingerprint(used), fp);
});

test("append-only: K1's columns cannot be changed after the fact", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  await mcNew(db, p, await serve(db, p, 1), "x", 1, randomUUID(), "practice", 1);
  await assert.rejects(db.exec("UPDATE public.question_attempts SET mode = 'check'"), /append-only/);
  await assert.rejects(db.exec("UPDATE public.question_attempts SET objective_ids = ARRAY[gen_random_uuid()], objective_mapping_version = 1"), /append-only/);
});
