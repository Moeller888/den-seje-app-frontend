// Anti-gætte-pausen under samtidighed (test I/L/K) på en RIGTIG PostgreSQL 17 med flere forbindelser —
// PGlite har kun én. Kører produktionens svarkæde (helpers/h5-integration-chain.mjs, PROD_ORDER) +
// migration 20261105130000_quiz_anti_guess_cooldown.sql. Springes over uden LEVEL_ENGINE_PG_URL; CI's
// unit-job sætter den (samme ordning som question-attempts-v2-bootstrap-concurrency.test.mjs).
//
// Hvad der bevises:
//   1. Det tiende forkerte svar sendt 8 gange samtidig (to faner, netværks-retry) på den gamle vej:
//      præcis én registrering, én pause, én hændelse; resten ændrer intet.
//   2. Samme på H5-vejen med samme submission_id: 1 recorded + 7 replay, én registrering, én pause.
//   3. To FORSKELLIGE åbne spørgsmål besvaret samtidig som 10. og 11. fejl (idx_one_open_question er
//      fjernet i testdatabasen for at prøve triggerens egen elev-lås): det svar, der får låsen først,
//      registreres og starter pausen; det andet venter på låsen, ser pausen og afvises (LQ429) uden
//      at noget gemmes. Deterministisk: præcis én af hver, uanset rækkefølge.
//   4. To elever på samme tid påvirker ikke hinanden.
//   5. Tilbagerulning (docs/operations/quiz-anti-guess-cooldown-rollback.sql), mens et svar holder en lås på
//      question_instances: scriptet venter højst lock_timeout (5 s), giver op og ændrer intet.
//   6. Tilbagerulning under trafik: et svar, der kommer, mens scriptet kører, venter på låsen og lykkes
//      bagefter uden pause; alle D-350-objekter er væk, og elevens tidligere svar er uændrede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { withTop10, PROD_ORDER, uid, baseSql, migrationSql } from "./helpers/h5-integration-chain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const URL = process.env.LEVEL_ENGINE_PG_URL ?? "";
const COOLDOWN_FILE = "20261105130000_quiz_anti_guess_cooldown.sql";
const ROLLBACK = readFileSync(join(ROOT, "docs", "operations", "quiz-anti-guess-cooldown-rollback.sql"), "utf8");
const PLACEHOLDER = "c_events_exported CONSTANT bigint := -1;";
const rollbackWith = (n) => {
  if (!ROLLBACK.includes(PLACEHOLDER)) throw new Error("pladsholderen mangler i rollback-scriptet");
  return ROLLBACK.replace(PLACEHOLDER, `c_events_exported CONSTANT bigint := ${n};`);
};

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

const created = [];
const opened = [];
async function connect(url, asService = true) {
  const c = new pg.Client({ connectionString: url });
  opened.push(c);
  await c.connect();
  if (asService) await c.query("SET ROLE service_role");
  return c;
}
async function done(...clients) {
  for (const c of clients) {
    const i = opened.indexOf(c);
    if (i >= 0) opened.splice(i, 1);
    await c.end().catch(() => {});
  }
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}

const POOL = Array.from({ length: 40 }, (_, i) => uid(9600 + i));
const SEED = `INSERT INTO public.questions (id, type, content, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, metadata, difficulty_level) VALUES
  ${POOL.map((id, i) => `('${id}', 'mc', '{"type":"mc","question":"Samtidig ${i}?","options":["A","B"],"correct":"A"}',
    1, true, 'auto', 'samtidig-${i}', 'mc', 'short', '{}', 1000)`).join(",\n  ")};`;

