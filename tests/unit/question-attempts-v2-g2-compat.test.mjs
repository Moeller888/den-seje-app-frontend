// D-290 G2 × H5 compatibility (owner, 2026-11-01: G2 must be applicable BEFORE H5). PGlite, every file
// UNMODIFIED: G2 (20261101140000, guard trigger + deactivation), the H5 bootstrap (20261101190000) and
// the alignment (20261101190100), in every order production or the repository can apply them.
//
// What it proves:
//   1. G2 → H5 and H5 → G2 (and G2 anywhere in between, and the repository's file order) all end in
//      the SAME public schema; G2 adds exactly its trigger and its function, nothing else.
//   2. The bootstrap accepts G2's guard ONLY exactly as reviewed: a changed body, EXECUTE for an API
//      role, another security mode, search_path or owner, another trigger shape (columns, timing,
//      WHEN, disabled), the trigger without its function or the function without its trigger, a second
//      object under either name, or any other extra trigger — each stops the bootstrap, in both of its
//      states (H5 absent: production; H5 present: repository), and changes nothing.
//   3. Re-running the bootstrap and the alignment on the final schema changes nothing.
//   4. Both guards work together on the final schema: G2's guard refuses a new open round on an
//      inactive question (insert and reopen); H5's round guard refuses a reopen that skips the round;
//      a correct reopen and _v2's answer pass both; question_attempts stays append-only.
//   5. Rollback: H5's documented rollback restores the G2-only schema and the two files apply again;
//      G2's documented guard rollback leaves exactly the H5-only schema, and the bootstrap still
//      verifies it.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x, one connection, superuser. The same orders, the SQLSTATEs
// and the refusal on a real server: question-attempts-v2-g2-compat-pg.test.mjs (PostgreSQL 17 in CI).
// Passing is not permission to apply: each file needs its own owner authorisation (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  H5, D278, D280_PATHS, G1, BOOTSTRAP, ALIGN, PROD_ORDER, MC_V2, TOP10_ID, uid, baseSql, migrationSql, FINGERPRINT_SQL, ROLLBACK_SQL,
} from "./helpers/h5-integration-chain.mjs";
import {
  G2, G2_TRIGGER, G2_FUNCTION, G2_GUARD_MD5, ORDERS, G2_BEFORE_H5, H5_BEFORE_G2, G2_IDS, G2_SEED_SQL, G2_GUARD_ROLLBACK_SQL,
} from "./helpers/g2-h5-orders.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL = (f) => migrationSql(f);

async function migrated(order) {
  const db = new PGlite();
  for (const sql of baseSql()) await db.exec(sql);
  await db.exec(G2_SEED_SQL);
  for (const f of order) await db.exec(SQL(f));
  return db;
}
const fingerprint = async (db) => (await db.query(FINGERPRINT_SQL)).rows[0].f;
const g2Objects = async (db) => (await db.query(`SELECT
    (SELECT count(*)::int FROM pg_trigger WHERE tgname = '${G2_TRIGGER}') AS triggers,
    (SELECT count(*)::int FROM pg_proc WHERE proname = 'guard_open_round_requires_active_question') AS functions`)).rows[0];

test("G2's file is the one merged in #529, and the bootstrap pins its guard's body", async () => {
  const bytes = readFileSync(join(ROOT, "supabase", "migrations", G2));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "801d9ba6eafee8ba741334ab8f7a0babac0fcb50ceba7502f3aa4e070ccba891",
    "20261101140000 changed: review the bootstrap's G2 guard check again, then update this pin and G2_GUARD_MD5");
  const db = await migrated([D280_PATHS, D278, G1, G2]);
  assert.equal((await db.query(`SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = to_regprocedure('${G2_FUNCTION}')`)).rows[0].h, G2_GUARD_MD5);
  assert.ok(SQL(BOOTSTRAP).includes(`md5(p.prosrc) = '${G2_GUARD_MD5}'`));
  // G2's own effect: the two questions deactivated.
  assert.deepEqual((await db.query("SELECT bool_or(is_active) AS a FROM public.questions WHERE id = ANY ($1)", [G2_IDS])).rows[0].a, false);
});

