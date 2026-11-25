// D-386: HAIR-25 group 1 — six hairstyles (N2, N3, N6, N7, V2, N5) approved by the owner 2026-11-24 in neutral grey and Northstar's brown,
// exactly as shown on the private assessment page — as twelve heads on the shared head base. Their twelve cards are SHOWN by default since
// the production trial passed (NORTHSTAR_HAIR_H25G1 = true), free like every other hairstyle; with the flag off (a copy of the module with
// only that line changed) they are hidden and shown only to a browser that opts in (avatar_northstar_hair_h25g1). A stored group-1 head is
// drawn on every surface whatever the flag. D-373's three, D-377's top knot and D-381's nape locks are unchanged. The published heads are byte for byte
// the WebP files bound in the approval fixture (lossless encodings of the approved PNG heads, which stay outside the repository). The
// migration extends D-381's validation (production's definition today) with the twelve values and keeps every other rule (PGlite).
// 0 image calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { REPO_AHEAD_OF_PRODUCTION, NOT_IN_PRODUCTION, APPLIED_IN_PRODUCTION } from "../isolated/schema/replay-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(ROOT, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const FX = JSON.parse(read("tools/avatar/fixtures/northstar-hair-d386/approval-h25g1-v1.json").toString("utf8"));
const NAME = "20261124120000_avatar_northstar_hair_h25g1_d386.sql";
const MIGRATION = read("supabase/migrations/" + NAME).toString("utf8");
const D381 = read("supabase/migrations/20261118090000_avatar_northstar_hair_nh5c_d381.sql").toString("utf8");
const D377 = read("supabase/migrations/20261115090000_avatar_northstar_hair_nh5b_d377.sql").toString("utf8");
const D373 = read("supabase/migrations/20261112150000_avatar_northstar_hair_d373.sql").toString("utf8");
const D357 = read("supabase/migrations/20261106120000_avatar_northstar_choice.sql").toString("utf8");
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };
const STYLES = ["h25n2", "h25n3", "h25n6", "h25n7", "h25v2", "h25n5"];
const G1 = STYLES.flatMap((s) => [s + "-grey", s + "-brown"]);
const G2 = ["h25d1", "h25v1", "h25n9"].flatMap((s) => [s + "-grey", s + "-brown"]);   // D-387's group 2, open by default, last under Hoved
const LABELS = { h25n2: "Page med pandehår", h25n3: "Bølget skulderhår", h25n6: "Lav hestehale", h25n7: "Stor afro", h25v2: "Tætte krøller", h25n5: "To fletninger" };
const TRIAL = { h25n2: "N2", h25n3: "N3", h25n6: "N6", h25n7: "N7", h25v2: "V2", h25n5: "N5" };
const BEFORE = ["standard", "nh4-grey", "nh4-brown", "nh5b-grey", "nh5b-brown", "nh5c-grey", "nh5c-brown"];
const HEAD = (hair) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";

// a fresh module per case, with or without this browser's opt-in to group 1; flagOff: the same module with only the flag line set to
// false (the module has no imports, so it loads as a data: URL, as in D-381's test)
const FLAG_ON = "export const NORTHSTAR_HAIR_H25G1 = true;";
async function layers(optIn, { flagOff = false } = {}) {
  const store = new Map(optIn ? [["avatar_northstar_hair_h25g1", "1"]] : []);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  if (!flagOff) return import("../../js/avatar-layers.js?d386=" + Math.random());
  const src = read("js/avatar-layers.js").toString("utf8");
  assert.equal(src.split(FLAG_ON).length, 2, "the flag line occurs once");
  return import("data:text/javascript;base64," + Buffer.from(src.replace(FLAG_ON, "export const NORTHSTAR_HAIR_H25G1 = false;") + "\n// " + Math.random()).toString("base64"));
}
const headOf = (r) => r.plan.filter((s) => s.op === "draw" && /head/.test(s.src)).map((s) => s.src);

test("D-386 open: the twelve group-1 cards are shown by default, last under Hoved after the nape locks, free like every other hairstyle, and go on without any opt-in", async () => {
  const L = await layers(false);
  assert.equal(L.NORTHSTAR_HAIR_H25G1, true, "the cards are shown by default");
  assert.equal(L.isNorthstarHairH25g1On(), true);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), [...BEFORE, ...G1, ...G2], "twenty-five cards, group 1 before D-387's group 2");
  // free like the other hairstyles: a hairstyle entry is only its file and label — no price, no shop item, nothing to unlock
  for (const [k, h] of Object.entries(L.northstarSelectableHairs())) assert.deepEqual(Object.keys(h).sort(), ["file", "label"], k + " carries no price");
  L.northstarUseAccount({ northstar: { ...FREE } });
  for (const k of [...BEFORE, ...G1]) assert.deepEqual(L.northstarFitHair(k).choice, { ...FREE, hair: k }, k + " goes on and keeps the outfit");
});

