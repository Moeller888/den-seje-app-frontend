// D-373: the hair choice on the Northstar figure — three published heads on one shared head base, behind NORTHSTAR_HAIR_CHOICE (off).
// The static tests run everywhere: the flag is off and changes nothing; with a browser's opt-in the head follows the stored hairstyle and
// only the head; the published heads are exactly the fixture's; the migration accepts the three hairstyles and nothing else (PGlite).
// The rebuild from NH-4's raw image needs the private files and the vendored libwebp, so it is not a unit test (D-094: no unit file may
// depend on a vendored binary): tools/avatar/build-northstar-hair-heads-d373.mjs checks every hash against the fixture itself and exits 1
// on any difference (D-373.md records its runs). 0 image calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import * as B from "../../tools/avatar/build-northstar-hair-heads-d373.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(ROOT, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const FX = JSON.parse(read(B.FIXTURE).toString("utf8")), EX = JSON.parse(read("tools/avatar/fixtures/northstar-hair-d371/exception-d372-v1.json").toString("utf8"));
const MIGRATION = read("supabase/migrations/20261112150000_avatar_northstar_hair_d373.sql").toString("utf8");
const D357 = read("supabase/migrations/20261106120000_avatar_northstar_choice.sql").toString("utf8");
const TODAY = "/assets/avatar-northstar/figure-head-v1.webp";
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };

// a fresh module per case, with or without this browser's opt-in
async function layers(optIn) {
  const store = new Map(optIn ? [["avatar_northstar_hair", "1"]] : []);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return import("../../js/avatar-layers.js?d373=" + Math.random());
}
const headOf = (r) => r.plan.filter((s) => s.op === "draw" && /head/.test(s.src)).map((s) => s.src);

test("D-373 off: the flag is off, and the figure, its key and every save are exactly as before", async () => {
  const L = await layers(false);
  assert.equal(L.NORTHSTAR_HAIR_CHOICE, false);
  assert.equal(L.isNorthstarHairOn(), false);
  L.northstarUseAccount({ northstar: { ...FREE, hair: "nh4-grey" } });
  assert.equal(L.northstarHairNow(), null);
  const r = L.northstarRenderFor("avatar", []);
  assert.deepEqual(headOf(r), [TODAY], "today's head");
  assert.equal(r.key, "FRI+top-tee-hip-blue+bottom-trousers-square-navy+shoes-sneakers-white", "today's figure key");
  assert.equal("hair" in L.northstarFitPiece("top-tank-navy").choice, false, "a part saves without a hairstyle");
  assert.equal(L.northstarFitHair("nh4-grey"), null);
});

