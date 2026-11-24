// REAL PostgreSQL 17 proof for D-384 (F8), migration 20261124160000_course_round_parking.sql — what PGlite (one
// connection) cannot show: truly simultaneous requests for one pupil, as two tabs, a double click, a retry after a lost
// connection or a delayed answer from an old tab produce them.
//
//   1. Eight simultaneous parks: one parks, seven change nothing; one parked row.
//   2. Eight simultaneous resumes (two tabs in the same course, repeated requests): one resumes, seven say 'none'.
//   3. Park against an answer to the same round, 12 rounds: EXACTLY one wins each time — answered (and paid once) or
//      parked (and the answer refused with LQ409, nothing paid). Never both, never neither.
//   4. Resume against an answer to the active ordinary round: the course round is resumed only after the ordinary one
//      is answered ('resumed'), otherwise it stays parked ('other_active'); never two active rounds.
//   5. Two tabs in different courses resuming at the same time: one course active, the other parked; nothing lost.
//   6. Resume against a concurrent insert of a new active round (get-next-question takes no pupil lock): the insert wins
//      and resume answers 'other_active' (the unique index decides; the round stays parked).
//   7. The pupil lock is real: while one park is uncommitted, a resume for the same pupil WAITS (seen in
//      pg_stat_activity), and another pupil is never held up.
//   8. A connection lost in the middle of a park (the transaction never commits): nothing changed.
//   9. A delayed answer from an old tab: refused while parked; after resume it is the round's one answer (round_no is
//      unchanged, so H5's stale_round does not apply — parking is not a new round); a repeat of it pays nothing.
//
// Database: production's answer chain (helpers/answer-chain-schema.mjs) + D-280 part 1 + D-316 + D-383 + this file,
// UNMODIFIED. Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server; otherwise SKIPPED with the
// reason — unless LEVEL_ENGINE_PG_REQUIRED=1 (CI's PostgreSQL 17.6 service), where it FAILS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerChainSql, readMigration } from "./helpers/answer-chain-schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
function loadPg() {
  for (const base of [process.env.LEVEL_ENGINE_PG_MODULE_DIR, ROOT].filter(Boolean)) {
    try { return createRequire(join(base, "package.json"))("pg"); } catch { /* next */ }
  }
  return null;
}
const pg = URL ? loadPg() : null;
const SKIP = !URL ? "LEVEL_ENGINE_PG_URL is not set (needs a disposable real PostgreSQL server)"
  : !pg ? "the `pg` client cannot be resolved (set LEVEL_ENGINE_PG_MODULE_DIR)" : false;
const REQUIRED = process.env.LEVEL_ENGINE_PG_REQUIRED === "1";

test("a real PostgreSQL server is present where it is required (CI)", { skip: !REQUIRED }, () => {
  assert.equal(SKIP, false, `LEVEL_ENGINE_PG_REQUIRED=1, but: ${SKIP}`);
});

const CHAIN = ["20261031194600_mc_length_cue_answer_paths.sql", "20261102100000_release_open_rounds_on_inactive_questions.sql",
  "20261120150000_course_items_out_of_ordinary_quiz.sql", "20261124160000_course_round_parking.sql"];
const HISTORY = "kildekritik_ophav";
const MATH = "brøker_kursus";
const PARK = "SELECT public.park_open_course_round($1) AS r";
const RESUME = "SELECT public.resume_parked_course_round($1, $2, $3) AS r";
const ANSWER = "SELECT public.process_question_attempt($1, $2, $3, 0) AS r";

