// D-357: the migration 20261106120000_avatar_northstar_choice.sql, run unmodified on PGlite: own row only, only this key, shape
// enforced, chosen_at untouched, every older identity rule kept.
// HONEST LIMIT: PGlite runs as superuser, so the privilege check reads the ACL instead of being refused as a role.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", "20261106120000_avatar_northstar_choice.sql"), "utf8");
const fresh = async () => import("../../js/avatar-layers.js?d357=" + Math.random());

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, avatar_identity jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE FUNCTION public.validate_avatar_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
    CREATE TRIGGER validate_avatar_identity BEFORE UPDATE OF avatar_identity ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_avatar_identity();
  `);
  await pg.exec(MIGRATION);
  return pg;
}
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
const as = (pg, uid) => pg.exec(`SELECT set_config('test.uid', '${uid}', false)`);
const save = (pg, choice) => pg.query("SELECT public.set_avatar_northstar($1::jsonb) AS r", [JSON.stringify(choice)]);
const identityOf = async (pg, id) => (await pg.query("SELECT avatar_identity AS i FROM public.profiles WHERE id = $1", [id])).rows[0].i;

test("D-357 migration: writes only the caller's row and only this key; clearing removes it; chosen_at is never set", async () => {
  const pg = await db();
  const chosen = { v: 1, body_type: "female", chosen_at: "2026-01-01", hairstyle: "long", skin_tone: "dark" };
  await pg.query("INSERT INTO public.profiles (id, avatar_identity) VALUES ($1, $2::jsonb), ($3, '{}'::jsonb)", [A, JSON.stringify(chosen), B]);
  await as(pg, A);
  await save(pg, { outfit: "K01", tee: "TP-TEA-CRM" });
  assert.deepEqual(await identityOf(pg, A), { ...chosen, northstar: { outfit: "K01", tee: "TP-TEA-CRM" } });
  assert.deepEqual(await identityOf(pg, B), {}, "another pupil's row is untouched");
  await save(pg, {});
  assert.deepEqual(await identityOf(pg, A), chosen, "an empty choice removes the key and nothing else");
  await as(pg, B);
  await save(pg, { outfit: "K02" });
  const b = await identityOf(pg, B);
  assert.deepEqual(b, { v: 1, body_type: "neutral", northstar: { outfit: "K02" } });
  assert.equal("chosen_at" in b, false, "the first-login identity prompt still appears");
  await pg.close();
});

test("D-357 migration: bad input is refused, and every older identity rule still holds", async () => {
  const pg = await db();
  await pg.query("INSERT INTO public.profiles (id) VALUES ($1)", [A]);
  await as(pg, "");
  await assert.rejects(save(pg, { outfit: "K01" }), /not authenticated/);
  await as(pg, B);
  await assert.rejects(save(pg, { outfit: "K01" }), /profile not found/);
  await as(pg, A);
  await assert.rejects(pg.query("SELECT public.set_avatar_northstar(NULL)"), /must be a JSON object/);
  for (const bad of [[], "K01", 7]) await assert.rejects(save(pg, bad), /must be a JSON object/);
  for (const bad of [{ hat: "x" }, { outfit: 1 }, { outfit: null }, { outfit: "" }, { outfit: "<script>" }, { outfit: "a".repeat(41) }, { outfit: { a: 1 } }]) {
    await assert.rejects(save(pg, bad), /short item ids/, JSON.stringify(bad));
  }
  const set = (v) => pg.query("UPDATE public.profiles SET avatar_identity = $1::jsonb WHERE id = $2", [JSON.stringify(v), A]);
  await assert.rejects(set({ v: 1, body_type: "neutral", northstar: [] }), /northstar must be a JSON object/);
  await assert.rejects(set({ v: 1, body_type: "neutral", other: 1 }), /unknown keys/);
  await assert.rejects(set({ v: 2, body_type: "neutral" }), /v must be 1/);
  await assert.rejects(set({ v: 1, body_type: "x" }), /body_type/);
  await assert.rejects(set({ v: 1, body_type: "neutral", hairstyle: "x" }), /hairstyle/);
  await assert.rejects(set({ v: 1, body_type: "neutral", skin_tone: "x" }), /skin_tone/);
  await assert.rejects(set({ v: 1, body_type: "neutral", hair_color: "x" }), /hair_color/);
  await set({ v: 1, body_type: "neutral", hairstyle: "afro", skin_tone: "dark", hair_color: "red", chosen_at: "x" });
  await pg.close();
});

test("D-357 migration: only signed-in roles may call it, and every item id in the catalogue fits the shape", async () => {
  const pg = await db();
  const { rows } = await pg.query("SELECT proacl::text AS acl, prosecdef FROM pg_proc WHERE proname = 'set_avatar_northstar'");
  assert.equal(rows[0].prosecdef, true);
  assert.match(rows[0].acl, /authenticated=X/); assert.match(rows[0].acl, /service_role=X/);
  assert.ok(!/(^|[{,])=X/.test(rows[0].acl), "no PUBLIC execute"); assert.ok(!/anon=X/.test(rows[0].acl));
  await pg.close();
  const L = await fresh();
  const ids = [...Object.keys(L.NORTHSTAR_OUTFITS), ...Object.keys(L.NORTHSTAR_PRINT_TEES), ...Object.keys(L.NORTHSTAR_SOLID_PANTS), ...Object.keys(L.NORTHSTAR_SHOE_CHOICES), ...Object.keys(L.NORTHSTAR_TOP_CHOICES)];
  for (const id of ids) assert.match(id, /^[A-Za-z0-9-]{1,40}$/);
});