test("D-373 on (a browser's opt-in): the head follows the stored hairstyle, the standard hair for every choice without one", async () => {
  const L = await layers(true);
  assert.equal(L.isNorthstarHairOn(), true);
  const cases = [[{ ...FREE }, "standard"], [{ ...FREE, hair: "nh4-grey" }, "nh4-grey"], [{ ...FREE, hair: "nh4-brown" }, "nh4-brown"], [{ ...FREE, hair: "pink" }, "standard"], [{ outfit: "K01" }, "standard"]];
  const plans = {};
  for (const [choice, hair] of cases) {
    L.northstarUseAccount({ northstar: choice });
    assert.equal(L.northstarHairNow(), hair, JSON.stringify(choice));
    const r = L.northstarRenderFor("avatar", []);
    assert.deepEqual(headOf(r), ["/assets/avatar-northstar-hair/" + L.NORTHSTAR_HAIRS[hair].file]);
    assert.ok(r.key.endsWith("+hair:" + hair), r.key);
    if (choice.outfit === "FRI") plans[hair] = r.plan;
  }
  // only the head differs between the hairstyles: the body, arms, outfit layers and shadows are the same steps in the same order
  const strip = (p) => p.map((s) => (/avatar-northstar-hair\//.test(s.src) ? { ...s, src: "HEAD" } : s));
  assert.deepEqual(strip(plans["nh4-grey"]), strip(plans.standard)); assert.deepEqual(strip(plans["nh4-brown"]), strip(plans.standard));
  for (const surface of ["hub", "quiz"]) { L.northstarUseAccount({ northstar: { ...FREE, hair: "nh4-brown" } }); assert.deepEqual(headOf(L.northstarRenderFor(surface, [])), ["/assets/avatar-northstar-hair/head-nh4-brown-v1.webp"], surface); }
  assert.equal(L.northstarRenderFor("shop", []), null, "the other surfaces keep today's path");
});

test("D-373 on: a hairstyle keeps the outfit, a part keeps the hairstyle, and both are saved as one choice", async () => {
  const L = await layers(true);
  L.northstarUseAccount({ northstar: { ...FREE } });
  assert.deepEqual(L.northstarFitHair("nh4-grey").choice, { ...FREE, hair: "nh4-grey" }, "the outfit stays");
  assert.equal(L.northstarFitHair("pink"), null);
  L.northstarUseAccount({ northstar: { ...FREE, hair: "nh4-grey" } });
  assert.deepEqual(L.northstarFitPiece("top-tank-navy").choice, { ...FREE, top: "top-tank-navy", hair: "nh4-grey" }, "the hairstyle stays");
  L.northstarUseAccount({ northstar: { outfit: "K01" } });
  assert.deepEqual(L.northstarFitHair("nh4-brown").choice, { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige", hair: "nh4-brown" }, "an older K choice keeps its parts");
  L.northstarUseAccount({});
  const start = L.NORTHSTAR_OUTFITS[L.NORTHSTAR_START_OUTFIT];
  assert.deepEqual(L.northstarFitHair("standard").choice, { outfit: "FRI", top: start.top, pants: start.bottom, shoes: start.shoes, hair: "standard" }, "on today's avatar, the start outfit");
});

test("D-373 wardrobe: hair cards only with the hair choice on, under Hoved; the page shows a grid under the category it names", () => {
  const panel = read("js/avatar-northstar-panel.js").toString("utf8"), page = read("avatar.html").toString("utf8");
  assert.match(panel, /if \(isNorthstarHairOn\(\)\) \{/);
  assert.match(panel, /grid\.dataset\.itemCategory = NORTHSTAR_HAIR_ITEM_CATEGORY;/);
  assert.match(panel, /category === "hair" \? putHair\(item\) : put\(item\)/);
  assert.match(page, /const on = grid\.dataset\.itemCategory \? grid\.dataset\.itemCategory === cat\.key : grid\.dataset\.wardrobeCategory === cat\.wardrobe;/);
  assert.match(panel, /get\("northstarhair"\)/);
});

test("D-373 assets: exactly the three heads the fixture pins, reconciled with D-372's bound layers", async () => {
  const L = await layers(false);
  assert.deepEqual(Object.keys(FX.heads), Object.keys(L.NORTHSTAR_HAIRS));
  for (const [k, o] of Object.entries(FX.heads)) {
    assert.equal(o.file, L.NORTHSTAR_HAIRS[k].file); assert.equal(o.label, L.NORTHSTAR_HAIRS[k].label);
    assert.equal(sha(read(B.ASSET_DIR + "/" + o.file)), o.webpSha256, o.file);
    for (const h of [o.pngSha256, o.webpSha256]) assert.match(h, /^[0-9a-f]{64}$/);
  }
  assert.equal(L.NORTHSTAR_HAIR_BASE_PATH, "/" + B.ASSET_DIR);
  assert.deepEqual([FX.d372.greyLayer, FX.d372.brownLayer], [EX.outputs.greyLayer.sha256, EX.outputs.brownLayer.sha256], "D-373 starts from D-372's bound layers");
  assert.equal(FX.inputs.find((i) => i.role === "raw").sha256, EX.inputs.find((i) => i.role === "raw").sha256);
  for (const i of FX.inputs) assert.equal(i.tracked, false, i.role);
  assert.equal(sha(read(B.APP_HEAD)), FX.appHead.sha256, "today's head is unchanged");
  assert.deepEqual([B.TIP.x, B.TIP.rows, B.TIP.into], [[383, 398], [299, 311], [299, 304]]); assert.deepEqual([FX.temple.x, FX.temple.rows, FX.temple.into], [[383, 398], [299, 311], [299, 304]]);
  assert.deepEqual([B.NECK_Y, B.EAR_TOP_Y, B.RIM_REACH], [430, 340, 3]);
  const code = read("tools/avatar/build-northstar-hair-heads-d373.mjs").toString("utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  for (const re of [/fetch\(/, /https?:\/\//, /OPENAI/, /process\.env/, /Math\.random/, /Date\.now|new Date/]) assert.ok(!re.test(code), "the tool uses " + re);
});

test("D-373 migration: the hairstyle joins the northstar object — the three hairstyles only — and every older rule still holds (PGlite)", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, avatar_identity jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE FUNCTION public.validate_avatar_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
    CREATE TRIGGER validate_avatar_identity BEFORE UPDATE OF avatar_identity ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_avatar_identity();
  `);
  await pg.exec(D357);
  const A = "00000000-0000-0000-0000-00000000000a";
  await pg.query("INSERT INTO public.profiles (id) VALUES ($1)", [A]);
  await pg.exec(`SELECT set_config('test.uid', '${A}', false)`);
  const save = (c) => pg.query("SELECT public.set_avatar_northstar($1::jsonb) AS r", [JSON.stringify(c)]);
  await assert.rejects(save({ ...FREE, hair: "nh4-grey" }), /short item ids/, "before D-373 the key is refused (production today)");
  await pg.exec(MIGRATION);
  for (const hair of ["standard", "nh4-grey", "nh4-brown"]) {
    await save({ ...FREE, hair });
    assert.deepEqual((await pg.query("SELECT avatar_identity->'northstar' AS n FROM public.profiles WHERE id = $1", [A])).rows[0].n, { ...FREE, hair });
  }
  for (const bad of ["pink", "nh4-blue", "", "STANDARD"]) await assert.rejects(save({ ...FREE, hair: bad }), /hair must be one of|short item ids/, bad);
  await assert.rejects(save({ ...FREE, hair: 1 }), /short item ids/);
  await save(FREE);   // a choice without a hairstyle is still valid
  await assert.rejects(save({ hat: "x" }), /short item ids/);
  const set = (v) => pg.query("UPDATE public.profiles SET avatar_identity = $1::jsonb WHERE id = $2", [JSON.stringify(v), A]);
  await assert.rejects(set({ v: 1, body_type: "neutral", other: 1 }), /unknown keys/);
  await assert.rejects(set({ v: 1, body_type: "neutral", hairstyle: "x" }), /hairstyle/);
  await set({ v: 1, body_type: "neutral", hairstyle: "afro", skin_tone: "dark", hair_color: "red", chosen_at: "x" });
  await pg.close();
});

