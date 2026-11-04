// REAL PostgreSQL proof for migration 20261101210000_question_history_restrict (D-298 H2) — what PGlite
// cannot show: the SQLSTATE a real server returns, lock_timeout under a held lock, and atomic abort.
//
// Runs only when LEVEL_ENGINE_PG_URL points at a disposable PostgreSQL server (CI's unit job: PostgreSQL
// 17 service, LEVEL_ENGINE_PG_REQUIRED=1 — a missing server FAILS there). Otherwise SKIPPED with the
// reason. It creates its own database and drops it afterwards. Same harness rules as
// claim-daily-reward-concurrency.test.mjs. Synthetic rows only.
//
// What this proves on a real server:
//   1. Production's CASCADE (the fixture) deletes answer history with the question — the defect.
//   2. After the migration: deleting a question with history is refused and every history row stays;
//      archiving (is_active = false) works; a question without history can still be deleted.
//      SQLSTATE: PostgreSQL 17 — production's version — reports an ON DELETE RESTRICT refusal as 23503
//      (foreign_key_violation, "update or delete on table ... violates foreign key constraint"); PostgreSQL
//      18 (PGlite, question-history-restrict-migration-run) reports 23001 (restrict_violation). The
//      assertions pin the code, the constraint name and the message kind, so a refused DELETE cannot be
//      confused with a refused INSERT (also 23503).
//   3. lock_timeout: while another session holds a lock on question_instances, the migration aborts with
//      SQLSTATE 55P03 (lock_not_available) within seconds and changes NOTHING (still CASCADE); run again
//      after the lock is gone, it succeeds.
//   4. The documented rollback restores CASCADE exactly, no row changed.
//   5. Concurrency: a delete racing with a new answer waits and then is refused (history kept);
//      a late answer to a question deleted first fails with 23503 (no orphan).
//   6. ATOMIC whatever the runner does: wrapped in one transaction or autocommit, a lock on EITHER table
//      aborts with 55P03 within seconds and leaves BOTH constraints CASCADE; lock_timeout does not leak.
//   7. A forced failure of the SECOND change (orphan row in student_answers) rolls the FIRST change
//      back, in both models.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
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

const FILE = "supabase/migrations/20261101210000_question_history_restrict.sql";
const CASCADE = "FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE";
const RESTRICT = "FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT";
function rollbackSql() {
  const m = /```sql\n([\s\S]*?)```/.exec(read("docs/operations/question-history-restrict-rollback.md"));
  assert.ok(m && /ROLLBACK D-298 H2/.test(m[1]));
  return m[1];
}
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const Q_HIST = uid(1), Q_ANS = uid(2), Q_FREE = uid(3);
const SCHEMA = `
  CREATE TABLE public.questions (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.question_instances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid,
    answered boolean NOT NULL DEFAULT false,
    CONSTRAINT question_instances_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE);
  CREATE TABLE public.student_answers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid,
    CONSTRAINT student_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE);
  INSERT INTO public.questions (id) VALUES ('${Q_HIST}'), ('${Q_ANS}'), ('${Q_FREE}');
  INSERT INTO public.question_instances (question_id, answered) VALUES ('${Q_HIST}', true), ('${Q_HIST}', false);
  INSERT INTO public.student_answers (question_id) VALUES ('${Q_ANS}');`;

