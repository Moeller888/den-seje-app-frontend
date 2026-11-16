// D-377: the top knot (D-375 NH-5B, excepted by D-376) as a hairstyle on the Northstar figure, "Topknude · gråt" and "Topknude · brunt".
// The two cards are shown by default since D-378 (NORTHSTAR_HAIR_NH5B = true); with the flag off (a copy of the module with only that line
// changed) they are hidden and shown only to a browser that opts in (avatar_northstar_hair_nh5b). A stored top knot is drawn on every surface. The published heads are byte for byte D-376's bound WebP heads; the raw image and every
// intermediate file stay outside the clones. The migration extends D-373's validation with the two values and keeps every other rule (PGlite).
// 0 image calls.
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
const EX = JSON.parse(read("tools/avatar/fixtures/northstar-hair-d375/exception-d376-v1.json").toString("utf8"));
const NAME = "20261115090000_avatar_northstar_hair_nh5b_d377.sql";
const MIGRATION = read("supabase/migrations/" + NAME).toString("utf8");
const D373 = read("supabase/migrations/20261112150000_avatar_northstar_hair_d373.sql").toString("utf8");
const D357 = read("supabase/migrations/20261106120000_avatar_northstar_choice.sql").toString("utf8");
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };
const KNOTS = ["nh5b-grey", "nh5b-brown"];
const HEAD = (hair) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";

// a fresh module per case, with or without this browser's opt-in to the top knot; flagOff: the same module with only the flag line set to
// false (the module has no imports, so it loads as a data: URL, as in D-370's test)
const FLAG_ON = "export const NORTHSTAR_HAIR_NH5B = true;";
async function layers(optIn, { flagOff = false } = {}) {
  const store = new Map(optIn ? [["avatar_northstar_hair_nh5b", "1"]] : []);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  if (!flagOff) return import("../../js/avatar-layers.js?d377=" + Math.random());
  const src = read("js/avatar-layers.js").toString("utf8");
  assert.equal(src.split(FLAG_ON).length, 2, "the flag line occurs once");
  return import("data:text/javascript;base64," + Buffer.from(src.replace(FLAG_ON, "export const NORTHSTAR_HAIR_NH5B = false;") + "\n// " + Math.random()).toString("base64"));
}
const headOf = (r) => r.plan.filter((s) => s.op === "draw" && /head/.test(s.src)).map((s) => s.src);

test("D-378 open: the two top-knot cards are shown by default, last under Hoved, and go on without any opt-in", async () => {
  const L = await layers(false);
  assert.equal(L.NORTHSTAR_HAIR_NH5B, true, "the cards are shown by default (D-378)");
  assert.equal(L.isNorthstarHairNh5bOn(), true);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), ["standard", "nh4-grey", "nh4-brown", ...KNOTS], "five cards, the top knot last");
  L.northstarUseAccount({ northstar: { ...FREE } });
  for (const k of KNOTS) assert.deepEqual(L.northstarFitHair(k).choice, { ...FREE, hair: k }, k + " goes on and keeps the outfit");
});

test("D-377 catalogue: two top-knot hairstyles with their Danish labels; with the flag off they are hidden; D-373's three hairstyles are unchanged", async () => {
  const L = await layers(false, { flagOff: true });
  assert.equal(L.NORTHSTAR_HAIR_NH5B, false, "the copy has the flag off");
  assert.equal(L.NORTHSTAR_HAIR_NH5B_OPT_IN_KEY, "avatar_northstar_hair_nh5b");
  assert.deepEqual(JSON.parse(JSON.stringify(L.NORTHSTAR_HAIRS_NH5B)), { "nh5b-grey": { file: "head-nh5b-grey-v1.webp", label: "Topknude · gråt" }, "nh5b-brown": { file: "head-nh5b-brown-v1.webp", label: "Topknude · brunt" } });
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS), ["standard", "nh4-grey", "nh4-brown"], "D-373's catalogue is unchanged");
  assert.equal(L.isNorthstarHairNh5bOn(), false);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), ["standard", "nh4-grey", "nh4-brown"], "no top-knot card without the opt-in");
  L.northstarUseAccount({ northstar: { ...FREE } });
  for (const k of KNOTS) assert.equal(L.northstarFitHair(k), null, k + " cannot be put on while its cards are hidden");
  assert.deepEqual(L.northstarFitHair("nh4-grey").choice, { ...FREE, hair: "nh4-grey" }, "D-373's hairstyles still go on");
});

