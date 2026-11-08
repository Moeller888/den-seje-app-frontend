// RUNTIME proof for migration 20261108170000_drop_placement_rpcs (D-365), in PGlite.
//
// The SQL file runs UNMODIFIED on a fixture with the two functions (same signatures and grants as
// 20261016160000 / 20261019120000, stub bodies), placement_sessions, profiles.placement_band and a
// bystander function that reads placement_sessions.
//
// HONEST LIMITS: PGlite is PostgreSQL 18.x; production is 17.6. The bodies are stubs, because only the
// signatures decide what DROP FUNCTION removes. Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NOT_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261108170000_drop_placement_rpcs.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const FIXTURE = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, placement_band integer, current_band integer);
  CREATE TABLE public.placement_sessions (id uuid PRIMARY KEY, student_id uuid, question_ids uuid[],
    band integer, completed_at timestamptz);
  INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-000000000001', 3, 4);
  INSERT INTO public.placement_sessions VALUES ('00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001', '{}', 3, now());
  CREATE FUNCTION public.start_placement() RETURNS json LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::json $$;
  CREATE FUNCTION public.submit_placement(p_answers jsonb) RETURNS json LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::json $$;
  REVOKE ALL ON FUNCTION public.start_placement() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.start_placement() TO authenticated;
  REVOKE ALL ON FUNCTION public.submit_placement(jsonb) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.submit_placement(jsonb) TO authenticated;
  CREATE FUNCTION public.seed_band_from_placement(p uuid) RETURNS integer LANGUAGE sql AS
    $$ SELECT band FROM public.placement_sessions WHERE student_id = p AND completed_at IS NOT NULL LIMIT 1 $$;
`;

async function fresh() {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  return pg;
}
const functions = async (pg) => (await pg.query(
  `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS f
     FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`)).rows.map((r) => r.f);

test("the migration drops exactly start_placement() and submit_placement(jsonb)", async () => {
  const pg = await fresh();
  const before = await functions(pg);
  await pg.exec(MIGRATION);
  const after = await functions(pg);
  assert.deepEqual(before.filter((f) => !after.includes(f)),
    ["start_placement()", "submit_placement(p_answers jsonb)"]);
  assert.deepEqual(after, ["seed_band_from_placement(p uuid)"]);
});

test("placement_sessions, placement_band and the seed that reads them are untouched", async () => {
  const pg = await fresh();
  await pg.exec(MIGRATION);
  const seed = await pg.query(`SELECT public.seed_band_from_placement('00000000-0000-4000-8000-000000000001') AS b`);
  assert.equal(seed.rows[0].b, 3);
  const prof = await pg.query(`SELECT placement_band, current_band FROM public.profiles`);
  assert.deepEqual(prof.rows, [{ placement_band: 3, current_band: 4 }]);
});

test("a second run fails loudly instead of passing silently", async () => {
  const pg = await fresh();
  await pg.exec(MIGRATION);
  await assert.rejects(pg.exec(MIGRATION), /does not exist/);
});

test("the file only drops functions — no table, column, policy or grant statement", () => {
  const sql = MIGRATION.replace(/--.*$/gm, "");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(statements, ["DROP FUNCTION public.start_placement()", "DROP FUNCTION public.submit_placement(jsonb)"]);
});

test("no later migration re-creates them, and no app or Edge Function code calls them", () => {
  const later = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f > FILE && f.endsWith(".sql"));
  for (const f of later) {
    assert.equal(/(start|submit)_placement/.test(readFileSync(join(ROOT, "supabase", "migrations", f), "utf8")), false, f);
  }
  const code = [join(ROOT, "app.js"), ...readdirSync(join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => join(ROOT, "js", f))];
  for (const fn of readdirSync(join(ROOT, "supabase", "functions"), { withFileTypes: true })) {
    if (!fn.isDirectory()) continue;
    for (const f of readdirSync(join(ROOT, "supabase", "functions", fn.name))) {
      if (f.endsWith(".ts")) code.push(join(ROOT, "supabase", "functions", fn.name, f));
    }
  }
  for (const f of code) {
    assert.equal(/(start|submit)_placement/.test(readFileSync(f, "utf8")), false, f);
  }
});

test("listed as not applied in production, so the isolated stack does not replay it", () => {
  assert.match(NOT_IN_PRODUCTION[FILE] ?? "", /D-365/);
});
