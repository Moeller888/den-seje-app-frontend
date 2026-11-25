// D-381: the nape locks (D-379 NH-5C, V2 excepted by D-380) as a hairstyle on the Northstar figure, "Nakkelokker · gråt" and
// "Nakkelokker · brunt". The two cards are SHOWN by default since the owner's approved try-out (NORTHSTAR_HAIR_NH5C = true); with the
// flag off (a copy of the module with only that line changed) they are hidden and shown only to a browser that opts in
// (avatar_northstar_hair_nh5c). A stored nape-lock head is drawn on every surface whatever the flag. D-373's three hairstyles and D-377's
// top knot are unchanged. The published heads are byte for byte D-380's bound WebP heads; the raw image and every intermediate file stay
// outside the clones. The migration extends D-377's validation (production's definition today) with the two values and keeps every other
// rule (PGlite). 0 image calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { REPO_AHEAD_OF_PRODUCTION, NOT_IN_PRODUCTION, APPLIED_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(ROOT, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const EX = JSON.parse(read("tools/avatar/fixtures/northstar-hair-d379/exception-d380-v1.json").toString("utf8"));
const NAME = "20261118090000_avatar_northstar_hair_nh5c_d381.sql";
const MIGRATION = read("supabase/migrations/" + NAME).toString("utf8");
const D377 = read("supabase/migrations/20261115090000_avatar_northstar_hair_nh5b_d377.sql").toString("utf8");
const D373 = read("supabase/migrations/20261112150000_avatar_northstar_hair_d373.sql").toString("utf8");
const D357 = read("supabase/migrations/20261106120000_avatar_northstar_choice.sql").toString("utf8");
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };
const LOCKS = ["nh5c-grey", "nh5c-brown"];
const BEFORE = ["standard", "nh4-grey", "nh4-brown", "nh5b-grey", "nh5b-brown"];
const G1 = ["h25n2", "h25n3", "h25n6", "h25n7", "h25v2", "h25n5"].flatMap((s) => [s + "-grey", s + "-brown"]);   // D-386's group 1, open by default, last under Hoved
const HEAD = (hair) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";

// a fresh module per case, with or without this browser's opt-in to the nape locks; flagOff: the same module with only the flag line set
// to false (the module has no imports, so it loads as a data: URL, as in D-377's test)
const FLAG_ON = "export const NORTHSTAR_HAIR_NH5C = true;";
async function layers(optIn, { flagOff = false } = {}) {
  const store = new Map(optIn ? [["avatar_northstar_hair_nh5c", "1"]] : []);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  if (!flagOff) return import("../../js/avatar-layers.js?d381=" + Math.random());
  const src = read("js/avatar-layers.js").toString("utf8");
  assert.equal(src.split(FLAG_ON).length, 2, "the flag line occurs once");
  return import("data:text/javascript;base64," + Buffer.from(src.replace(FLAG_ON, "export const NORTHSTAR_HAIR_NH5C = false;") + "\n// " + Math.random()).toString("base64"));
}
const headOf = (r) => r.plan.filter((s) => s.op === "draw" && /head/.test(s.src)).map((s) => s.src);

test("D-381 open: the two nape-lock cards are shown by default, last under Hoved after the top knot, and go on without any opt-in", async () => {
  const L = await layers(false);
  assert.equal(L.NORTHSTAR_HAIR_NH5C, true, "the cards are shown by default");
  assert.equal(L.isNorthstarHairNh5cOn(), true);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), [...BEFORE, ...LOCKS, ...G1], "nineteen cards, the nape locks before D-386's group 1");
  L.northstarUseAccount({ northstar: { ...FREE } });
  for (const k of [...BEFORE, ...LOCKS]) assert.deepEqual(L.northstarFitHair(k).choice, { ...FREE, hair: k }, k + " goes on and keeps the outfit");
});