let dbUrl;
const opened = [];
const created = [];
async function newDb() {
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  const name = `h2_restrict_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  created.push(name);
  const u = new globalThis.URL(URL);
  u.pathname = `/${name}`;
  dbUrl = u.toString();
  const c = await connect();
  await c.query(SCHEMA);
  return c;
}
async function connect() {
  const c = new pg.Client({ connectionString: dbUrl });
  opened.push(c);
  await c.connect();
  return c;
}
async function teardown() {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
  if (!created.length) return;
  const admin = new pg.Client({ connectionString: URL });
  await admin.connect();
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
// apply_migration runs a file as one transaction; the same here.
const apply = (c, sql) => c.query(`BEGIN;\n${sql}\nCOMMIT;`).catch(async (e) => { await c.query("ROLLBACK").catch(() => {}); throw e; });
const defs = async (c) => (await c.query(`SELECT conrelid::regclass::text AS t, pg_get_constraintdef(oid) AS d
  FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.questions'::regclass ORDER BY 1`)).rows.map((r) => r.d);
const counts = async (c) => (await c.query(`SELECT (SELECT count(*) FROM public.questions)::int AS q,
  (SELECT count(*) FROM public.question_instances)::int AS i, (SELECT count(*) FROM public.student_answers)::int AS a`)).rows[0];
const sqlstate = async (p) => { try { await p; return null; } catch (e) { return e.code; } };
// The refusal of a DELETE on questions by ON DELETE RESTRICT, as PostgreSQL 17 reports it: SQLSTATE 23503,
// the referencing constraint named, and the "update or delete" form (an INSERT refusal says "insert or update").
const deleteRefused = async (p) => {
  try { await p; return null; } catch (e) {
    return { code: e.code, constraint: e.constraint, deleteForm: /^update or delete on table "questions" violates foreign key constraint/.test(e.message) };
  }
};

test("real PostgreSQL: H2 RESTRICT, SQLSTATEs, lock_timeout and rollback", { skip: SKIP, timeout: 120000 }, async (t) => {
  t.after(teardown);

  await t.test("1. the fixture is production's CASCADE: deleting a question deletes its history", async () => {
    const c = await newDb();
    assert.deepEqual(await defs(c), [CASCADE, CASCADE]);
    await c.query(`DELETE FROM public.questions WHERE id = '${Q_HIST}'`);
    assert.equal((await counts(c)).i, 0);
  });

  await t.test("2. after the migration: the delete is refused (PG17: 23503) and history kept; archiving works; no-history delete works", async () => {
    const c = await newDb();
    await apply(c, read(FILE));
    assert.deepEqual(await defs(c), [RESTRICT, RESTRICT]);
    const before = await counts(c);
    assert.deepEqual(await deleteRefused(c.query(`DELETE FROM public.questions WHERE id = '${Q_HIST}'`)),
      { code: "23503", constraint: "question_instances_question_id_fkey", deleteForm: true });
    assert.deepEqual(await deleteRefused(c.query(`DELETE FROM public.questions WHERE id = '${Q_ANS}'`)),
      { code: "23503", constraint: "student_answers_question_id_fkey", deleteForm: true });
    assert.deepEqual(await counts(c), before, "every history row stays");
    await c.query(`UPDATE public.questions SET is_active = false WHERE id IN ('${Q_HIST}', '${Q_ANS}')`);
    await c.query(`DELETE FROM public.questions WHERE id = '${Q_FREE}'`);
    assert.deepEqual(await counts(c), { ...before, q: before.q - 1 });
    assert.equal(await sqlstate(c.query(`INSERT INTO public.question_instances (question_id) VALUES ('${uid(99)}')`)), "23503");
  });

  await t.test("3. lock_timeout: a held lock aborts the migration (55P03) with no change; a re-run succeeds", async () => {
    const c = await newDb();
    const blocker = await connect();
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE public.question_instances IN ACCESS SHARE MODE");
    const started = Date.now();
    assert.equal(await sqlstate(apply(c, read(FILE))), "55P03");
    assert.ok(Date.now() - started < 30000, "aborts within seconds, not after a long queue");
    assert.deepEqual(await defs(c), [CASCADE, CASCADE], "nothing changed after the abort");
    await blocker.query("ROLLBACK");
    await apply(c, read(FILE));
    assert.deepEqual(await defs(c), [RESTRICT, RESTRICT]);
  });

  await t.test("5. concurrency: a delete racing with a new answer on the same question never loses history", async () => {
    // A question with no history yet. Session A serves it (uncommitted instance); session B deletes the
    // question. B must wait for A's row (the foreign-key check takes a KEY SHARE lock on the question),
    // then — A committed — be refused (PG17: 23503, update-or-delete form) and leave the new history in place.
    const c = await newDb();
    await apply(c, read(FILE));
    const a = await connect();
    const b = await connect();
    await a.query("BEGIN");
    await a.query(`INSERT INTO public.question_instances (question_id) VALUES ('${Q_FREE}')`);
    const deleting = deleteRefused(b.query(`DELETE FROM public.questions WHERE id = '${Q_FREE}'`));
    for (let i = 0; i < 200; i++) {
      const w = (await c.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)).rows[0].n;
      if (w >= 1) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    await a.query("COMMIT");
    assert.deepEqual(await deleting, { code: "23503", constraint: "question_instances_question_id_fkey", deleteForm: true },
      "the delete is refused once the answer exists");
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM public.question_instances WHERE question_id = '${Q_FREE}'`)).rows[0].n, 1);
    // The other order: the delete of a question WITHOUT history commits first; the late insert then fails
    // (23503) instead of creating an orphan.
    await c.query(`INSERT INTO public.questions (id) VALUES ('${uid(50)}')`);
    await b.query("BEGIN");
    await b.query(`DELETE FROM public.questions WHERE id = '${uid(50)}'`);
    const inserting = sqlstate(a.query(`INSERT INTO public.question_instances (question_id) VALUES ('${uid(50)}')`));
    await b.query("COMMIT");
    assert.equal(await inserting, "23503");
  });

  // ── Atomic whatever the runner does ────────────────────────────────────────────────────────────
  // Two transaction models a runner may use: the file wrapped in BEGIN … COMMIT, or every statement on
  // its own (autocommit — the file is ONE statement, so it runs in its own implicit transaction).
  const MODELS = {
    "wrapped in one transaction": (c, sql) => apply(c, sql),
    "autocommit (no wrapping)": (c, sql) => c.query(sql),
  };

  await t.test("6. lock_timeout applies in both models, also on the SECOND table; nothing changes; it does not leak", async () => {
    for (const [model, run] of Object.entries(MODELS)) {
      for (const table of ["question_instances", "student_answers"]) {
        const c = await newDb();
        const blocker = await connect();
        await blocker.query("BEGIN");
        await blocker.query(`LOCK TABLE public.${table} IN ACCESS SHARE MODE`);
        const started = Date.now();
        assert.equal(await sqlstate(run(c, read(FILE))), "55P03", `${model}, lock on ${table}`);
        assert.ok(Date.now() - started < 30000, `${model}, ${table}: aborts within seconds`);
        assert.deepEqual(await defs(c), [CASCADE, CASCADE], `${model}, lock on ${table}: the first table's change is rolled back too`);
        await blocker.query("ROLLBACK");
        if (model.startsWith("autocommit")) {
          assert.equal((await c.query("SHOW lock_timeout")).rows[0].lock_timeout, "0", "set_config(..., true) did not leak into the session");
        }
      }
    }
  });

  await t.test("7. a forced failure of the SECOND change rolls the FIRST one back, in both models", async () => {
    for (const [model, run] of Object.entries(MODELS)) {
      const c = await newDb();
      // An orphan student_answers row, inserted past the foreign-key triggers: re-validating the second
      // constraint (student_answers) must fail AFTER the first (question_instances) was already changed.
      await c.query("SET session_replication_role = replica");
      await c.query(`INSERT INTO public.student_answers (question_id) VALUES ('${uid(77)}')`);
      await c.query("SET session_replication_role = DEFAULT");
      const before = await counts(c);
      const e = await (async () => { try { await run(c, read(FILE)); return null; } catch (err) { return err; } })();
      assert.equal(e?.code, "23503", `${model}: the second constraint's validation fails`);
      assert.match(e.message, /student_answers/, `${model}: it is the second change that fails`);
      assert.deepEqual(await defs(c), [CASCADE, CASCADE], `${model}: the first change (question_instances) is rolled back`);
      assert.deepEqual(await counts(c), before, `${model}: no row changed`);
    }
  });

  await t.test("4. the documented rollback restores CASCADE exactly, no row changed", async () => {
    const c = await newDb();
    await apply(c, read(FILE));
    const before = await counts(c);
    await apply(c, rollbackSql());
    assert.deepEqual(await defs(c), [CASCADE, CASCADE]);
    assert.deepEqual(await counts(c), before);
  });
});
