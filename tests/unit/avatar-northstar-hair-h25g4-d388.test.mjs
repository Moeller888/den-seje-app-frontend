// D-388: HAIR-25 trial G4 — three hairstyles (V5H-2, D5-2, D4-1) approved by the owner 2026-11-26 in neutral grey and Northstar's brown,
// exactly as shown on the private G4 assessment page (vurdering.html; ONLY these three candidates, not V5H-1, D5-1, D4-2) — as six heads on
// the shared head base. V5H is a separate private recipe variant of V5 (bound in the fixture). Their six cards are HIDDEN by default
// (NORTHSTAR_HAIR_H25G4 = false) until D-388's migration is applied in production; a browser's opt-in (avatar_northstar_hair_h25g4) shows
// them, and the flag turned on (a copy of the module with only that line changed) shows the same. A stored G4 head is drawn on every
// surface whatever the flag. Every earlier hairstyle (D-373, D-377, D-381, D-386, D-387) is unchanged. The published heads are byte for
// byte the WebP files bound in the approval fixture (lossless encodings of the approved PNG heads, which stay outside the repository); the
// fixture also records that the long hair lies in front of every top at the ears and shoulders. The migration extends D-387's validation
// (production's definition today) with the six values and keeps every other rule (PGlite). Free like every other hairstyle. 0 image calls.
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
const FX = JSON.parse(read("tools/avatar/fixtures/northstar-hair-d388/approval-h25g4-v1.json").toString("utf8"));
const NAME = "20261126154317_avatar_northstar_hair_h25g4_d388.sql";
const MIGRATION = read("supabase/migrations/" + NAME).toString("utf8");
const D387 = read("supabase/migrations/20261125113412_avatar_northstar_hair_h25g2_d387.sql").toString("utf8");
const D386 = read("supabase/migrations/20261124120000_avatar_northstar_hair_h25g1_d386.sql").toString("utf8");
const D381 = read("supabase/migrations/20261118090000_avatar_northstar_hair_nh5c_d381.sql").toString("utf8");
const D377 = read("supabase/migrations/20261115090000_avatar_northstar_hair_nh5b_d377.sql").toString("utf8");
const D373 = read("supabase/migrations/20261112150000_avatar_northstar_hair_d373.sql").toString("utf8");
const D357 = read("supabase/migrations/20261106120000_avatar_northstar_choice.sql").toString("utf8");
const FREE = { outfit: "FRI", top: "top-tee-hip-blue", pants: "bottom-trousers-square-navy", shoes: "shoes-sneakers-white" };
const STYLES = ["h25v5", "h25d5", "h25d4"];
const G4 = STYLES.flatMap((s) => [s + "-grey", s + "-brown"]);
const LABELS = { h25v5: "Sidefletning", h25d5: "Lange fletninger", h25d4: "Høj hestehale" };
const TRIAL = { h25v5: "V5H-2", h25d5: "D5-2", h25d4: "D4-1" };
const G1 = ["h25n2", "h25n3", "h25n6", "h25n7", "h25v2", "h25n5"].flatMap((s) => [s + "-grey", s + "-brown"]);
const G2 = ["h25d1", "h25v1", "h25n9"].flatMap((s) => [s + "-grey", s + "-brown"]);
const BEFORE = ["standard", "nh4-grey", "nh4-brown", "nh5b-grey", "nh5b-brown", "nh5c-grey", "nh5c-brown", ...G1, ...G2];
const HEAD = (hair) => "/assets/avatar-northstar-hair/head-" + hair + "-v1.webp";
// the six tops of the G4 assessment page and the two of the page's tank/sweater pictures
const TOPS = ["top-tee-hip-cream", "top-sweater-ls2-navy", "top-tank-burgundy-pique", "top-tee-hip-breton-stripe", "top-sweater-ls2-sand-fox", "top-tank-heather", "top-tank-navy", "top-sweater-ls2-heather"];