test("every order of G2 and H5 ends in the same public schema; G2 adds exactly its trigger and function", async () => {
  const prints = {};
  for (const [label, order] of Object.entries(ORDERS)) prints[label] = await fingerprint(await migrated(order));
  const [first, ...rest] = Object.keys(prints);
  for (const label of rest) assert.deepEqual(prints[label], prints[first], `${label} = ${first}`);

  const h5Only = await fingerprint(await migrated(PROD_ORDER));
  const both = prints[first];
  assert.deepEqual(Object.keys(both.functions).filter((k) => !(k in h5Only.functions)), ["guard_open_round_requires_active_question()"]);
  assert.deepEqual(both.functions["guard_open_round_requires_active_question()"],
    [G2_GUARD_MD5, true, ['search_path=""'], ["postgres=X/postgres"], "postgres"]);
  assert.deepEqual(both.triggers.filter((t) => !h5Only.triggers.some((u) => u[1] === t[1])).map((t) => t[1]), [G2_TRIGGER]);
  const strip = (f) => ({ ...f, functions: Object.fromEntries(Object.entries(f.functions).filter(([k]) => !k.startsWith("guard_open_round"))),
    triggers: f.triggers.filter((t) => t[1] !== G2_TRIGGER) });
  assert.deepEqual(strip(both), h5Only, "nothing else differs");
});