test("D-377 with the flag off, a browser's opt-in shows the cards; on by default (D-378): both colours can be put on and keep the outfit; a part keeps the top knot; only the head differs; Avatar, Hub and the quiz draw it", async () => {
  const O = await layers(true, { flagOff: true });
  assert.equal(O.isNorthstarHairNh5bOn(), true, "the opt-in still shows the cards with the flag off");
  assert.deepEqual(Object.keys(O.northstarSelectableHairs()), ["standard", "nh4-grey", "nh4-brown", ...KNOTS]);
  const L = await layers(false);
  assert.equal(L.isNorthstarHairNh5bOn(), true);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), ["standard", "nh4-grey", "nh4-brown", ...KNOTS], "five cards, the top knot last");
  const plans = {};
  for (const hair of ["standard", ...KNOTS]) {
    L.northstarUseAccount({ northstar: { ...FREE } });
    assert.deepEqual(L.northstarFitHair(hair).choice, { ...FREE, hair }, hair + ": the outfit stays and is saved with the hairstyle");
    L.northstarUseAccount({ northstar: { ...FREE, hair } });
    assert.equal(L.northstarHairNow(), hair);
    assert.deepEqual(L.northstarFitPiece("top-tank-navy").choice, { ...FREE, top: "top-tank-navy", hair }, hair + ": a part keeps the hairstyle");
    const r = L.northstarRenderFor("avatar", []);
    assert.deepEqual(headOf(r), [HEAD(hair)]); assert.ok(r.key.endsWith("+hair:" + hair), r.key);
    plans[hair] = r.plan;
    for (const surface of ["hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(surface, [])), [HEAD(hair)], hair + " on " + surface);
  }
  const strip = (p) => p.map((s) => (/avatar-northstar-hair\//.test(s.src) ? { ...s, src: "HEAD" } : s));
  for (const k of KNOTS) assert.deepEqual(strip(plans[k]), strip(plans.standard), k + ": body, arms, outfit and shadows are the same steps");
  L.northstarUseAccount({ northstar: { outfit: "K01" } });
  assert.deepEqual(L.northstarFitHair("nh5b-brown").choice, { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige", hair: "nh5b-brown" }, "an older K choice keeps its parts");
});

test("D-377 saved avatars: a stored top knot is drawn without any opt-in, also with the flag off; every older choice is drawn as before", async () => {
  const F = await layers(false, { flagOff: true });
  for (const hair of KNOTS) { F.northstarUseAccount({ northstar: { ...FREE, hair } }); for (const s of ["avatar", "hub", "quiz"]) assert.deepEqual(headOf(F.northstarRenderFor(s, [])), [HEAD(hair)], hair + " on " + s + " (flag off)"); }
  const L = await layers(false);
  for (const hair of KNOTS) { L.northstarUseAccount({ northstar: { ...FREE, hair } }); for (const s of ["avatar", "hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(s, [])), [HEAD(hair)], hair + " on " + s); }
  const cases = [[{ ...FREE }, "standard"], [{ ...FREE, hair: "nh4-grey" }, "nh4-grey"], [{ ...FREE, hair: "nh4-brown" }, "nh4-brown"], [{ ...FREE, hair: "nh5b-blue" }, "standard"], [{ outfit: "K01" }, "standard"]];
  for (const [choice, hair] of cases) {
    L.northstarUseAccount({ northstar: choice });
    assert.equal(L.northstarHairNow(), hair, JSON.stringify(choice));
    assert.deepEqual(headOf(L.northstarRenderFor("avatar", [])), [HEAD(hair)], JSON.stringify(choice));
  }
  assert.equal(L.northstarRenderFor("shop", []), null, "the other surfaces keep today's path");
});

test("D-377 wardrobe: the cards come from the selectable hairstyles, and the page takes ?northstarnh5b=1 / =0", () => {
  const panel = read("js/avatar-northstar-panel.js").toString("utf8");
  assert.match(panel, /for \(const \[id, h\] of Object\.entries\(northstarSelectableHairs\(\)\)\)/);
  assert.match(panel, /get\("northstarnh5b"\)/);
  assert.match(panel, /if \(k === "1"\) store\(NORTHSTAR_HAIR_NH5B_OPT_IN_KEY, "1"\);/);
  assert.match(panel, /else if \(k === "0"\) store\(NORTHSTAR_HAIR_NH5B_OPT_IN_KEY, null\);/);
  assert.ok(!/NORTHSTAR_HAIRS\b/.test(panel), "the panel no longer lists D-373's catalogue directly");
});

test("D-377 assets: the two published heads are byte for byte D-376's bound WebP heads; the raw image and the intermediate files are not in the repository", () => {
  assert.equal(EX.decision, "D-376");
  assert.equal(sha(read("assets/avatar-northstar-hair/head-nh5b-grey-v1.webp")), EX.outputs.greyHeadWebp.sha256);
  assert.equal(sha(read("assets/avatar-northstar-hair/head-nh5b-brown-v1.webp")), EX.outputs.brownHeadWebp.sha256);
  assert.equal(EX.outputs.greyHeadWebp.sha256, "c18f7f1e4b7f6c174ae75606185b161336cb822b53421ed274fa5b7f2497a126");
  assert.equal(EX.outputs.brownHeadWebp.sha256, "e98666ccb90545ab766386919b3bd10e1745bb139c14c1826775ed1bb0127323");
  const bound = new Set([...EX.inputs.map((i) => i.sha256), ...Object.entries(EX.outputs).filter(([k]) => !/Webp$/.test(k)).map(([, o]) => o.sha256)]);
  let tracked = [];
  try { tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracked = []; }
  for (const f of tracked.filter((p) => /\.(png|webp)$/i.test(p) && /hair/i.test(p))) assert.ok(!bound.has(sha(read(f))), f + " is a private D-376 file");
  for (const n of [...EX.inputs.map((i) => i.name), ...Object.entries(EX.outputs).filter(([k]) => !/Webp$/.test(k)).map(([, o]) => o.name)]) assert.ok(!tracked.some((p) => p.endsWith("/" + n)), n + " is not tracked");
  assert.ok(!existsSync(join(ROOT, "assets", "avatar-northstar-hair", "nh.image-1.png")));
});

test("D-377 migration: D-373's validation verbatim, the hair list extended with the two top knots only — every other rule still holds (PGlite)", async () => {
  const body = (s) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION"));
  const was = "NOT IN ('standard', 'nh4-grey', 'nh4-brown') THEN", now = "NOT IN ('standard', 'nh4-grey', 'nh4-brown', 'nh5b-grey', 'nh5b-brown') THEN";
  const msgWas = "must be one of standard, nh4-grey, nh4-brown';", msgNow = "must be one of standard, nh4-grey, nh4-brown, nh5b-grey, nh5b-brown';";
  assert.equal(body(MIGRATION), body(D373).replace(was, now).replace(msgWas, msgNow), "only the hair list and its message change");
  assert.equal(APPLIED_IN_PRODUCTION[NAME], "20261115131725", "applied in production 2026-11-15 (D-377)");
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
  await pg.exec(D357); await pg.exec(D373);
  const A = "00000000-0000-0000-0000-00000000037a";
  await pg.query("INSERT INTO public.profiles (id) VALUES ($1)", [A]);
  await pg.exec(`SELECT set_config('test.uid', '${A}', false)`);
  const save = (c) => pg.query("SELECT public.set_avatar_northstar($1::jsonb) AS r", [JSON.stringify(c)]);
  const stored = async () => (await pg.query("SELECT avatar_identity->'northstar' AS n FROM public.profiles WHERE id = $1", [A])).rows[0].n;
  await save({ ...FREE, hair: "nh4-grey" });
  for (const k of KNOTS) await assert.rejects(save({ ...FREE, hair: k }), /hair must be one of standard, nh4-grey, nh4-brown'?$/, k + " is refused before D-377 (production today)");
  assert.deepEqual(await stored(), { ...FREE, hair: "nh4-grey" }, "a refused save changes nothing");
  await pg.exec(MIGRATION);
  assert.deepEqual(await stored(), { ...FREE, hair: "nh4-grey" }, "the migration leaves saved avatars alone");
  for (const hair of ["standard", "nh4-grey", "nh4-brown", ...KNOTS]) { await save({ ...FREE, hair }); assert.deepEqual(await stored(), { ...FREE, hair }); }
  await save({ ...FREE, top: "top-tank-navy", hair: "nh5b-brown" }); assert.deepEqual(await stored(), { ...FREE, top: "top-tank-navy", hair: "nh5b-brown" });
  for (const bad of ["nh5b-blue", "nh5b", "NH5B-GREY", "nh5a-grey", "pink", ""]) await assert.rejects(save({ ...FREE, hair: bad }), /hair must be one of|short item ids/, bad);
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
  await set({ v: 1, body_type: "neutral", hairstyle: "afro", skin_tone: "dark", hair_color: "red", chosen_at: "x", northstar: { ...FREE, hair: "nh5b-grey" } });
  await set({});
  await pg.close();
});
