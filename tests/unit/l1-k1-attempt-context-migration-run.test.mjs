// RUNTIME proof for migration 20261103110000_l1_k1_attempt_context (L1 K1), PGlite.
//
// Built on the MERGED H5 chain (helpers/h5-integration-chain.mjs) in production's order G1 → H5 bootstrap
// → H5 alignment → D-327 (and the repository's order), each followed by K1. The migration file and the
// documented rollback run UNMODIFIED. Synthetic pupils only.
//
// What this proves:
//   * Schema: the six attempt columns (question_content_sha256 now NULLABLE = unknown version), the three
//     served_* columns on question_instances (all or none), the snapshot trigger; old _v2 signatures gone;
//     EXECUTE service_role only; the trigger function callable by no API role.
//   * Behaviour unchanged: grading, amounts, streak, quests, replay, round_closed, stale_round.
//   * DELIVERED VERSION (owner decision 2, 2026-11-03):
//       - an insert WITH get-next-question's proposal gets a snapshot of exactly the locked question row;
//         a proposal that differs from the row (a concurrent edit) is refused (40001) and writes nothing;
//       - an insert without a proposal, or of an answered row, has NO snapshot (unknown, never guessed);
//       - within a round the snapshot never changes: a content edit, a reload (any later UPDATE), a direct
//         attempt to overwrite it, or a later re-key leave it byte for byte; only a key re-written in the
//         SAME transaction that opened the round is folded in (D-280's reopen);
//       - a reopen takes a new snapshot of the current row; the earlier round's fingerprint stays in its
//         attempt row;
//       - _v2 grades AND fingerprints from the snapshot: after an edit A → B, the round delivered as A is
//         graded against A, and its attempt carries A's fingerprint;
//       - a round without a snapshot (older instances) is graded as before and stores NULL — unknown.
//   * server_interval_ms: first round only, 0…3 600 000 ms; negative or above one hour is NULL (no clipping).
//   * Learning objectives: both NULL, or ≥ 1 element, no NULL element, version ≥ 1 — everything else refused.
//   * Guards: no D-327, non-empty history, unknown bodies → abort, nothing changed; a re-run changes nothing.
//   * Rollback restores H5 + D-327 exactly while empty; refuses once an attempt exists. Append-only holds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  REPO_ORDER, PROD_ORDER, ALIGN, MC_V2, TEXT_V2, MD5, TOP10_BEFORE, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL,
} from "./helpers/h5-integration-chain.mjs";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const K1 = "20261103110000_l1_k1_attempt_context.sql";
const D327 = "20261103100000_question_attempts_history_no_action.sql";
const K1_SQL = () => migrationSql(K1);
const MC_K1 = "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)";
const TEXT_K1 = "public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)";
const SNAP_FN = "public.question_instances_served_snapshot()";
const NEW_MD5 = { mc: "439186fa94119fec02b8f282eb75dbbd", text: "809675f9071eb2a62d1c9a9b2628bc84", snap: "babbb196f07c4fb60e42ff9e917bf180" };
const PROD = [...PROD_ORDER, D327];
const REPO = [...REPO_ORDER, D327];

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
const withK1 = async (order = PROD) => { const db = await chain(order); await db.exec(K1_SQL()); return db; };
const md5Of = async (db, sig) => (await db.query("SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.h ?? null;
const srcOf = async (db, sig) => (await db.query("SELECT prosrc AS s FROM pg_proc WHERE oid = to_regprocedure($1)", [sig])).rows[0]?.s ?? null;
const fingerprint = async (db) => (await db.query(FINGERPRINT_SQL)).rows[0].f;
const code = async (p) => { try { await p; return null; } catch (e) { return e.code; } };

let nextPupil = 2000;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
// An instance WITHOUT a delivery proposal (fixtures, an older get-next-question): unknown version.
async function serve(db, pupil, qIndex, { repeat = 0, createdAgo = null } = {}) {
  const key = TOP10_BEFORE[qIndex].content.correct;
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count,
    answered, next_review_at, created_at) VALUES ($1, $2, $3, $4, false, now(), now() - coalesce($5::interval, '0'))
    RETURNING id`, [pupil, TOP10_ID[qIndex], key, repeat, createdAgo])).rows[0].id;
}
// What get-next-question does with K1_SERVED_SNAPSHOT=on: it proposes exactly the row it built the response
// from (content, metadata, answer_format, answer_type) — `row` defaults to the current question row.
async function serveDelivered(db, pupil, qIndex, { row = null, key = null } = {}) {
  const q = row ?? (await db.query("SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1", [TOP10_ID[qIndex]])).rows[0];
  const proposal = { content: q.content, metadata: q.metadata, answer_format: q.answer_format, answer_type: q.answer_type };
  return (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at, served_snapshot)
    VALUES ($1, $2, $3, now(), $4::jsonb) RETURNING id`, [pupil, TOP10_ID[qIndex], key ?? q.content.correct, JSON.stringify(proposal)])).rows[0].id;
}
const snapOf = async (db, qi) => (await db.query(`SELECT served_snapshot AS s, served_content_sha256 AS h, served_at AS t
  FROM public.question_instances WHERE id = $1`, [qi])).rows[0];