const created = [];
const opened = [];
async function connect(url, asService = true) {
  const c = new pg.Client({ connectionString: url });
  opened.push(c);
  await c.connect();
  c.on("error", () => {}); // a deliberately killed connection (case 8) must not crash the run
  if (asService) await c.query("SET ROLE service_role");
  return c;
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
async function createDb() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `parking_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const su = await connect(url, false);
  for (const sql of answerChainSql({ realServer: true })) await su.query(sql);
  for (const f of CHAIN) await su.query(`BEGIN;\n${readMigration(f)}\nCOMMIT;`);
  return { url, su };
}
/** One request on its own short-lived connection (closed afterwards, so 100+ requests never exhaust the server). */
async function once(url, sql, params) {
  const c = await connect(url);
  try { return await c.query(sql, params); } finally { opened.splice(opened.indexOf(c), 1); await c.end().catch(() => {}); }
}
const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? String(e.message); } };

test("real PostgreSQL 17: parking and resuming a course round under truly simultaneous requests", { skip: SKIP, timeout: 600000 }, async (t) => {
  t.after(teardown);
  const { url, su } = await createDb();
  const pupil = async () => {
    const id = randomUUID();
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 6)`, [id]);
    await su.query(`INSERT INTO public.student_progress (student_id) VALUES ($1)`, [id]);
    return id;
  };
  const question = async (objective, step = null) => {
    const id = randomUUID();
    await su.query(`INSERT INTO public.questions (id, type, content, metadata, difficulty, is_active, question_type, learning_objective,
        answer_format, answer_type, target_grade, difficulty_band, difficulty_level)
      VALUES ($1, 'mc_single', $2::jsonb, $3::jsonb, 1, true, 'auto', $4, 'mc', 'short', 5, 1, 1000)`,
    [id, JSON.stringify({ question: "Q " + id, options: ["a", "b"], correct: "a" }), JSON.stringify(step ? { learning_step: step } : {}), objective]);
    return id;
  };
  const serve = async (p, q) => (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at)
    VALUES ($1, $2, 'a', now()) RETURNING id`, [p, q])).rows[0].id;
  const state = async (p) => (await su.query(`SELECT count(*) FILTER (WHERE answered = false AND parked_at IS NULL)::int AS active,
      count(*) FILTER (WHERE parked_at IS NOT NULL)::int AS parked, count(*) FILTER (WHERE answered)::int AS answered, count(*)::int AS rows
    FROM public.question_instances WHERE student_id = $1`, [p])).rows[0];
  const xp = async (p) => (await su.query("SELECT xp::int FROM public.student_progress WHERE student_id = $1", [p])).rows[0].xp;
  const race = async (n, sql, paramsOf) => {
    const clients = [];
    for (let i = 0; i < n; i++) clients.push(await connect(url));
    const rs = await Promise.all(clients.map((c, i) => c.query(sql, paramsOf(i)).then((r) => r.rows[0].r, (e) => ({ error: e.code }))));
    for (const c of clients) { opened.splice(opened.indexOf(c), 1); await c.end().catch(() => {}); }
    return rs;
  };

  await t.test("1. eight simultaneous parks: one parks, seven change nothing", async () => {
    const p = await pupil();
    const c = await serve(p, await question(HISTORY, "guided_practice"));
    const rs = await race(8, PARK, () => [p]);
    assert.equal(rs.filter((r) => r === c).length, 1, JSON.stringify(rs));
    assert.equal(rs.filter((r) => r === null).length, 7);
    assert.deepEqual(await state(p), { active: 0, parked: 1, answered: 0, rows: 1 });
  });

  await t.test("2. eight simultaneous resumes in the same course: one resumes, seven say 'none'", async () => {
    const p = await pupil();
    await serve(p, await question(HISTORY, "guided_practice"));
    await once(url, PARK, [p]);
    const rs = await race(8, RESUME, () => [p, HISTORY, "guided_practice"]);
    assert.deepEqual(rs.slice().sort(), ["none", "none", "none", "none", "none", "none", "none", "resumed"]);
    assert.deepEqual(await state(p), { active: 1, parked: 0, answered: 0, rows: 1 });
  });

  await t.test("3. park against an answer to the same round (12 rounds): exactly one wins, paid at most once", async () => {
    const tally = { answered: 0, parked: 0 };
    for (let i = 0; i < 12; i++) {
      const p = await pupil();
      const c = await serve(p, await question(HISTORY, "guided_practice"));
      const before = await xp(p);
      const [a, b] = [await connect(url), await connect(url)];
      const [ans, prk] = await Promise.all([
        a.query(ANSWER, [p, c, "a"]).then(() => "ok", (e) => e.code),
        b.query(PARK, [p]).then((r) => r.rows[0].r, (e) => ({ error: e.code })),
      ]);
      await Promise.all([a, b].map((x) => x.end().catch(() => {})));
      const s = await state(p);
      if (ans === "ok") {
        tally.answered++;
        assert.equal(prk, null, "the park found nothing open to park");
        assert.deepEqual(s, { active: 0, parked: 0, answered: 1, rows: 1 });
        assert.ok(await xp(p) > before, "paid once");
      } else {
        tally.parked++;
        assert.equal(ans, "LQ409", "the answer reached a parked round");
        assert.equal(prk, c);
        assert.deepEqual(s, { active: 0, parked: 1, answered: 0, rows: 1 });
        assert.equal(await xp(p), before, "nothing paid");
      }
    }
    assert.equal(tally.answered + tally.parked, 12, JSON.stringify(tally));
  });

  await t.test("4. resume against an answer to the active ordinary round: resumed only after it, never two active rounds", async () => {
    for (let i = 0; i < 8; i++) {
      const p = await pupil();
      await serve(p, await question(HISTORY, "guided_practice"));
      await once(url, PARK, [p]);
      const o = await serve(p, await question("vikings"));
      const [a, b] = [await connect(url), await connect(url)];
      const [, res] = await Promise.all([a.query(ANSWER, [p, o, "a"]), b.query(RESUME, [p, HISTORY, "guided_practice"]).then((r) => r.rows[0].r)]);
      await Promise.all([a, b].map((x) => x.end().catch(() => {})));
      const s = await state(p);
      assert.ok(["resumed", "other_active"].includes(res), res);
      assert.deepEqual(s, res === "resumed" ? { active: 1, parked: 0, answered: 1, rows: 2 } : { active: 0, parked: 1, answered: 1, rows: 2 });
    }
  });

  await t.test("5. two tabs in different courses at the same time: one course active, the other parked, nothing lost", async () => {
    for (let i = 0; i < 8; i++) {
      const p = await pupil();
      await serve(p, await question(HISTORY, "guided_practice"));
      await once(url, PARK, [p]);
      await serve(p, await question(MATH, "guided_practice"));
      await once(url, PARK, [p]);
      const rs = await race(2, RESUME, (k) => [p, k === 0 ? HISTORY : MATH, "guided_practice"]);
      assert.ok(rs.includes("resumed"), JSON.stringify(rs));
      assert.deepEqual(await state(p), { active: 1, parked: 1, answered: 0, rows: 2 }, JSON.stringify(rs));
    }
  });

  await t.test("6. resume against an uncommitted insert of a new active round: the insert wins, resume says other_active", async () => {
    const p = await pupil();
    const c = await serve(p, await question(HISTORY, "guided_practice"));
    await once(url, PARK, [p]);
    const q = await question("vikings");
    const tab = await connect(url);
    await tab.query("BEGIN");
    await tab.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, next_review_at) VALUES ($1, $2, 'a', now())`, [p, q]);
    const resuming = once(url, RESUME, [p, HISTORY, "guided_practice"]).then((r) => r.rows[0].r);
    await new Promise((r) => setTimeout(r, 300));
    await tab.query("COMMIT");
    assert.equal(await resuming, "other_active");
    assert.deepEqual(await state(p), { active: 1, parked: 1, answered: 0, rows: 2 });
    assert.equal((await su.query("SELECT parked_at IS NOT NULL p FROM public.question_instances WHERE id = $1", [c])).rows[0].p, true);
  });

  await t.test("7. the pupil lock is real: a resume waits for an uncommitted park; another pupil is not held up", async () => {
    const p = await pupil();
    const other = await pupil();
    await serve(p, await question(HISTORY, "guided_practice"));
    await serve(other, await question(HISTORY, "guided_practice"));
    const holder = await connect(url);
    await holder.query("BEGIN");
    await holder.query(PARK, [p]);
    const waiter = await connect(url);
    const pid = (await waiter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const waiting = waiter.query(RESUME, [p, HISTORY, "guided_practice"]).then((r) => r.rows[0].r);
    let seen = null;
    for (let i = 0; i < 50 && !seen; i++) {
      await new Promise((r) => setTimeout(r, 100));
      seen = (await su.query("SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [pid])).rows[0] ?? null;
    }
    assert.deepEqual(seen, { wait_event_type: "Lock", wait_event: "advisory" }, "the second request waits on the pupil lock");
    assert.ok((await once(url, PARK, [other])).rows[0].r, "another pupil is parked meanwhile");
    await holder.query("COMMIT");
    assert.equal(await waiting, "resumed");
  });

  await t.test("8. a connection lost in the middle of a park: nothing changed", async () => {
    const p = await pupil();
    const c = await serve(p, await question(HISTORY, "guided_practice"));
    const lost = await connect(url);
    const pid = (await lost.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await lost.query("BEGIN");
    assert.equal((await lost.query(PARK, [p])).rows[0].r, c);
    await su.query("SELECT pg_terminate_backend($1)", [pid]);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(await state(p), { active: 1, parked: 0, answered: 0, rows: 1 });
    assert.equal((await once(url, PARK, [p])).rows[0].r, c, "and the next request parks it normally (no lock left behind)");
  });

  await t.test("9. a delayed answer from an old tab: refused while parked; after resume it is the one answer; a repeat pays nothing", async () => {
    const p = await pupil();
    const c = await serve(p, await question(HISTORY, "guided_practice"));
    await once(url, PARK, [p]);
    const before = await xp(p);
    assert.equal(await code(once(url, ANSWER, [p, c, "a"])), "LQ409");
    assert.equal(await xp(p), before);
    assert.equal((await once(url, RESUME, [p, HISTORY, "guided_practice"])).rows[0].r, "resumed");
    const rs = await race(4, ANSWER, () => [p, c, "a"]);
    const after = await xp(p);
    assert.ok(after > before);
    assert.deepEqual(await state(p), { active: 0, parked: 0, answered: 1, rows: 1 });
    assert.equal(rs.filter((r) => r && r.error).length, 0, JSON.stringify(rs));
    const again = await xp(p);
    await code(once(url, ANSWER, [p, c, "a"]));
    assert.equal(await xp(p), again, "paid exactly once across five deliveries of the same answer");
  });
});