test("without G2 the bootstrap is unchanged in effect (H5 only)", async () => {
  const db = await migrated(PROD_ORDER);
  assert.deepEqual(await g2Objects(db), { triggers: 0, functions: 0 });
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal
    AND tgrelid IN ('public.question_attempts'::regclass, 'public.question_instances'::regclass)`)).rows[0].n, 2);
});

// The bootstrap's existing contract (unchanged here): before the alignment a re-run verifies and
// changes nothing; after the alignment _v2 has the aligned body, so a re-run REFUSES and changes
// nothing (it never hands the old grading back). A re-run of the alignment changes nothing.
test("re-running the bootstrap (before the alignment) and the alignment with G2 changes nothing", async () => {
  for (const order of [[D280_PATHS, D278, G1, G2, BOOTSTRAP], [D280_PATHS, D278, G1, BOOTSTRAP, G2], [H5, D278, D280_PATHS, G2, G1, BOOTSTRAP]]) {
    const db = await migrated(order);
    const before = await fingerprint(db);
    await db.exec(SQL(BOOTSTRAP));
    assert.deepEqual(await fingerprint(db), before, `${order.join(" → ")}: bootstrap re-run`);
  }
  for (const order of [G2_BEFORE_H5, H5_BEFORE_G2, ORDERS["repository file order"]]) {
    const db = await migrated(order);
    const before = await fingerprint(db);
    await db.exec(SQL(ALIGN));
    assert.deepEqual(await fingerprint(db), before, "alignment re-run");
    await assert.rejects(db.exec(SQL(BOOTSTRAP)), /process_question_attempt_v2\(uuid,uuid,text,integer,uuid,text,text\) har ikke den forventede krop/);
    assert.deepEqual(await fingerprint(db), before, "bootstrap after the alignment: refused, nothing changed");
  }
});

// ── Only the reviewed guard is accepted ──────────────────────────────────────────────────────────
const RETRIGGER = (spec) => `DROP TRIGGER ${G2_TRIGGER} ON public.question_instances;
  CREATE TRIGGER ${G2_TRIGGER} ${spec} FOR EACH ROW EXECUTE FUNCTION ${G2_FUNCTION};`;
const NOT_EXACT = /D-290 G2-værnet findes, men ikke præcis som gennemgået/;
const TAMPERS = [
  ["a changed guard body", `CREATE OR REPLACE FUNCTION ${G2_FUNCTION} RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
     SET search_path = '' AS $$ BEGIN RETURN NEW; END $$;`, NOT_EXACT],
  ["EXECUTE for authenticated", `GRANT EXECUTE ON FUNCTION ${G2_FUNCTION} TO authenticated;`, NOT_EXACT],
  ["EXECUTE for anon", `GRANT EXECUTE ON FUNCTION ${G2_FUNCTION} TO anon;`, NOT_EXACT],
  ["EXECUTE for service_role", `GRANT EXECUTE ON FUNCTION ${G2_FUNCTION} TO service_role;`, NOT_EXACT],
  ["EXECUTE for PUBLIC", `GRANT EXECUTE ON FUNCTION ${G2_FUNCTION} TO PUBLIC;`, NOT_EXACT],
  ["SECURITY INVOKER", `ALTER FUNCTION ${G2_FUNCTION} SECURITY INVOKER;`, NOT_EXACT],
  ["another search_path", `ALTER FUNCTION ${G2_FUNCTION} SET search_path = public;`, NOT_EXACT],
  ["another owner", `CREATE ROLE g2_other; ALTER FUNCTION ${G2_FUNCTION} OWNER TO g2_other;`, NOT_EXACT],
  ["the trigger on answered only", RETRIGGER("BEFORE INSERT OR UPDATE OF answered ON public.question_instances"), NOT_EXACT],
  ["the trigger without INSERT", RETRIGGER("BEFORE UPDATE OF answered, question_id ON public.question_instances"), NOT_EXACT],
  ["the trigger AFTER", RETRIGGER("AFTER INSERT OR UPDATE OF answered, question_id ON public.question_instances"), NOT_EXACT],
  ["the trigger with a WHEN clause", RETRIGGER("BEFORE INSERT OR UPDATE OF answered, question_id ON public.question_instances")
    .replace("FOR EACH ROW", "FOR EACH ROW WHEN (NEW.answered IS FALSE)"), NOT_EXACT],
  ["the trigger disabled", `ALTER TABLE public.question_instances DISABLE TRIGGER ${G2_TRIGGER};`, NOT_EXACT],
  ["the function without its trigger", `DROP TRIGGER ${G2_TRIGGER} ON public.question_instances;`, NOT_EXACT],
  ["the trigger name on another function", `CREATE FUNCTION public.g2_lookalike() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
     DROP TRIGGER ${G2_TRIGGER} ON public.question_instances;
     CREATE TRIGGER ${G2_TRIGGER} BEFORE INSERT OR UPDATE OF answered, question_id ON public.question_instances
       FOR EACH ROW EXECUTE FUNCTION public.g2_lookalike();`, NOT_EXACT],
  ["a second trigger under the name on another table", `CREATE TRIGGER ${G2_TRIGGER} BEFORE UPDATE ON public.questions
     FOR EACH ROW EXECUTE FUNCTION ${G2_FUNCTION};`, NOT_EXACT],
  ["a second function under the name in another schema", `CREATE SCHEMA g2x; CREATE FUNCTION g2x.guard_open_round_requires_active_question()
     RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`, NOT_EXACT],
];
const UNKNOWN_TRIGGER = `CREATE FUNCTION public.t() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER other BEFORE UPDATE ON public.question_instances FOR EACH ROW EXECUTE FUNCTION public.t();`;

test("the bootstrap refuses G2's guard in any other form, and any extra trigger beside it — and changes nothing", async () => {
  const bases = {
    "H5 absent (production: G2 → H5)": { order: [D280_PATHS, D278, G1, G2], unknown: /har allerede en trigger, som ikke er D-290 G2-værnet/ },
    "H5 present (repository order)": { order: [H5, D278, D280_PATHS, G2, G1], unknown: /ikke præcis de to H5-triggere/ },
  };
  for (const [base, { order, unknown }] of Object.entries(bases)) {
    for (const [label, tamper, error] of [...TAMPERS, ["G2's guard plus an unknown trigger", UNKNOWN_TRIGGER, unknown]]) {
      const db = await migrated(order);
      await db.exec(tamper);
      const before = await fingerprint(db);
      await assert.rejects(db.exec(SQL(BOOTSTRAP)), error, `${base}: ${label}`);
      assert.deepEqual(await fingerprint(db), before, `${base}: ${label}: nothing changed`);
    }
  }
});

test("a tampered G2 guard is also refused when H5 came first (re-run of the bootstrap)", async () => {
  const db = await migrated(H5_BEFORE_G2);
  await db.exec(`GRANT EXECUTE ON FUNCTION ${G2_FUNCTION} TO authenticated;`);
  const before = await fingerprint(db);
  await assert.rejects(db.exec(SQL(BOOTSTRAP)), NOT_EXACT);
  assert.deepEqual(await fingerprint(db), before);
});

// ── Both guards together ─────────────────────────────────────────────────────────────────────────
let nextPupil = 800;
async function addPupil(db) {
  const id = uid(nextPupil++);
  await db.exec(`INSERT INTO auth.users VALUES ('${id}');
    INSERT INTO public.profiles (id, role, selected_grade) VALUES ('${id}', 'student', 5);
    INSERT INTO public.student_progress (student_id, xp, coins, correct_answers, total_correct_answers,
      current_streak, longest_streak, last_activity_date) VALUES ('${id}', 100, 50, 7, 7, 1, 1, current_date - 1);`);
  return id;
}
const instance = async (db, pupil, question, { answered = false, repeat = 0, key = "x" } = {}) =>
  (await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, repeat_count, answered, next_review_at)
    VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`, [pupil, question, key, repeat, answered])).rows[0].id;