async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const mcOld = async (db, p, qi, a, round, sub) =>
  (await as(db, "service_role", `SELECT public.process_question_attempt_v2($1,$2,$3,$4,$5,NULL,NULL) AS r`, [p, qi, a, round, sub]))[0].r;
const mcNew = async (db, p, qi, a, round, sub = randomUUID(), mode = "quiz_v1", hints = 0) =>
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
async function scenario(db, call, serveFn = serve) {
  const p = await addPupil(db);
  const out = [];
  const right = TOP10_BEFORE[0].content.correct;
  const qi1 = await serveFn(db, p, 0);
  const sub = randomUUID();
  out.push((await call(db, p, qi1, right, 1, sub)));
  out.push((await call(db, p, qi1, right, 1, sub)));            // replay
  out.push((await call(db, p, qi1, right, 1, randomUUID())));   // round closed
  const qi2 = await serveFn(db, p, 1);
  out.push((await call(db, p, qi2, "forkert svar", 1, randomUUID())));
  await db.exec(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = '${qi1}'`);
  out.push((await call(db, p, qi1, right, 1, randomUUID())));   // stale round
  out.push((await call(db, p, qi1, right, 2, randomUUID())));   // correct repeat
  return { outcomes: out, effects: await effects(db, p) };
}

test("the file: unique version after D-327, not replayed until applied, one atomic DO block, D-110 header", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes(K1));
  assert.equal(files.filter((f) => f.slice(0, 14) === K1.slice(0, 14)).length, 1, "version unique");
  assert.ok(K1 > ALIGN && K1 > D327, "after the H5 alignment and D-327");
  assert.match(NOT_IN_PRODUCTION[K1] ?? "", /not applied in production/);
  const read = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
  assert.equal(planReplay(files, read).plan.find((p) => p.file === K1).action, "skip");
  const sql = K1_SQL();
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.match(body, /^DO \$k1\$[\s\S]*\$k1\$;$/, "one DO block");
  assert.match(body, /BEGIN\s*PERFORM set_config\('lock_timeout', '5s', true\);/);
  assert.doesNotMatch(body, /^\s*SET\s+(LOCAL\s+)?lock_timeout/im);
  assert.equal(/db\s+push/i.test(sql.replace(/^\s*--.*$/gm, "")), false);
});

test("schema: attempt columns, served_* columns, trigger; old signatures gone; EXECUTE service_role only", async () => {
  for (const order of [PROD, REPO]) {
    const db = await withK1(order);
    const cols = (await db.query(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE (table_name = 'question_attempts' AND column_name IN ('mode','hints_used','server_interval_ms','objective_ids',
      'objective_mapping_version','question_content_sha256'))
         OR (table_name = 'question_instances' AND column_name IN ('served_snapshot','served_content_sha256','served_at'))
      ORDER BY table_name, column_name`)).rows;
    assert.deepEqual(cols.map((c) => [c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default]), [
      ["question_attempts", "hints_used", "smallint", "NO", null], ["question_attempts", "mode", "text", "NO", null],
      ["question_attempts", "objective_ids", "ARRAY", "YES", null], ["question_attempts", "objective_mapping_version", "integer", "YES", null],
      ["question_attempts", "question_content_sha256", "text", "YES", null], ["question_attempts", "server_interval_ms", "integer", "YES", null],
      ["question_instances", "served_at", "timestamp with time zone", "YES", null],
      ["question_instances", "served_content_sha256", "text", "YES", null], ["question_instances", "served_snapshot", "jsonb", "YES", null]]);
    assert.equal(await md5Of(db, MC_V2), null, "old MC signature gone");
    assert.equal(await md5Of(db, TEXT_V2), null, "old text signature gone");
    assert.deepEqual([await md5Of(db, MC_K1), await md5Of(db, TEXT_K1), await md5Of(db, SNAP_FN)], [NEW_MD5.mc, NEW_MD5.text, NEW_MD5.snap]);
    for (const sig of [MC_K1, TEXT_K1]) {
      for (const [role, can] of [["anon", false], ["authenticated", false], ["service_role", true]]) {
        assert.equal((await db.query(`SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS x`)).rows[0].x, can, `${role} ${sig}`);
      }
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal((await db.query(`SELECT has_function_privilege('${role}', '${SNAP_FN}', 'EXECUTE') AS x`)).rows[0].x, false, role);
    }
    // The delivered version carries the key: no API role but the backend may read it.
    for (const col of ["served_snapshot", "served_content_sha256", "served_at"]) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal((await db.query(`SELECT has_column_privilege('${role}', 'public.question_instances', '${col}', 'SELECT') AS x`)).rows[0].x, false, `${role} ${col}`);
      }
    }
    const t = (await db.query(`SELECT pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE tgname = 'question_instances_served_snapshot'`)).rows[0];
    assert.match(t.d, /BEFORE INSERT OR UPDATE ON public\.question_instances FOR EACH ROW EXECUTE FUNCTION question_instances_served_snapshot\(\)/);
  }
});