test("D-381 catalogue: two nape-lock hairstyles with their Danish labels; with the flag off they are hidden; D-373's three and D-377's top knot are unchanged and still selectable", async () => {
  const L = await layers(false, { flagOff: true });
  assert.equal(L.NORTHSTAR_HAIR_NH5C, false, "the copy has the flag off");
  assert.equal(L.NORTHSTAR_HAIR_NH5C_OPT_IN_KEY, "avatar_northstar_hair_nh5c");
  assert.deepEqual(JSON.parse(JSON.stringify(L.NORTHSTAR_HAIRS_NH5C)), { "nh5c-grey": { file: "head-nh5c-grey-v1.webp", label: "Nakkelokker · gråt" }, "nh5c-brown": { file: "head-nh5c-brown-v1.webp", label: "Nakkelokker · brunt" } });
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS), ["standard", "nh4-grey", "nh4-brown"], "D-373's catalogue is unchanged");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_NH5B), ["nh5b-grey", "nh5b-brown"], "D-377's catalogue is unchanged");
  assert.equal(L.NORTHSTAR_HAIR_NH5B, true, "the top knot stays open (D-378)");
  assert.equal(L.isNorthstarHairNh5cOn(), false);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), [...BEFORE, ...G1], "no nape-lock card without the opt-in: the five before them and D-386's group 1");
  L.northstarUseAccount({ northstar: { ...FREE } });
  for (const k of LOCKS) assert.equal(L.northstarFitHair(k), null, k + " cannot be put on while its cards are hidden");
  for (const k of BEFORE) assert.deepEqual(L.northstarFitHair(k).choice, { ...FREE, hair: k }, k + " still goes on");
});