test("D-386 catalogue: twelve group-1 hairstyles in the owner's order with their Danish labels; with the flag off they are hidden; every earlier hairstyle unchanged and still selectable", async () => {
  const L = await layers(false, { flagOff: true });
  assert.equal(L.NORTHSTAR_HAIR_H25G1, false, "the copy has the flag off");
  assert.equal(L.NORTHSTAR_HAIR_H25G1_OPT_IN_KEY, "avatar_northstar_hair_h25g1");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_H25G1), G1);
  for (const s of STYLES) for (const [c, w] of [["grey", "gråt"], ["brown", "brunt"]])
    assert.deepEqual({ ...L.NORTHSTAR_HAIRS_H25G1[s + "-" + c] }, { file: "head-" + s + "-" + c + "-v1.webp", label: LABELS[s] + " · " + w });
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS), ["standard", "nh4-grey", "nh4-brown"], "D-373's catalogue is unchanged");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_NH5B), ["nh5b-grey", "nh5b-brown"], "D-377's catalogue is unchanged");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_NH5C), ["nh5c-grey", "nh5c-brown"], "D-381's catalogue is unchanged");
  assert.equal(L.NORTHSTAR_HAIR_NH5B, true); assert.equal(L.NORTHSTAR_HAIR_NH5C, true);
  assert.equal(L.isNorthstarHairH25g1On(), false);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), [...BEFORE, ...G2], "no group-1 card without the opt-in: the seven before it and D-387's group 2");
  L.northstarUseAccount({ northstar: { ...FREE } });
  for (const k of G1) assert.equal(L.northstarFitHair(k), null, k + " cannot be put on while its cards are hidden");
  for (const k of BEFORE) assert.deepEqual(L.northstarFitHair(k).choice, { ...FREE, hair: k }, k + " still goes on");
});