test("textually: each new body is the old body plus ONLY K1's lines", async () => {
  const before = await chain(PROD);
  const after = await withK1();
  const k1Only = /K1|p_mode|p_hints_used|v_content_sha|v_interval|invalid_mode|invalid_hints|served_snapshot|served_content_sha256|served_at|END IF;|^\s*END;$|^\s*$|^\s*--|^\s*misconception_type_shown, answered_at, xp_awarded, coins_awarded, source,$|^\s*mode, hints_used, server_interval_ms, question_content_sha256\)$|'process_(question_attempt|text_answer)_v2',$|^\s*SELECT q\.answer_format, q\.answer_type, q\.content$|^\s*INTO v_format, v_type, v_content$|^\s*v_content\s+jsonb;$/;
  for (const [oldSig, newSig] of [[MC_V2, MC_K1], [TEXT_V2, TEXT_K1]]) {
    const oldL = (await srcOf(before, oldSig)).split("\n");
    const newL = (await srcOf(after, newSig)).split("\n");
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

test("behaviour: grading, amounts, streak, quests, replay, round_closed and stale_round are unchanged — with and without a snapshot", async () => {
  const a = await scenario(await chain(PROD), mcOld);
  const b = await scenario(await withK1(), (db, p, qi, ans, round, sub) => mcNew(db, p, qi, ans, round, sub));
  const c = await scenario(await withK1(), (db, p, qi, ans, round, sub) => mcNew(db, p, qi, ans, round, sub), serveDelivered);
  assert.deepEqual(b.outcomes, a.outcomes);
  assert.deepEqual(b.effects, a.effects);
  assert.deepEqual(c.outcomes, a.outcomes);
  assert.deepEqual(c.effects, a.effects);
  assert.deepEqual(a.outcomes.map((o) => o.outcome), ["recorded", "replay", "round_closed", "recorded", "stale_round", "recorded"]);
});

test("delivery: a proposal equal to the locked row is snapshotted; a differing one is refused (40001); none → unknown", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  const qi = await serveDelivered(db, p, 2);
  const s = await snapOf(db, qi);
  const q = (await db.query("SELECT content, metadata, answer_format, answer_type FROM public.questions WHERE id = $1", [TOP10_ID[2]])).rows[0];
  assert.deepEqual(s.s, { ...q, correct_answer: TOP10_BEFORE[2].content.correct });
  const textSha = (await db.query("SELECT encode(sha256(convert_to(served_snapshot::text, 'UTF8')), 'hex') AS h FROM public.question_instances WHERE id = $1", [qi])).rows[0].h;
  assert.equal(s.h, textSha);
  assert.ok(s.t instanceof Date);

  // A proposal built from a version that is no longer the row (a concurrent edit): refused, nothing written.
  const p2 = await addPupil(db);
  const stale = { ...q, content: { ...q.content, question: "en ældre version" } };
  const before = (await db.query("SELECT count(*)::int AS n FROM public.question_instances")).rows[0].n;
  assert.equal(await code(serveDelivered(db, p2, 2, { row: stale })), "40001");
  assert.equal(await code(serveDelivered(db, p2, 2, { row: { ...q, metadata: { ...(q.metadata ?? {}), x: 1 } } })), "40001");
  assert.equal(await code(serveDelivered(db, p2, 2, { row: { ...q, answer_format: "number" } })), "40001");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.question_instances")).rows[0].n, before);

  // No proposal (older get-next-question, fixtures) and an answered insert: unknown, all three NULL.
  const legacy = await serve(db, p2, 3);
  assert.deepEqual(await snapOf(db, legacy), { s: null, h: null, t: null });
  const answered = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered, user_answer,
    next_review_at, served_snapshot) VALUES ($1, $2, 'x', true, 'x', now(), '{"content":{}}'::jsonb) RETURNING id`, [p2, TOP10_ID[4]])).rows[0].id;
  assert.deepEqual(await snapOf(db, answered), { s: null, h: null, t: null });
});

test("delivery: within a round nothing re-versions the snapshot; _v2 grades and fingerprints the DELIVERED version", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  const A = (await db.query("SELECT content FROM public.questions WHERE id = $1", [TOP10_ID[3]])).rows[0].content;
  const qi = await serveDelivered(db, p, 3);
  const delivered = await snapOf(db, qi);
  // The question is edited to B — the correct option changes — after delivery.
  const B = { ...A, correct: `${A.correct} (rettet)`, options: A.options.map((o) => (o === A.correct ? `${A.correct} (rettet)` : o)) };
  await db.query("UPDATE public.questions SET content = $2::jsonb WHERE id = $1", [TOP10_ID[3], JSON.stringify(B)]);
  // A reload / any later update of the open round, and a direct attempt to overwrite the snapshot.
  await db.query("UPDATE public.question_instances SET next_review_at = now() WHERE id = $1", [qi]);
  await db.query(`UPDATE public.question_instances SET served_snapshot = '{"content":"forfalsket"}', served_content_sha256 = repeat('0', 64), served_at = now() - interval '1 day' WHERE id = $1`, [qi]);
  assert.deepEqual(await snapOf(db, qi), delivered, "the delivered version stays byte for byte");
  // Graded against A: A's correct option is right.
  const r = await mcNew(db, p, qi, A.correct, 1);
  assert.deepEqual([r.outcome, r.status], ["recorded", "correct"]);
  const att = (await db.query("SELECT question_content_sha256 AS h FROM public.question_attempts WHERE question_instance_id = $1", [qi])).rows[0];
  assert.equal(att.h, delivered.h, "the attempt carries the delivered fingerprint, not B's");
  // A second pupil delivered B after the edit: graded against B.
  const p2 = await addPupil(db);
  const qi2 = await serveDelivered(db, p2, 3);
  assert.equal((await mcNew(db, p2, qi2, A.correct, 1)).status, "incorrect");
  assert.notEqual((await snapOf(db, qi2)).h, delivered.h);
});

test("delivery: a reopen takes a new snapshot; the earlier round's fingerprint stays in its attempt; same-transaction re-key folds in", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  const qi = await serveDelivered(db, p, 4);
  const A = await snapOf(db, qi);
  await mcNew(db, p, qi, TOP10_BEFORE[4].content.correct, 1);
  await db.query(`UPDATE public.questions SET content = jsonb_set(content, '{question}', '"Ny ordlyd"') WHERE id = $1`, [TOP10_ID[4]]);
  // Reopen and re-key in ONE transaction, as D-280's repeat functions do.
  await db.exec("BEGIN");
  await db.query("UPDATE public.question_instances SET answered = false, repeat_count = 1, user_answer = NULL WHERE id = $1", [qi]);
  await db.query("UPDATE public.question_instances SET correct_answer = 'nøgle-efter-genåbning' WHERE id = $1", [qi]);
  await db.exec("COMMIT");
  const B = await snapOf(db, qi);
  assert.notEqual(B.h, A.h);
  assert.equal(B.s.content.question, "Ny ordlyd");
  assert.equal(B.s.correct_answer, "nøgle-efter-genåbning", "the same-transaction re-key is part of the delivered round");
  // A re-key in a LATER transaction does not re-version the round.
  await db.query("UPDATE public.question_instances SET correct_answer = 'senere-nøgle' WHERE id = $1", [qi]);
  assert.deepEqual(await snapOf(db, qi), B);
  await mcNew(db, p, qi, "nøgle-efter-genåbning", 2);
  const atts = (await db.query("SELECT attempt_no, question_content_sha256 AS h, status FROM public.question_attempts WHERE question_instance_id = $1 ORDER BY attempt_no", [qi])).rows;
  assert.deepEqual(atts.map((a) => [a.attempt_no, a.h]), [[1, A.h], [2, B.h]], "round 1 keeps A, round 2 has B");
  assert.equal(atts[1].status, "correct", "graded against the delivered key of round 2");
});

test("older instances: no snapshot → graded as before, fingerprint NULL (unknown), never a guessed hash", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  const qi = await serve(db, p, 5, { createdAgo: "2 minutes" });
  const r = await mcNew(db, p, qi, TOP10_BEFORE[5].content.correct, 1);
  assert.deepEqual([r.outcome, r.status], ["recorded", "correct"]);
  const a = (await db.query("SELECT question_content_sha256 AS h, server_interval_ms AS i FROM public.question_attempts WHERE question_instance_id = $1", [qi])).rows[0];
  assert.equal(a.h, null);
  assert.ok(a.i >= 120000 && a.i < 3600000, String(a.i));
});

test("server_interval_ms: first round only; 0…1 h; negative or above one hour is NULL — never clipped", async () => {
  const db = await withK1();
  const right = TOP10_BEFORE[6].content.correct;
  const cases = [["90 seconds", (v) => v >= 90000 && v < 3600000], ["59 minutes", (v) => v >= 3540000 && v <= 3600000],
    ["61 minutes", (v) => v === null], ["60 days", (v) => v === null], ["-5 minutes", (v) => v === null]];
  for (const [ago, ok] of cases) {
    const p = await addPupil(db);                     // one instance per pupil and question
    const qi = await serve(db, p, 6, { createdAgo: ago });
    await mcNew(db, p, qi, right, 1);
    const v = (await db.query("SELECT server_interval_ms AS v FROM public.question_attempts WHERE question_instance_id = $1", [qi])).rows[0].v;
    assert.ok(ok(v), `${ago}: ${v}`);
    await db.exec(`UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = '${qi}'`);
    await mcNew(db, p, qi, right, 2);
    assert.equal((await db.query("SELECT server_interval_ms AS v FROM public.question_attempts WHERE question_instance_id = $1 AND attempt_no = 2", [qi])).rows[0].v, null, "repeats: NULL");
    await db.exec(`DELETE FROM public.question_attempts WHERE question_instance_id = '${qi}'`).catch(() => {});
  }
  assert.match((await db.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'question_attempts_server_interval_ms_check'`)).rows[0].d,
    /server_interval_ms >= 0\) AND \(server_interval_ms <= 3600000/);
});