test("D-381 on by default (and, with the flag off, a browser's opt-in): both colours can be put on and keep the outfit; a part keeps the nape locks; only the head differs; Avatar, Hub and the quiz draw it", async () => {
  for (const [optIn, flagOff] of [[false, false], [true, true]]) {
    const L = await layers(optIn, { flagOff });
    assert.equal(L.isNorthstarHairNh5cOn(), true, JSON.stringify({ optIn, flagOff }));
    assert.deepEqual(Object.keys(L.northstarSelectableHairs()), [...BEFORE, ...LOCKS, ...G1], "nineteen cards, the nape locks before D-386's group 1");
    const plans = {};
    for (const hair of ["standard", ...LOCKS]) {
      L.northstarUseAccount({ northstar: { ...FREE } });
      assert.deepEqual(L.northstarFitHair(hair).choice, { ...FREE, hair }, hair + ": the outfit stays and is saved with the hairstyle");
      L.northstarUseAccount({ northstar: { ...FREE, hair } });
      assert.equal(L.northstarHairNow(), hair);
      for (const top of ["top-tank-navy", "top-sweater-ls2-heather", "top-tee-hip-cream"]) assert.deepEqual(L.northstarFitPiece(top).choice, { ...FREE, top, hair }, hair + ": " + top + " keeps the hairstyle");
      const r = L.northstarRenderFor("avatar", []);
      assert.deepEqual(headOf(r), [HEAD(hair)]); assert.ok(r.key.endsWith("+hair:" + hair), r.key);
      plans[hair] = r.plan;
      for (const surface of ["hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(surface, [])), [HEAD(hair)], hair + " on " + surface);
    }
    const strip = (p) => p.map((s) => (/avatar-northstar-hair\//.test(s.src) ? { ...s, src: "HEAD" } : s));
    for (const k of LOCKS) assert.deepEqual(strip(plans[k]), strip(plans.standard), k + ": body, arms, outfit and shadows are the same steps");
    L.northstarUseAccount({ northstar: { outfit: "K01" } });
    assert.deepEqual(L.northstarFitHair("nh5c-brown").choice, { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige", hair: "nh5c-brown" }, "an older K choice keeps its parts");
  }
});

test("D-381 saved avatars: stored nape locks are drawn without any opt-in, also with the flag off; every older choice, the top knot included, is drawn as before", async () => {
  const F = await layers(false, { flagOff: true });
  for (const hair of LOCKS) { F.northstarUseAccount({ northstar: { ...FREE, hair } }); for (const s of ["avatar", "hub", "quiz"]) assert.deepEqual(headOf(F.northstarRenderFor(s, [])), [HEAD(hair)], hair + " on " + s + " (flag off, no opt-in)"); }
  const L = await layers(false);
  for (const hair of LOCKS) { L.northstarUseAccount({ northstar: { ...FREE, hair } }); for (const s of ["avatar", "hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(s, [])), [HEAD(hair)], hair + " on " + s); }
  const cases = [[{ ...FREE }, "standard"], ...BEFORE.map((h) => [{ ...FREE, hair: h }, h]), [{ ...FREE, hair: "nh5c-blue" }, "standard"], [{ outfit: "K01" }, "standard"]];
  for (const [choice, hair] of cases) {
    L.northstarUseAccount({ northstar: choice });
    assert.equal(L.northstarHairNow(), hair, JSON.stringify(choice));
    assert.deepEqual(headOf(L.northstarRenderFor("avatar", [])), [HEAD(hair)], JSON.stringify(choice));
  }
  assert.equal(L.northstarRenderFor("shop", []), null, "the other surfaces keep today's path");
});

test("D-381 wardrobe: the cards come from the selectable hairstyles, and the page takes ?northstarnh5c=1 / =0 beside D-377's ?northstarnh5b", () => {
  const panel = read("js/avatar-northstar-panel.js").toString("utf8");
  assert.match(panel, /for \(const \[id, h\] of Object\.entries\(northstarSelectableHairs\(\)\)\)/);
  assert.match(panel, /get\("northstarnh5c"\)/);
  assert.match(panel, /if \(c === "1"\) store\(NORTHSTAR_HAIR_NH5C_OPT_IN_KEY, "1"\);/);
  assert.match(panel, /else if \(c === "0"\) store\(NORTHSTAR_HAIR_NH5C_OPT_IN_KEY, null\);/);
  assert.match(panel, /get\("northstarnh5b"\)/, "D-377's opt-in is still there");
});

test("D-381 assets: the two published heads are byte for byte D-380's bound WebP heads; the raw image and the intermediate files are not in the repository", () => {
  assert.equal(EX.decision, "D-380");
  assert.equal(sha(read("assets/avatar-northstar-hair/head-nh5c-grey-v1.webp")), EX.outputs.greyHeadWebp.sha256);
  assert.equal(sha(read("assets/avatar-northstar-hair/head-nh5c-brown-v1.webp")), EX.outputs.brownHeadWebp.sha256);
  assert.equal(EX.outputs.greyHeadWebp.sha256, "549bc6aa7aedd902d3bb0aa5859c682a09c7eb74eef41330db7f208d09f92f2d");
  assert.equal(EX.outputs.brownHeadWebp.sha256, "e1225901e00be9adcf22d8e54fee0320faa564be38d167ab0280e445959d00b2");
  const priv = [...EX.inputs, ...Object.entries(EX.outputs).filter(([k]) => !/Webp$/.test(k)).map(([, o]) => o)];
  assert.equal(priv.length, 9, "4 inputs and 5 intermediate files");
  const bound = new Set(priv.map((o) => o.sha256));
  let tracked = [];
  try { tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracked = []; }
  for (const f of tracked.filter((p) => /\.(png|webp)$/i.test(p) && /hair|nh5c/i.test(p))) assert.ok(!bound.has(sha(read(f))), f + " is a private D-380 file");
  for (const n of priv.map((o) => o.name)) assert.ok(!tracked.some((p) => p.endsWith("/" + n)), n + " is not tracked");
  for (const n of ["nh.image-1.png", "head-nh5c-v2-grey.webp", "head-nh5c-v2-brown.webp"]) assert.ok(!existsSync(join(ROOT, "assets", "avatar-northstar-hair", n)), n);
});

test("D-381 migration: D-377's validation verbatim, the hair list extended with the two nape locks only — every other rule still holds (PGlite)", async () => {
  const body = (s) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION"));
  const was = "'nh5b-grey', 'nh5b-brown') THEN", now = "'nh5b-grey', 'nh5b-brown', 'nh5c-grey', 'nh5c-brown') THEN";
  const msgWas = "nh5b-grey, nh5b-brown';", msgNow = "nh5b-grey, nh5b-brown, nh5c-grey, nh5c-brown';";
  assert.equal(body(MIGRATION), body(D377).replace(was, now).replace(msgWas, msgNow), "only the hair list and its message change");
  assert.match(MIGRATION, /md5 b746b99c30198f5208b7fbba44e324ed/, "production's definition read before the change");
  assert.equal(APPLIED_IN_PRODUCTION[NAME], "20261118135103", "applied in production 2026-11-18 (D-381)");
  assert.ok(!(NAME in NOT_IN_PRODUCTION) && !(NAME in REPO_AHEAD_OF_PRODUCTION));
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, avatar_identity jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE FUNCTION public.validate_avatar_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
    CREATE TRIGGER validate_avatar_identity BEFORE UPDATE OF avatar_identity ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_avatar_identity();
  `);
  await pg.exec(D357); await pg.exec(D373); await pg.exec(D377);
  const A = "00000000-0000-0000-0000-00000000038a";
  await pg.query("INSERT INTO public.profiles (id) VALUES ($1)", [A]);
  await pg.exec(`SELECT set_config('test.uid', '${A}', false)`);
  const save = (c) => pg.query("SELECT public.set_avatar_northstar($1::jsonb) AS r", [JSON.stringify(c)]);
  const stored = async () => (await pg.query("SELECT avatar_identity->'northstar' AS n FROM public.profiles WHERE id = $1", [A])).rows[0].n;
  await save({ ...FREE, hair: "nh5b-brown" });
  for (const k of LOCKS) await assert.rejects(save({ ...FREE, hair: k }), /hair must be one of standard, nh4-grey, nh4-brown, nh5b-grey, nh5b-brown'?$/, k + " is refused before D-381 (production today)");
  assert.deepEqual(await stored(), { ...FREE, hair: "nh5b-brown" }, "a refused save changes nothing");
  await pg.exec(MIGRATION);
  assert.deepEqual(await stored(), { ...FREE, hair: "nh5b-brown" }, "the migration leaves saved avatars alone");
  for (const hair of [...BEFORE, ...LOCKS]) { await save({ ...FREE, hair }); assert.deepEqual(await stored(), { ...FREE, hair }); }
  for (const top of ["top-tank-navy", "top-sweater-ls2-heather"]) { await save({ ...FREE, top, hair: "nh5c-grey" }); assert.deepEqual(await stored(), { ...FREE, top, hair: "nh5c-grey" }); }
  for (const bad of ["nh5c-blue", "nh5c", "NH5C-GREY", "nh5c-v2-grey", "nh5d-grey", "pink", ""]) await assert.rejects(save({ ...FREE, hair: bad }), /hair must be one of|short item ids/, bad);
  await assert.rejects(save({ ...FREE, hair: 1 }), /short item ids/);
  await save(FREE);   // a choice without a hairstyle is still valid
  await assert.rejects(save({ hat: "x" }), /short item ids/);
  const set = (v) => pg.query("UPDATE public.profiles SET avatar_identity = $1::jsonb WHERE id = $2", [JSON.stringify(v), A]);
  await assert.rejects(set({ v: 1, body_type: "neutral", other: 1 }), /unknown keys/);
  await assert.rejects(set({ v: 1, body_type: "neutral", hairstyle: "x" }), /hairstyle/);
  await assert.rejects(set({ v: 1, body_type: "x" }), /body_type/);
  await assert.rejects(set({ v: 1, body_type: "neutral", skin_tone: "x" }), /skin_tone/);
  await assert.rejects(set({ v: 1, body_type: "neutral", hair_color: "x" }), /hair_color/);
  await assert.rejects(set({ v: 2, body_type: "neutral" }), /v must be 1/);
  await set({ v: 1, body_type: "neutral", hairstyle: "afro", skin_tone: "dark", hair_color: "red", chosen_at: "x", northstar: { ...FREE, hair: "nh5c-brown" } });
  await set({});
  await pg.close();
});