// a fresh module per case, with or without this browser's opt-in to G4; flagOn: the same module with only the flag line set to true
// (the module has no imports, so it loads as a data: URL, as in D-386's and D-387's tests)
const FLAG_OFF = "export const NORTHSTAR_HAIR_H25G4 = false;";
async function layers(optIn, { flagOn = false } = {}) {
  const store = new Map(optIn ? [["avatar_northstar_hair_h25g4", "1"]] : []);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  if (!flagOn) return import("../../js/avatar-layers.js?d388=" + Math.random());
  const src = read("js/avatar-layers.js").toString("utf8");
  assert.equal(src.split(FLAG_OFF).length, 2, "the flag line occurs once");
  return import("data:text/javascript;base64," + Buffer.from(src.replace(FLAG_OFF, "export const NORTHSTAR_HAIR_H25G4 = true;") + "\n// " + Math.random()).toString("base64"));
}
const headOf = (r) => r.plan.filter((s) => s.op === "draw" && /head/.test(s.src)).map((s) => s.src);

test("D-388 catalogue: six G4 hairstyles in the owner's order with their Danish labels, free, hidden by default; every earlier hairstyle unchanged and still selectable", async () => {
  const L = await layers(false);
  assert.equal(L.NORTHSTAR_HAIR_H25G4, false, "hidden until the migration is applied");
  assert.equal(L.NORTHSTAR_HAIR_H25G4_OPT_IN_KEY, "avatar_northstar_hair_h25g4");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_H25G4), G4);
  for (const s of STYLES) for (const [c, w] of [["grey", "gråt"], ["brown", "brunt"]])
    assert.deepEqual({ ...L.NORTHSTAR_HAIRS_H25G4[s + "-" + c] }, { file: "head-" + s + "-" + c + "-v1.webp", label: LABELS[s] + " · " + w }, "only file and label: free, no price");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS), ["standard", "nh4-grey", "nh4-brown"], "D-373's catalogue is unchanged");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_NH5B), ["nh5b-grey", "nh5b-brown"], "D-377's catalogue is unchanged");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_NH5C), ["nh5c-grey", "nh5c-brown"], "D-381's catalogue is unchanged");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_H25G1), G1, "D-386's catalogue is unchanged");
  assert.deepEqual(Object.keys(L.NORTHSTAR_HAIRS_H25G2), G2, "D-387's catalogue is unchanged");
  assert.equal(L.NORTHSTAR_HAIR_NH5B, true); assert.equal(L.NORTHSTAR_HAIR_NH5C, true); assert.equal(L.NORTHSTAR_HAIR_H25G1, true); assert.equal(L.NORTHSTAR_HAIR_H25G2, true);
  assert.equal(L.isNorthstarHairH25g4On(), false);
  assert.deepEqual(Object.keys(L.northstarSelectableHairs()), BEFORE, "no G4 card without the opt-in: today's twenty-five cards");
  L.northstarUseAccount({ northstar: { ...FREE } });
  for (const k of G4) assert.equal(L.northstarFitHair(k), null, k + " cannot be put on while its cards are hidden");
  for (const k of BEFORE) assert.deepEqual(L.northstarFitHair(k).choice, { ...FREE, hair: k }, k + " still goes on");
});