test("learning objectives: both NULL, or ≥ 1 element, no NULL element and version ≥ 1 — everything else refused", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  await mcNew(db, p, await serveDelivered(db, p, 7), "x", 1);
  const base = (await db.query("SELECT * FROM public.question_attempts LIMIT 1")).rows[0];
  const insert = (ids, version, n) => db.query(`INSERT INTO public.question_attempts
    SELECT gen_random_uuid(), question_instance_id, student_id, attempt_no + $3, gen_random_uuid(), grading, status, was_correct, user_answer,
      answer_format, answer_type, is_repeat, correct_answer_shown, review_text_shown, misconception_type_shown, answered_at, xp_awarded,
      coins_awarded, source, created_at, mode, hints_used, NULL, $1::uuid[], $2::integer, question_content_sha256
    FROM public.question_attempts WHERE id = $4`, [ids, version, n, base.id]);
  const g = randomUUID();
  assert.equal(await code(insert(null, null, 10)), null, "both NULL: allowed");
  assert.equal(await code(insert([g], 1, 11)), null, "one objective, version 1: allowed");
  assert.equal(await code(insert([], 1, 12)), "23514", "an empty array is not a mapping");
  assert.equal(await code(insert([g, null], 1, 13)), "23514", "no NULL element");
  assert.equal(await code(insert([g], 0, 14)), "23514", "version ≥ 1");
  assert.equal(await code(insert([g], null, 15)), "23514", "an array without a version");
  assert.equal(await code(insert(null, 1, 16)), "23514", "a version without an array");
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

test("text path: process_text_answer_v2 routes from the delivered version and stores its fingerprint", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  await db.exec(`UPDATE public.questions SET answer_format = 'text', content = content - 'options' WHERE id = '${TOP10_ID[8]}'`);
  const qi = await serveDelivered(db, p, 8);
  const delivered = await snapOf(db, qi);
  // Changing the question's format after delivery must not change the round's route.
  await db.exec(`UPDATE public.questions SET answer_format = 'number' WHERE id = '${TOP10_ID[8]}'`);
  const r = (await as(db, "service_role", `SELECT public.process_text_answer_v2($1,$2,'svar',true,1,$3,NULL,NULL,'check',1) AS r`, [qi, p, randomUUID()]))[0].r;
  assert.equal(r.outcome, "recorded");
  const row = (await db.query("SELECT mode, hints_used, server_interval_ms IS NOT NULL AS has_interval, question_content_sha256 AS h, source FROM public.question_attempts")).rows[0];
  assert.deepEqual(row, { mode: "check", hints_used: 1, has_interval: true, h: delivered.h, source: "process_text_answer_v2" });
  const bad = (await as(db, "service_role", `SELECT public.process_text_answer_v2($1,$2,'svar',true,1,$3,NULL,NULL,'nope',0) AS r`, [qi, p, randomUUID()]))[0].r;
  assert.deepEqual(bad, { outcome: "invalid_request", reason: "invalid_mode" });
});