async function as(db, role, sql, params = []) {
  await db.exec(`SET ROLE ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}

test("both guards work together on the final schema, in either order", async () => {
  for (const order of [G2_BEFORE_H5, H5_BEFORE_G2]) {
    const db = await migrated(order);
    const [inactive] = G2_IDS;
    const active = TOP10_ID[0];
    const key = (await db.query("SELECT content->>'correct' AS c FROM public.questions WHERE id = $1", [active])).rows[0].c;

    // G2: a new open round on an inactive question is refused — insert and reopen.
    const p1 = await addPupil(db);
    await assert.rejects(instance(db, p1, inactive), /open round refused/, "insert of an open round");
    const done = await instance(db, p1, inactive, { answered: true });
    await assert.rejects(db.query("UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1", [done]),
      /open round refused/, "a correct reopen on an inactive question");

    // H5: on an active question, a reopen that skips the round is refused; a correct one passes both.
    const p2 = await addPupil(db);
    const qi = await instance(db, p2, active, { answered: true, key });
    await assert.rejects(db.query("UPDATE public.question_instances SET answered = false WHERE id = $1", [qi]),
      /question_instances_round_guard/);
    await db.query("UPDATE public.question_instances SET answered = false, repeat_count = 1 WHERE id = $1", [qi]);

    // _v2 answers round 2 through both triggers (G2's returns at once on answered = true).
    const r = (await as(db, "service_role", "SELECT public.process_question_attempt_v2($1, $2, $3, 2, $4, NULL, NULL) AS r",
      [p2, qi, key, randomUUID()]))[0].r;
    assert.deepEqual([r.outcome, r.status, r.round_no], ["recorded", "correct", 2]);
    assert.equal((await db.query("SELECT answered FROM public.question_instances WHERE id = $1", [qi])).rows[0].answered, true);
    await assert.rejects(db.query("UPDATE public.question_attempts SET xp_awarded = 99 WHERE student_id = $1", [p2]), /append-only/);
    // An existing row that does not open a new round passes G2's guard untouched.
    await db.query("UPDATE public.question_instances SET next_review_at = now() WHERE id = $1", [done]);
  }
});

// ── Rollback ─────────────────────────────────────────────────────────────────────────────────────
test("H5's rollback on G2 + H5 restores the G2-only schema; the two H5 files then apply again", async () => {
  const g2Only = await fingerprint(await migrated([D280_PATHS, D278, G1, G2]));
  const db = await migrated(G2_BEFORE_H5);
  const full = await fingerprint(db);
  await db.exec(ROLLBACK_SQL);
  assert.deepEqual(await fingerprint(db), g2Only);
  await db.exec(SQL(BOOTSTRAP));
  await db.exec(SQL(ALIGN));
  assert.deepEqual(await fingerprint(db), full);
});

test("G2's guard rollback on G2 + H5 leaves exactly the H5-only schema; the bootstrap still verifies it", async () => {
  const h5Only = await fingerprint(await migrated(PROD_ORDER));
  for (const order of [G2_BEFORE_H5, H5_BEFORE_G2]) {
    const db = await migrated(order);
    await db.exec(G2_GUARD_ROLLBACK_SQL);
    assert.deepEqual(await fingerprint(db), h5Only);
    await db.exec(SQL(ALIGN));
    assert.deepEqual(await fingerprint(db), h5Only);
    assert.equal((await db.query(`SELECT has_function_privilege('service_role', '${MC_V2}', 'EXECUTE') AS e`)).rows[0].e, true);
  }
  // Between the bootstrap and the alignment: after G2's rollback the bootstrap verifies the H5-only state.
  const bootOnly = await fingerprint(await migrated([D280_PATHS, D278, G1, BOOTSTRAP]));
  const db = await migrated([D280_PATHS, D278, G1, G2, BOOTSTRAP]);
  await db.exec(G2_GUARD_ROLLBACK_SQL);
  assert.deepEqual(await fingerprint(db), bootOnly);
  await db.exec(SQL(BOOTSTRAP));
  assert.deepEqual(await fingerprint(db), bootOnly);
});