test("D-388 with a browser's opt-in (and with the flag turned on): every G4 hairstyle goes on in both colours and keeps the outfit; every top, a skirt and shoes keep the hairstyle; only the head differs; Avatar, Hub and the quiz draw it", async () => {
  for (const [optIn, flagOn] of [[true, false], [false, true]]) {
    const L = await layers(optIn, { flagOn });
    assert.equal(L.isNorthstarHairH25g4On(), true, JSON.stringify({ optIn, flagOn }));
    assert.deepEqual(Object.keys(L.northstarSelectableHairs()), [...BEFORE, ...G4], "thirty-one cards, G4 last");
    for (const [k, h] of Object.entries(L.northstarSelectableHairs())) assert.deepEqual(Object.keys(h).sort(), ["file", "label"], k + ": free like the other hairstyles");
    const plans = {};
    for (const hair of ["standard", ...G4]) {
      L.northstarUseAccount({ northstar: { ...FREE } });
      assert.deepEqual(L.northstarFitHair(hair).choice, { ...FREE, hair }, hair + ": the outfit stays and is saved with the hairstyle");
      L.northstarUseAccount({ northstar: { ...FREE, hair } });
      assert.equal(L.northstarHairNow(), hair);
      for (const top of TOPS) assert.deepEqual(L.northstarFitPiece(top).choice, { ...FREE, top, hair }, hair + ": " + top + " keeps the hairstyle");
      for (const p of ["bottom-skirt-sand", "shoes-sneakers-beige"]) { const c = L.northstarFitPiece(p).choice; assert.equal(c.hair, hair, hair + ": " + p + " keeps the hairstyle"); }
      const r = L.northstarRenderFor("avatar", []);
      assert.deepEqual(headOf(r), [HEAD(hair)]); assert.ok(r.key.endsWith("+hair:" + hair), r.key);
      plans[hair] = r.plan;
      for (const surface of ["hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(surface, [])), [HEAD(hair)], hair + " on " + surface);
    }
    const strip = (p) => p.map((s) => (/avatar-northstar-hair\//.test(s.src) ? { ...s, src: "HEAD" } : s));
    for (const k of G4) assert.deepEqual(strip(plans[k]), strip(plans.standard), k + ": body, arms, outfit and shadows are the same steps");
    // the long hair lies in front of the clothes: on every top the head is the last layer drawn (only the body shadows come after it)
    const o = L.NORTHSTAR_OUTFITS[L.NORTHSTAR_START_OUTFIT];
    for (const top of TOPS) {
      const plan = L.northstarPlanFor({ ...o, top }), draws = plan.filter((s) => s.op === "draw");
      assert.match(draws[draws.length - 1].src, /figure-head-v1\.webp$/, top + ": the head is drawn after every garment and sleeve");
    }
    L.northstarUseAccount({ northstar: { outfit: "K01" } });
    assert.deepEqual(L.northstarFitHair("h25d5-brown").choice, { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige", hair: "h25d5-brown" }, "an older K choice keeps its parts");
  }
});

test("D-388 saved avatars: a stored G4 head is drawn on Avatar, Hub and in the quiz without any opt-in; every older choice is drawn as before; unknown values and the unapproved candidates get the standard hair", async () => {
  const L = await layers(false);
  for (const hair of G4) { L.northstarUseAccount({ northstar: { ...FREE, hair } }); for (const s of ["avatar", "hub", "quiz"]) assert.deepEqual(headOf(L.northstarRenderFor(s, [])), [HEAD(hair)], hair + " on " + s + " (flag off, no opt-in)"); }
  const cases = [[{ ...FREE }, "standard"], ...BEFORE.map((h) => [{ ...FREE, hair: h }, h]), [{ ...FREE, hair: "h25v5-blue" }, "standard"], [{ ...FREE, hair: "h25d3-grey" }, "standard"], [{ ...FREE, hair: "h25v5h-grey" }, "standard"], [{ outfit: "K01" }, "standard"]];
  for (const [choice, hair] of cases) {
    L.northstarUseAccount({ northstar: choice });
    assert.equal(L.northstarHairNow(), hair, JSON.stringify(choice));
    assert.deepEqual(headOf(L.northstarRenderFor("avatar", [])), [HEAD(hair)], JSON.stringify(choice));
  }
  assert.equal(L.northstarRenderFor("shop", []), null, "the other surfaces keep today's path");
});

test("D-388 wardrobe: the cards come from the selectable hairstyles, and the page takes ?northstarh25g4=1 / =0 beside the earlier opt-ins", () => {
  const panel = read("js/avatar-northstar-panel.js").toString("utf8");
  assert.match(panel, /for \(const \[id, h\] of Object\.entries\(northstarSelectableHairs\(\)\)\)/);
  assert.match(panel, /get\("northstarh25g4"\)/);
  assert.match(panel, /if \(g4 === "1"\) store\(NORTHSTAR_HAIR_H25G4_OPT_IN_KEY, "1"\);/);
  assert.match(panel, /else if \(g4 === "0"\) store\(NORTHSTAR_HAIR_H25G4_OPT_IN_KEY, null\);/);
  for (const k of ["northstarh25g2", "northstarh25", "northstarnh5b", "northstarnh5c", "northstarhair"]) assert.match(panel, new RegExp('get\\("' + k + '"\\)'), k + " is still there");
});

test("D-388 approval and assets: the owner's approval binds the three candidates' heads, the page and the recipes by sha256 (V5H documented as a private recipe variant); the six published heads are byte for byte the bound lossless WebP files; the long hair lies in front of every top; the private PNGs are not in the repository", () => {
  assert.equal(FX.decision, "D-388"); assert.equal(FX.approvedOn, "2026-11-26");
  assert.match(FX.ownerText, /V5H-2, D5-2 og D4-1 i både brun og grå, præcis som vist på G4-vurderingssiden/);
  assert.match(FX.ownerText, /omfatter kun disse tre kandidater/);
  assert.deepEqual(FX.notApproved, ["V5H-1", "D5-1", "D4-2"]);
  assert.equal(FX.approvedPage.path, "run-3/forsoeg-g4/vurdering.html");
  for (const k of ["approvedPage", "verdicts"]) assert.match(FX[k].sha256, /^[0-9a-f]{64}$/, k);
  assert.equal(FX.method.version, "hair25v3-metode-r7a-2026-11-24");
  assert.equal(FX.privateRecipeVariant.trialId, "V5H-2"); assert.match(FX.privateRecipeVariant.note, /særskilt privat opskriftsvariant/);
  assert.deepEqual(Object.keys(FX.recipes), ["V5H-2", "D5-2", "D4-1"]);
  for (const [t, r] of Object.entries(FX.recipes)) {
    for (const k of ["recipe", "prompt", "prepared", "raw", "eval"]) { assert.match(r[k].sha256, /^[0-9a-f]{64}$/, t + " " + k); assert.ok(r[k].path.startsWith("run-3/forsoeg-g4/"), t + " " + k); }
    assert.equal(r.callId, "H25V3-dev13-" + t);
    assert.equal(r.privateRecipeVariant, t === "V5H-2", t + ": only V5H is the private recipe variant");
    if (t === "V5H-2") { assert.match(r.variant.name, /privat opskriftsvariant/); assert.ok(Object.keys(r.variant.files).some((f) => f.endsWith("g4-v5-guide-h.mjs"))); for (const h of Object.values(r.variant.files)) assert.match(h, /^[0-9a-f]{64}$/); }
    else assert.equal(r.variant, undefined);
  }
  assert.deepEqual(FX.order, STYLES);
  assert.deepEqual(Object.keys(FX.hairs).sort(), [...G4].sort());
  for (const id of G4) {
    const h = FX.hairs[id], [style, colour] = id.split("-");
    assert.equal(h.trialId, TRIAL[style]); assert.equal(h.colour, colour); assert.equal(h.file, "head-" + id + "-v1.webp");
    assert.equal(h.label, LABELS[style] + " · " + (colour === "grey" ? "gråt" : "brunt"));
    for (const k of ["sha256", "pixelSha256"]) assert.match(h.approvedPng[k], /^[0-9a-f]{64}$/, id + " " + k);
    assert.ok(h.approvedPng.path.startsWith("run-3/forsoeg-g4/faerdig/" + TRIAL[style] + "/"), id + ": from the approved candidate's folder");
    assert.equal(h.webp.lossless, true);
    const bytes = read("assets/avatar-northstar-hair/" + h.file);
    assert.equal(sha(bytes), h.webp.sha256, id + ": the published head is the bound WebP");
    assert.equal(bytes.length, h.webp.bytes);
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "RIFF"); assert.equal(bytes.subarray(12, 16).toString("latin1"), "VP8L", id + ": lossless WebP");
    const v = bytes.readUInt32LE(21); assert.deepEqual([(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1], [1024, 1536], id + ": on the figure grid");
    assert.deepEqual(Object.keys(h.figureRgbaSha256), TOPS);
    assert.equal(Object.keys(h.pageViews).length, 4, id + ": the four page pictures the renderer reproduced");
    // ears and shoulders: every hair pixel (alpha ≥ 224) of the composed figure is the head laid over the figure without head, on every top
    assert.deepEqual(Object.keys(h.hairInFront), TOPS);
    for (const [top, z] of Object.entries(h.hairInFront)) for (const zone of ["oerer", "skuldre"]) {
      assert.ok(z[zone].hairPxAlpha224 > 0 || (zone === "skuldre" && style === "h25d4"), id + " " + top + " " + zone + ": hair measured");
      assert.equal(z[zone].notInFront, 0, id + " " + top + " " + zone + ": the hair lies in front of the clothes");
    }
  }
  for (const s of ["h25v5", "h25d5"]) assert.ok(FX.hairs[s + "-grey"].hairInFront["top-sweater-ls2-navy"].skuldre.hairPxAlpha224 > 10000, s + ": the long hair reaches the shoulders");
  assert.equal(new Set(G4.map((id) => FX.hairs[id].webp.sha256)).size, 6, "six different heads");
  let tracked = [];
  try { tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracked = []; }
  const bound = new Set(G4.map((id) => FX.hairs[id].approvedPng.sha256));
  for (const f of tracked.filter((p) => /\.(png|webp)$/i.test(p) && /hair|h25/i.test(p))) assert.ok(!bound.has(sha(read(f))), f + " is a private approved PNG");
  const dir = readdirSync(join(ROOT, "assets", "avatar-northstar-hair"));
  assert.deepEqual(dir.filter((f) => /h25(v5|d5|d4|d3)/.test(f)).sort(), G4.map((id) => "head-" + id + "-v1.webp").sort(), "exactly the six heads, no other candidate, no intermediate file");
  assert.ok(!existsSync(join(ROOT, "assets", "avatar-northstar-hair", "vurdering.html")));
});

test("D-388 migration: D-387's validation verbatim, the hair list extended with the six G4 values only — every other rule still holds (PGlite)", async () => {
  const body = (s) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION"));
  const was = "'h25n9-grey', 'h25n9-brown') THEN", now = "'h25n9-grey', 'h25n9-brown', " + G4.map((k) => "'" + k + "'").join(", ") + ") THEN";
  const msgWas = "h25n9-grey, h25n9-brown';", msgNow = "h25n9-grey, h25n9-brown, " + G4.join(", ") + "';";
  assert.equal(body(MIGRATION), body(D387).replace(was, now).replace(msgWas, msgNow), "only the hair list and its message change");
  assert.match(MIGRATION, /md5 635d2535ec73ff22ff319036081ecdea/, "production's definition read before the change");
  assert.ok(NAME in REPO_AHEAD_OF_PRODUCTION, "not applied in production: replayed in the isolated stack as an open production task");
  assert.match(REPO_AHEAD_OF_PRODUCTION[NAME], /open production task D-388/);
  assert.ok(!(NAME in NOT_IN_PRODUCTION) && !(NAME in APPLIED_IN_PRODUCTION));
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, avatar_identity jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE FUNCTION public.validate_avatar_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
    CREATE TRIGGER validate_avatar_identity BEFORE UPDATE OF avatar_identity ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_avatar_identity();
  `);
  await pg.exec(D357); await pg.exec(D373); await pg.exec(D377); await pg.exec(D381); await pg.exec(D386); await pg.exec(D387);
  const A = "00000000-0000-0000-0000-00000000388a";
  await pg.query("INSERT INTO public.profiles (id) VALUES ($1)", [A]);
  await pg.exec(`SELECT set_config('test.uid', '${A}', false)`);
  const save = (c) => pg.query("SELECT public.set_avatar_northstar($1::jsonb) AS r", [JSON.stringify(c)]);
  const stored = async () => (await pg.query("SELECT avatar_identity->'northstar' AS n FROM public.profiles WHERE id = $1", [A])).rows[0].n;
  await save({ ...FREE, hair: "h25n9-brown" });
  for (const k of G4) await assert.rejects(save({ ...FREE, hair: k }), /hair must be one of standard, .*h25n9-grey, h25n9-brown'?$/, k + " is refused before D-388 (production today)");
  assert.deepEqual(await stored(), { ...FREE, hair: "h25n9-brown" }, "a refused save changes nothing");
  await pg.exec(MIGRATION);
  assert.deepEqual(await stored(), { ...FREE, hair: "h25n9-brown" }, "the migration leaves saved avatars alone");
  for (const hair of [...BEFORE, ...G4]) { await save({ ...FREE, hair }); assert.deepEqual(await stored(), { ...FREE, hair }); }
  for (const top of ["top-tank-navy", "top-sweater-ls2-heather", "top-tank-heather"]) { await save({ ...FREE, top, hair: "h25d5-grey" }); assert.deepEqual(await stored(), { ...FREE, top, hair: "h25d5-grey" }); }
  for (const bad of ["h25v5-blue", "h25v5", "H25V5-GREY", "h25v5h-grey", "h25d3-grey", "h25-d4-grey", "pink", ""]) await assert.rejects(save({ ...FREE, hair: bad }), /hair must be one of|short item ids/, bad);
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
  await set({ v: 1, body_type: "neutral", hairstyle: "afro", skin_tone: "dark", hair_color: "red", chosen_at: "x", northstar: { ...FREE, hair: "h25d4-brown" } });
  await set({});
  await pg.close();
});