test("D-386 on by default (and, with the flag off, a browser's opt-in): every group-1 hairstyle goes on in both colours and keeps the outfit; a part keeps the hairstyle; only the head differs; Avatar, Hub and the quiz draw it", async () => {
  for (const [optIn, flagOff] of [[false, false], [true, true]]) {
    const L = await layers(optIn, { flagOff });
    assert.equal(L.isNorthstarHairH25g1On(), true, JSON.stringify({ optIn, flagOff }));
    assert.deepEqual(Object.keys(L.northstarSelectableHairs()), [...BEFORE, ...G1, ...G2], "twenty-five cards, group 1 before D-387's group 2");
    const plans = {};
    for (const hair of ["standard", ...G1]) {
      L.northstarUseAccount({ northstar: { ...FREE } });
      assert.deepEqual(L.northstarFitHair(hair).choice, { ...FREE, hair }, hair + ": the outfit stays and is saved with the hairstyle");
      L.northstarUseAccount({ northstar: { ...FREE, hair } });
      assert.equal(L.northstarHairNow(), hair);
      for (const top of ["top-tank-navy", "top-sweater-ls2-heather", "top-tee-hip-cream"]) assert.deepEqual(L.northstarFitPiece(top).choice, { ...FREE, top, hair }, hair + ": " + top + " keeps the hairstyle");
      for (const p of ["bottom-skirt-sand", "shoes-sneakers-beige"]) { const c = L.northstarFitPiece(p).choice; assert.equal(c.hair, hair, hair + ": " + p + " keeps the hairstyle"); }
      const r = L.northstarRenderFor("avatar", []);
      assert.deepEqual(headOf(r), [HEAD(hair)]); assert.ok(r.key.endsWith("+hair:" + hair), r.key);
      plans[hair] = r.plan;
      for (const surface of ["hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(surface, [])), [HEAD(hair)], hair + " on " + surface);
    }
    const strip = (p) => p.map((s) => (/avatar-northstar-hair\//.test(s.src) ? { ...s, src: "HEAD" } : s));
    for (const k of G1) assert.deepEqual(strip(plans[k]), strip(plans.standard), k + ": body, arms, outfit and shadows are the same steps");
    L.northstarUseAccount({ northstar: { outfit: "K01" } });
    assert.deepEqual(L.northstarFitHair("h25n7-brown").choice, { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige", hair: "h25n7-brown" }, "an older K choice keeps its parts");
  }
});

test("D-386 saved avatars: a stored group-1 head is drawn on Avatar, Hub and in the quiz without any opt-in, also with the flag off; every older choice is drawn as before; unknown values get the standard hair", async () => {
  const L = await layers(false, { flagOff: true });
  for (const hair of G1) { L.northstarUseAccount({ northstar: { ...FREE, hair } }); for (const s of ["avatar", "hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(s, [])), [HEAD(hair)], hair + " on " + s + " (flag off, no opt-in)"); }
  const cases = [[{ ...FREE }, "standard"], ...BEFORE.map((h) => [{ ...FREE, hair: h }, h]), [{ ...FREE, hair: "h25n2-blue" }, "standard"], [{ ...FREE, hair: "h25n4-grey" }, "standard"], [{ outfit: "K01" }, "standard"]];
  for (const [choice, hair] of cases) {
    L.northstarUseAccount({ northstar: choice });
    assert.equal(L.northstarHairNow(), hair, JSON.stringify(choice));
    assert.deepEqual(headOf(L.northstarRenderFor("avatar", [])), [HEAD(hair)], JSON.stringify(choice));
  }
  assert.equal(L.northstarRenderFor("shop", []), null, "the other surfaces keep today's path");
});

test("D-386 wardrobe: the cards come from the selectable hairstyles, and the page takes ?northstarh25=1 / =0 beside the earlier opt-ins", () => {
  const panel = read("js/avatar-northstar-panel.js").toString("utf8");
  assert.match(panel, /for \(const \[id, h\] of Object\.entries\(northstarSelectableHairs\(\)\)\)/);
  assert.match(panel, /get\("northstarh25"\)/);
  assert.match(panel, /if \(g === "1"\) store\(NORTHSTAR_HAIR_H25G1_OPT_IN_KEY, "1"\);/);
  assert.match(panel, /else if \(g === "0"\) store\(NORTHSTAR_HAIR_H25G1_OPT_IN_KEY, null\);/);
  for (const k of ["northstarnh5b", "northstarnh5c", "northstarhair"]) assert.match(panel, new RegExp('get\\("' + k + '"\\)'), k + " is still there");
});

test("D-386 approval and assets: the owner's approval binds every approved head by sha256; the twelve published heads are byte for byte the bound lossless WebP files; the private PNGs are not in the repository", () => {
  assert.equal(FX.decision, "D-386"); assert.equal(FX.approvedOn, "2026-11-24");
  assert.match(FX.ownerText, /N2, N3, N6, N7, V2 og N5, præcis som vist på vurderingssiden/);
  assert.match(FX.approvedPage.sha256, /^[0-9a-f]{64}$/);
  assert.equal(FX.method.version, "hair25v3-metode-r7a-2026-11-24");
  assert.deepEqual(FX.order, STYLES);
  assert.deepEqual(Object.keys(FX.hairs).sort(), [...G1].sort());
  for (const id of G1) {
    const h = FX.hairs[id], [style, colour] = id.split("-");
    assert.equal(h.trialId, TRIAL[style]); assert.equal(h.colour, colour); assert.equal(h.file, "head-" + id + "-v1.webp");
    assert.equal(h.label, LABELS[style] + " · " + (colour === "grey" ? "gråt" : "brunt"));
    for (const k of ["sha256", "pixelSha256"]) assert.match(h.approvedPng[k], /^[0-9a-f]{64}$/, id + " " + k);
    assert.equal(h.webp.lossless, true);
    const bytes = read("assets/avatar-northstar-hair/" + h.file);
    assert.equal(sha(bytes), h.webp.sha256, id + ": the published head is the bound WebP");
    assert.equal(bytes.length, h.webp.bytes);
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "RIFF"); assert.equal(bytes.subarray(12, 16).toString("latin1"), "VP8L", id + ": lossless WebP");
    const v = bytes.readUInt32LE(21); assert.deepEqual([(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1], [1024, 1536], id + ": on the figure grid");
    assert.deepEqual(Object.keys(h.figureRgbaSha256), ["top-tee-hip-cream", "top-tank-navy", "top-sweater-ls2-heather"]);
    assert.equal(Object.keys(h.pageViews).length, 4, id + ": the four page pictures the renderer reproduced");
  }
  assert.equal(new Set(G1.map((id) => FX.hairs[id].webp.sha256)).size, 12, "twelve different heads");
  let tracked = [];
  try { tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracked = []; }
  const bound = new Set(G1.map((id) => FX.hairs[id].approvedPng.sha256));
  for (const f of tracked.filter((p) => /\.(png|webp)$/i.test(p) && /hair|h25/i.test(p))) assert.ok(!bound.has(sha(read(f))), f + " is a private approved PNG");
  const dir = readdirSync(join(ROOT, "assets", "avatar-northstar-hair"));
  // since D-387 the folder also holds group 2's six heads, each bound by D-387's own approval fixture (tested in its own test)
  const G2FILES = Object.values(JSON.parse(read("tools/avatar/fixtures/northstar-hair-d387/approval-h25g2-v1.json").toString("utf8")).hairs).map((h) => h.file);
  assert.deepEqual(dir.filter((f) => /h25/.test(f)).sort(), [...G1.map((id) => "head-" + id + "-v1.webp"), ...G2FILES].sort(), "exactly the twelve heads (plus D-387's six bound heads), no intermediate file");
  assert.ok(!existsSync(join(ROOT, "assets", "avatar-northstar-hair", "vurdering.html")));
});

test("D-386 migration: D-381's validation verbatim, the hair list extended with the twelve group-1 values only — every other rule still holds (PGlite)", async () => {
  const body = (s) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION"));
  const was = "'nh5c-grey', 'nh5c-brown') THEN", now = "'nh5c-grey', 'nh5c-brown', " + G1.map((k) => "'" + k + "'").join(", ") + ") THEN";
  const msgWas = "nh5c-grey, nh5c-brown';", msgNow = "nh5c-grey, nh5c-brown, " + G1.join(", ") + "';";
  assert.equal(body(MIGRATION), body(D381).replace(was, now).replace(msgWas, msgNow), "only the hair list and its message change");
  assert.match(MIGRATION, /md5 f3bbb41c6f6fa76b79d4d7a103c7264c/, "production's definition read before the change");
  assert.equal(APPLIED_IN_PRODUCTION[NAME], "20261124160706", "applied in production 2026-11-24 (D-386)");
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
  await pg.exec(D357); await pg.exec(D373); await pg.exec(D377); await pg.exec(D381);
  const A = "00000000-0000-0000-0000-00000000386a";
  await pg.query("INSERT INTO public.profiles (id) VALUES ($1)", [A]);
  await pg.exec(`SELECT set_config('test.uid', '${A}', false)`);
  const save = (c) => pg.query("SELECT public.set_avatar_northstar($1::jsonb) AS r", [JSON.stringify(c)]);
  const stored = async () => (await pg.query("SELECT avatar_identity->'northstar' AS n FROM public.profiles WHERE id = $1", [A])).rows[0].n;
  await save({ ...FREE, hair: "nh5c-brown" });
  for (const k of G1) await assert.rejects(save({ ...FREE, hair: k }), /hair must be one of standard, nh4-grey, nh4-brown, nh5b-grey, nh5b-brown, nh5c-grey, nh5c-brown'?$/, k + " is refused before D-386 (production today)");
  assert.deepEqual(await stored(), { ...FREE, hair: "nh5c-brown" }, "a refused save changes nothing");
  await pg.exec(MIGRATION);
  assert.deepEqual(await stored(), { ...FREE, hair: "nh5c-brown" }, "the migration leaves saved avatars alone");
  for (const hair of [...BEFORE, ...G1]) { await save({ ...FREE, hair }); assert.deepEqual(await stored(), { ...FREE, hair }); }
  for (const top of ["top-tank-navy", "top-sweater-ls2-heather"]) { await save({ ...FREE, top, hair: "h25v2-grey" }); assert.deepEqual(await stored(), { ...FREE, top, hair: "h25v2-grey" }); }
  for (const bad of ["h25n2-blue", "h25n2", "H25N2-GREY", "h25n4-grey", "h25n9-brown", "h25-n2-grey", "pink", ""]) await assert.rejects(save({ ...FREE, hair: bad }), /hair must be one of|short item ids/, bad);
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
  await set({ v: 1, body_type: "neutral", hairstyle: "afro", skin_tone: "dark", hair_color: "red", chosen_at: "x", northstar: { ...FREE, hair: "h25n5-brown" } });
  await set({});
  await pg.close();
});
