// D-370: the free Northstar wardrobe. Any top with any bottom and any shoes, saved as the three parts in the existing account format.
//   1. All 3,780 outfits pass the account's own rules (read from the migration) and read back as exactly the same three parts.
//   2. Older choices with a K number read as before.
//   3. The layer fixes are published: the four files are in the app with the approved hashes, every outfit is drawn, and the plans
//      differ from the earlier files' plans only by the two repairs.
//   4. The fit check's only exception is exactly the documented charcoal lace case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import * as L from "../../js/avatar-layers.js";
import { charcoalLaceException, heavyHipContour, exceptionSpec, stagingSpec } from "../../tools/avatar/northstar-free-matrix.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
// the same renderer with the layer fixes off: the earlier files, and D-242's three outfits refused
const BEFORE = async () => import("data:text/javascript;base64," + Buffer.from(read("js/avatar-layers.js").replace("export const NORTHSTAR_LAYER_FIXES = true;", "export const NORTHSTAR_LAYER_FIXES = false;")).toString("base64"));
const by = { top: [], bottom: [], shoes: [] };
for (const p of L.northstarPieces()) by[p.category].push(p.item);
const all = () => by.top.flatMap((t) => by.bottom.flatMap((b) => by.shoes.map((s) => [t, b, s])));
const choice = (t, b, s) => ({ outfit: "FRI", top: t, pants: b, shoes: s });
// the account's rules for the choice, as the migration states them
const mig = read("supabase/migrations/20261106120000_avatar_northstar_choice.sql");
const KEYS = [...mig.match(/e\.key NOT IN \(([^)]*)\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), ID = new RegExp(mig.match(/!~ '([^']+)'/)[1]);
const accepted = (c) => Object.entries(c).every(([k, v]) => KEYS.includes(k) && typeof v === "string" && ID.test(v));

test("D-370: 63 x 6 x 10; every outfit passes the account's rules and reads back as the same three parts", () => {
  assert.deepEqual([by.top.length, by.bottom.length, by.shoes.length], [63, 6, 10]);
  const keys = new Set();
  for (const [t, b, s] of all()) {
    const stored = JSON.parse(JSON.stringify(choice(t, b, s)));
    assert.ok(accepted(stored), t + b + s);
    L.northstarUseAccount({ v: 1, body_type: "neutral", northstar: stored });
    const o = L.northstarOutfitNow();
    assert.deepEqual([o.top, o.bottom, o.shoes], [t, b, s]);
    const r = L.northstarRenderFor("avatar", []);
    if (L.NORTHSTAR_KNOWN_FAULTY.includes(t + "+" + b + "+" + s)) { assert.equal(r, null, "not drawn before the fixes are published"); continue; }
    assert.ok(r && !keys.has(r.key), "one figure per outfit");
    keys.add(r.key);
  }
  assert.equal(keys.size, 3780 - L.NORTHSTAR_KNOWN_FAULTY.length);
});

test("D-370: every stored older choice with a K number still gives the outfit it gave", () => {
  const list = L.northstarApprovedOutfits();
  assert.equal(list.size, 2745);
  for (const [id, o] of list) {
    assert.equal(o.choice.outfit === "FRI", false, id);
    L.northstarUseAccount({ northstar: o.choice });
    const now = L.northstarOutfitNow();
    assert.equal(now.top + "+" + now.bottom + "+" + now.shoes, id);
  }
});

test("D-370: a malformed or half-free choice is not an outfit", () => {
  for (const c of [{ outfit: "FRI" }, { outfit: "FRI", top: "top-tee-hip-cream", pants: "bottom-skirt-sand" }, { outfit: "FRI", top: "bottom-skirt-sand", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige" }, { outfit: "FRI", top: "top-planet", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige" }, { outfit: "FRI", top: "__proto__", pants: "bottom-skirt-sand", shoes: "shoes-sneakers-beige" }]) {
    L.northstarUseAccount({ northstar: c });
    assert.equal(L.northstarOutfitNow(), null, JSON.stringify(c));
    assert.equal(L.northstarRenderFor("avatar", []), null, JSON.stringify(c));
  }
});

test("D-370: the layer fixes are published: exactly the four approved files, byte for byte, and nothing is refused", () => {
  assert.equal(L.NORTHSTAR_LAYER_FIXES, true, "published with the owner's approval");
  assert.deepEqual([...L.NORTHSTAR_KNOWN_FAULTY], []);
  const S = stagingSpec();
  assert.deepEqual(S.files.map((f) => f.file).sort(), ["shoes-sneakers-white-under-long-hem-v1.webp", "top-tee-hip-blue-hip-cover-v1.webp", "top-tee-hip-blue-sleeves-v3.webp", "top-tee-hip-blue-top-body-v3.webp"]);
  for (const f of S.files) {
    const b = readFileSync(join(ROOT, "assets", "avatar-northstar", f.file));
    assert.deepEqual([b.length, createHash("sha256").update(b).digest("hex")], [f.bytes, f.sha256], f.file);
  }
});

test("D-370: with the layer fixes on, all 3,780 are drawn, and only the two repairs differ from the earlier files' plans", async () => {
  const F = L, B = await BEFORE();
  assert.deepEqual([F.NORTHSTAR_KNOWN_FAULTY.length, B.NORTHSTAR_KNOWN_FAULTY.length], [0, 3]);
  const COVER = "/assets/avatar-northstar/shoes-sneakers-white-under-long-hem-v1.webp", HIP = "/assets/avatar-northstar/top-tee-hip-blue-hip-cover-v1.webp", names = (p) => p.map((x) => x.src);
  for (const [t, b, s] of all()) {
    const p = names(F.northstarPlanFor({ top: t, bottom: b, shoes: s }));
    assert.equal(p.includes(COVER), s === "shoes-sneakers-white" && b.startsWith("bottom-trousers-square-"), "the collar cover only under long trousers");
    assert.equal(p.includes(HIP), t === "top-tee-hip-blue");
    if (t === "top-tee-hip-blue") assert.ok(p.indexOf(HIP) < p.findIndex((x) => x.includes(b + "-pants")), "the former hem lines lie behind the bottom");
    if (B.NORTHSTAR_KNOWN_FAULTY.includes(t + "+" + b + "+" + s)) { assert.equal(B.northstarPlanFor({ top: t, bottom: b, shoes: s }), null); continue; }
    const today = names(B.northstarPlanFor({ top: t, bottom: b, shoes: s }));
    assert.deepEqual(p.filter((x) => x !== COVER && x !== HIP).map((x) => x.replace("top-tee-hip-blue-top-body-v3", "top-tee-hip-blue-top-body-v2").replace("top-tee-hip-blue-sleeves-v3", "top-tee-hip-blue-sleeves-v2")), today);
  }
});

test("D-370: the fit check's exception is the charcoal lace case and nothing else", () => {
  const S = exceptionSpec(), [t] = S.transitions, box = t.boxes[0], f = { check: S.check, px: 9, box };
  assert.equal(S.shoes, "shoes-sneakers-low-sv1-charcoal");
  assert.deepEqual(S.transitions.map((x) => x.bottom).sort(), ["bottom-trousers-square-navy", "bottom-trousers-square-olive", "bottom-trousers-square-sand"]);
  assert.deepEqual(charcoalLaceException([f], S.shoes, t.bottom, S), { kept: [], exempt: [f] });
  for (const [ff, s, b, why] of [[f, "shoes-sneakers-low-sv1-chalk", t.bottom, "another shoe"], [f, S.shoes, "bottom-capri-lightblue", "another bottom"], [{ ...f, check: "COMBO-1b-ENCLOSED-HOLE" }, S.shoes, t.bottom, "another check"], [{ ...f, box: [box[0], box[1] + 1, box[2], box[3]] }, S.shoes, t.bottom, "another place"]])
    assert.deepEqual(charcoalLaceException([ff], s, b, S), { kept: [ff], exempt: [] }, why);
});

test("D-370: the real trigger and account function, unmodified on PGlite, store the three-part format and leave the rest of the identity alone", async () => {
  const pg = new PGlite(), A = "00000000-0000-0000-0000-00000000000a", identity = { v: 1, body_type: "female", chosen_at: "2026-01-01", hairstyle: "long" };
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, avatar_identity jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE FUNCTION public.validate_avatar_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
    CREATE TRIGGER validate_avatar_identity BEFORE UPDATE OF avatar_identity ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_avatar_identity();
  `);
  await pg.exec(mig);
  await pg.query("INSERT INTO public.profiles (id, avatar_identity) VALUES ($1, $2::jsonb)", [A, JSON.stringify(identity)]);
  await pg.exec(`SELECT set_config('test.uid', '${A}', false)`);
  // every top, bottom and shoe at least once, and the olive outfit that could not be chosen before
  const outfits = [...by.top.map((t, i) => [t, by.bottom[i % 6], by.shoes[i % 10]]), ["top-tee-hip-cream", "bottom-trousers-square-olive", "shoes-sneakers-low-sv1-chalk"]];
  for (const [t, b, s] of outfits) {
    await pg.query("SELECT public.set_avatar_northstar($1::jsonb)", [JSON.stringify(choice(t, b, s))]);
    const stored = (await pg.query("SELECT avatar_identity AS i FROM public.profiles WHERE id = $1", [A])).rows[0].i;
    assert.deepEqual(stored, { ...identity, northstar: choice(t, b, s) });
    L.northstarUseAccount(stored);
    const o = L.northstarOutfitNow();
    assert.deepEqual([o.top, o.bottom, o.shoes], [t, b, s]);
  }
  await assert.rejects(pg.query("SELECT public.set_avatar_northstar($1::jsonb)", [JSON.stringify({ outfit: "FRI", top: "x".repeat(41) })]), /short item ids/);
  await pg.close();
});

test("D-370: the heavier hip contour is reported for exactly 1,360 outfits and is no failure", () => {
  assert.equal(all().filter(([t, b]) => heavyHipContour(t, b)).length, 1360);
});