test("real PostgreSQL 17: anti-gætte-pausen er atomisk og deterministisk under samtidige svar", { skip: SKIP, timeout: 300000 }, async (t) => {
  t.after(teardown);

  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `quiz_cooldown_conc_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const su = await connect(url, false);
  for (const sql of baseSql({ realServer: true })) await su.query(sql);
  for (const f of withTop10(PROD_ORDER)) await su.query(migrationSql(f));
  await su.query(SEED);
  await su.query(migrationSql(COOLDOWN_FILE));

  let n = 900;
  const used = new Map();
  const pupil = async () => {
    const id = uid(n++);
    await su.query("INSERT INTO auth.users VALUES ($1)", [id]);
    await su.query("INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 5)", [id]);
    await su.query(`INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ($1, 100, 50, 0, 0, 1, 1, current_date - 1)`, [id]);
    return id;
  };
  const serve = async (p) => {
    const i = used.get(p) ?? 0;
    used.set(p, i + 1);
    return (await su.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered)
      VALUES ($1, $2, 'A', false) RETURNING id`, [p, POOL[i]])).rows[0].id;
  };
  const MC = "SELECT public.process_question_attempt($1, $2, $3, 0) AS r";
  const V2 = "SELECT public.process_question_attempt_v2($1, $2, $3, 1, $4, null, null) AS r";
  const svc = await connect(url);   // backend-rollen, som process-event
  const wrong = async (p, k) => { for (let i = 0; i < k; i++) await svc.query(MC, [p, await serve(p), "B"]); };
  const view = async (p) => (await su.query(`SELECT cardinality(s.recent_wrong_at) AS recent, (s.cooldown_until > now()) IS TRUE AS active,
      (SELECT count(*)::int FROM public.quiz_cooldown_events e WHERE e.student_id = s.student_id) AS events,
      (SELECT count(*)::int FROM public.question_instances qi WHERE qi.student_id = s.student_id AND qi.answered AND qi.was_correct = false) AS wrong_answered,
      (SELECT xp FROM public.student_progress WHERE student_id = s.student_id) AS xp
    FROM public.quiz_cooldown_state s WHERE s.student_id = $1`, [p])).rows[0];
  const waitForLockWaiters = async (count) => {
    for (let i = 0; i < 400; i++) {
      const w = (await su.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
      if (w >= count) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail(`expected ${count} sessions waiting on a lock`);
  };
  // Hold a lock while the calls start, so they all really run at the same time, then release it.
  const contend = async (lockSql, lockArgs, calls) => {
    const blocker = await connect(url, false);
    await blocker.query("BEGIN");
    await blocker.query(lockSql, lockArgs);
    const sessions = await Promise.all(calls.map(() => connect(url)));
    const running = calls.map((call, i) => call(sessions[i]).then((r) => ({ ok: r }), (e) => ({ err: e })));
    await waitForLockWaiters(calls.length);
    await blocker.query("COMMIT");
    try { return await Promise.all(running); } finally { await done(blocker, ...sessions); }
  };

  await t.test("1. det tiende forkerte svar sendt 8 gange samtidig (gammel vej): én registrering, én pause", async () => {
    const p = await pupil();
    await wrong(p, 9);
    const qi = await serve(p);
    const results = await contend("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi],
      Array.from({ length: 8 }, () => (c) => c.query(MC, [p, qi, "B"])));
    assert.deepEqual(results.filter((r) => r.err).map((r) => r.err.message), [], "ingen afvisning: det er samme svar");
    for (const r of results) assert.equal(r.ok.rows[0].r.status, "incorrect");
    const v = await view(p);
    assert.equal(v.active, true);
    assert.equal(v.events, 1);
    assert.equal(v.wrong_answered, 10);
  });

  await t.test("2. samme submission_id 8 gange samtidig (H5): 1 recorded + 7 replay, én pause", async () => {
    const p = await pupil();
    await wrong(p, 9);
    const qi = await serve(p);
    const sub = randomUUID();
    const results = await contend("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi],
      Array.from({ length: 8 }, () => (c) => c.query(V2, [p, qi, "B", sub])));
    const outcomes = results.map((r) => r.ok?.rows[0].r.outcome ?? `ERR ${r.err?.code}`).sort();
    assert.deepEqual(outcomes, ["recorded", ...Array(7).fill("replay")]);
    const v = await view(p);
    assert.equal(v.active, true);
    assert.equal(v.events, 1);
    assert.equal((await su.query("SELECT count(*)::int AS n FROM public.question_attempts WHERE student_id = $1", [p])).rows[0].n, 1,
      "de ni første gik den gamle vej; det tiende er ét forsøg");
  });

  await t.test("3. to forskellige åbne spørgsmål samtidig som 10. og 11. fejl: præcis én registreres, én afvises", async () => {
    await su.query("DROP INDEX IF EXISTS public.idx_one_open_question");
    try {
      for (const round of [1, 2, 3]) {
        const p = await pupil();
        await wrong(p, 9);
        const a = await serve(p);
        const b = await serve(p);
        const xpBefore = (await view(p)).xp;
        const results = await contend("SELECT 1 FROM public.quiz_cooldown_state WHERE student_id = $1 FOR UPDATE", [p], [
          (c) => c.query(MC, [p, a, "B"]),
          (c) => c.query(MC, [p, b, "A"]),      // et RIGTIGT svar må heller ikke slippe igennem
        ]);
        const ok = results.filter((r) => r.ok);
        const refused = results.filter((r) => r.err);
        assert.equal(refused.length + ok.length, 2);
        for (const r of refused) assert.equal(r.err.code, "LQ429", `runde ${round}: ${r.err.message}`);
        const v = await view(p);
        if (ok.length === 1 && ok[0] === results[0]) {
          // Den forkerte fik låsen først: pause, og det rigtige svar blev afvist uden belønning.
          assert.equal(v.active, true);
          assert.equal(v.events, 1);
          assert.equal(v.xp, xpBefore);
          assert.equal((await su.query("SELECT answered FROM public.question_instances WHERE id = $1", [b])).rows[0].answered, false);
        } else {
          // Det rigtige svar fik låsen først (tæller ikke), så kom den 10. fejl: pause.
          assert.equal(ok.length, 2, `runde ${round}`);
          assert.equal(v.active, true);
          assert.equal(v.events, 1);
        }
      }
    } finally {
      await su.query("CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances USING btree (student_id) WHERE (answered = false)").catch(() => {});
    }
  });

  await t.test("3b. to forkerte på to åbne spørgsmål samtidig som 10. og 11.: én pause, den anden afvist", async () => {
    await su.query("DROP INDEX IF EXISTS public.idx_one_open_question");
    try {
      const p = await pupil();
      await wrong(p, 9);
      const a = await serve(p);
      const b = await serve(p);
      const results = await contend("SELECT 1 FROM public.quiz_cooldown_state WHERE student_id = $1 FOR UPDATE", [p], [
        (c) => c.query(MC, [p, a, "B"]),
        (c) => c.query(MC, [p, b, "B"]),
      ]);
      assert.equal(results.filter((r) => r.ok).length, 1);
      assert.equal(results.filter((r) => r.err?.code === "LQ429").length, 1);
      const v = await view(p);
      assert.deepEqual([v.active, v.events, v.wrong_answered], [true, 1, 10]);
    } finally {
      await su.query("CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances USING btree (student_id) WHERE (answered = false)").catch(() => {});
    }
  });

  await t.test("4. to elever samtidig: hver sin pause, ingen påvirker den anden", async () => {
    const p1 = await pupil();
    const p2 = await pupil();
    await wrong(p1, 9);
    await wrong(p2, 3);
    const q1 = await serve(p1);
    const q2 = await serve(p2);
    const s1 = await connect(url);
    const s2 = await connect(url);
    await Promise.all([s1.query(MC, [p1, q1, "B"]), s2.query(MC, [p2, q2, "B"])]);
    await done(s1, s2);
    assert.equal((await view(p1)).active, true);
    const v2 = await view(p2);
    assert.deepEqual([v2.active, v2.recent, v2.events], [false, 4, 0]);
  });
  // ── Tilbagerulning på rigtig PostgreSQL (skal være de sidste deltests: 6 fjerner D-350) ──
  const d350 = async () => (await su.query(`SELECT
      (to_regclass('public.quiz_cooldown_state') IS NOT NULL)::int + (to_regclass('public.quiz_cooldown_events') IS NOT NULL)::int
      + (to_regclass('public.quiz_cooldown_config') IS NOT NULL)::int + (to_regprocedure('public.get_my_quiz_cooldown()') IS NOT NULL)::int
      + (SELECT count(*)::int FROM pg_trigger WHERE tgrelid = 'public.question_instances'::regclass
           AND tgname IN ('quiz_cooldown_guard', 'quiz_cooldown_register')) AS n`)).rows[0].n;
  const eventsNow = async () => (await su.query("SELECT count(*)::int AS n FROM public.quiz_cooldown_events")).rows[0].n;

  await t.test("5. tilbagerulning, mens et svar holder en lås: venter højst 5 s, giver op, intet ændret", async () => {
    const p = await pupil();
    await wrong(p, 10);
    const qi = await serve(p);
    const blocker = await connect(url, false);
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM public.question_instances WHERE id = $1 FOR UPDATE", [qi]);
    const rb = await connect(url, false);
    const t0 = Date.now();
    try {
      await assert.rejects(rb.query(rollbackWith(await eventsNow())), (e) => e?.code === "55P03", "lock_timeout");
      const waited = Date.now() - t0;
      assert.ok(waited >= 4500 && waited < 15000, `ventede ${waited} ms`);
    } finally {
      await blocker.query("ROLLBACK");
      await done(blocker, rb);
    }
    assert.equal(await d350(), 6, "alt står der stadig");
    assert.equal((await view(p)).active, true, "pausen håndhæves stadig");
  });

  await t.test("6. tilbagerulning under trafik: et svar, der kommer imens, venter og lykkes bagefter uden pause", async () => {
    const p = await pupil();
    await wrong(p, 10);
    const before = (await su.query(`SELECT md5(string_agg(qi::text, ',' ORDER BY qi.id)) AS h
      FROM public.question_instances qi WHERE qi.student_id = $1`, [p])).rows[0].h;
    const qi = await serve(p);
    const rb = await connect(url, false);
    const answerer = await connect(url);
    try {
      await rb.query("BEGIN");
      await rb.query(rollbackWith(await eventsNow()));             // holder låsene til COMMIT
      const pending = answerer.query(MC, [p, qi, "A"]).then((r) => ({ ok: r }), (e) => ({ err: e }));
      await waitForLockWaiters(1);
      await rb.query("COMMIT");
      const r = await pending;
      assert.equal(r.err, undefined, r.err?.message);
      assert.equal(r.ok.rows[0].r.status, "correct", "svaret accepteres; ingen pause efter tilbagerulning");
    } finally {
      await done(rb, answerer);
    }
    assert.equal(await d350(), 0, "alle D-350-objekter er væk");
    const after = (await su.query(`SELECT md5(string_agg(qi::text, ',' ORDER BY qi.id)) AS h
      FROM public.question_instances qi WHERE qi.student_id = $1 AND qi.id <> $2`, [p, qi])).rows[0].h;
    assert.equal(after, before, "elevens tidligere svar er uændrede");
  });
});