test("guard: no D-327, a non-empty history or unknown bodies abort with no change; a re-run changes nothing", async () => {
  const noD327 = await chain(PROD_ORDER);
  const fp0 = await fingerprint(noD327);
  await assert.rejects(noD327.exec(K1_SQL()), /K1: D-327 \(20261103100000\) er ikke anvendt/);
  assert.deepEqual(await fingerprint(noD327), fp0);

  const withRow = await chain(PROD);
  const p = await addPupil(withRow);
  const qi = await serve(withRow, p, 9);
  await mcOld(withRow, p, qi, "x", 1, randomUUID());
  const fp = await fingerprint(withRow);
  await assert.rejects(withRow.exec(K1_SQL()), /K1: question_attempts har 1 række\(r\)/);
  assert.deepEqual(await fingerprint(withRow), fp);

  const done = await withK1();
  const fp3 = await fingerprint(done);
  await done.exec(K1_SQL());
  assert.deepEqual(await fingerprint(done), fp3, "a second run changes nothing");
});

test("rollback: restores H5 + D-327 exactly while empty; refuses once an attempt exists", async () => {
  const h5 = await chain(PROD);
  const db = await withK1();
  await db.exec(rollbackSql());
  assert.deepEqual(await fingerprint(db), await fingerprint(h5));
  assert.equal(await md5Of(db, MC_V2), MD5.mcV2Aligned);
  assert.equal(await md5Of(db, TEXT_V2), MD5.textV2);

  const used = await withK1();
  const p = await addPupil(used);
  await mcNew(used, p, await serve(used, p, 0), "x", 1);
  const fp = await fingerprint(used);
  await assert.rejects(used.exec(rollbackSql()), /K1 rollback: question_attempts har 1 række\(r\); historik slettes ikke/);
  assert.deepEqual(await fingerprint(used), fp);
});

test("append-only: K1's columns cannot be changed after the fact", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  await mcNew(db, p, await serveDelivered(db, p, 1), "x", 1, randomUUID(), "practice", 1);
  await assert.rejects(db.exec("UPDATE public.question_attempts SET mode = 'check'"), /append-only/);
  await assert.rejects(db.exec("UPDATE public.question_attempts SET question_content_sha256 = repeat('a', 64)"), /append-only/);
  await assert.rejects(db.exec("UPDATE public.question_attempts SET objective_ids = ARRAY[gen_random_uuid()], objective_mapping_version = 1"), /append-only/);
});

test("the snapshot fingerprint is sha256 of the stored snapshot text — reproducible outside the database", async () => {
  const db = await withK1();
  const p = await addPupil(db);
  const qi = await serveDelivered(db, p, 0);
  const row = (await db.query("SELECT served_snapshot::text AS t, served_content_sha256 AS h FROM public.question_instances WHERE id = $1", [qi])).rows[0];
  assert.equal(createHash("sha256").update(row.t, "utf8").digest("hex"), row.h);
});
