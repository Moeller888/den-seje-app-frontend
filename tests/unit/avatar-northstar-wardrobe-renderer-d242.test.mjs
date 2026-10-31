// D-242: the Northstar wardrobe in the existing renderer — OFF by default, local opt-in only. These tests need no private file:
// the flag and opt-in, the 19 ready K outfits and their plans, the cosmetic gate, northstarCompose against the item pipeline's own
// arithmetic on stand-in layers, the tracked runtime assets against their manifest (count, hashes, lossless WebP 1024×1536), and
// the wiring in the renderer, the engines and avatar.html. The browser check on C is tools/avatar/verify-northstar-wardrobe-d242.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), DIR = join(REPO, "assets", "avatar-northstar");
const read = (f) => readFileSync(join(REPO, f), "utf8");
const MAN = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const withStorage = (entries, fn) => { const prev = globalThis.localStorage; const m = new Map(Object.entries(entries));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  try { return fn(); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; } };

test("D-242 flag: OFF by default; only the explicit local opt-in turns it on; a blocked storage never throws", () => {
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
  assert.equal(L.isNorthstarWardrobeOn(), false);
  assert.equal(withStorage({ avatar_northstar: "1" }, () => L.isNorthstarWardrobeOn()), true);
  for (const v of ["0", "true", "yes", "", " 1"]) assert.equal(withStorage({ avatar_northstar: v }, () => L.isNorthstarWardrobeOn()), false, v);
  const prev = globalThis.localStorage; globalThis.localStorage = { getItem() { throw new Error("blocked"); } };
  try { assert.equal(L.isNorthstarWardrobeOn(), false); assert.equal(L.northstarSelectedOutfit(), null); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; }
});

test("D-242 outfits: exactly the 19 ready K outfits; the known-faulty combinations and untested ones cannot be chosen", () => {
  assert.deepEqual(Object.keys(L.NORTHSTAR_OUTFITS), Array.from({ length: 19 }, (_, i) => "K" + String(i + 1).padStart(2, "0")));
  const names = Object.values(L.NORTHSTAR_OUTFITS).map((o) => [o.top, o.bottom, o.shoes].join("+"));
  assert.equal(new Set(names).size, 19); for (const f of L.NORTHSTAR_KNOWN_FAULTY) assert.ok(!names.includes(f), f);
  assert.equal(L.NORTHSTAR_KNOWN_FAULTY.length, 3);
  for (const v of ["K00", "K20", "K99", "k01", L.NORTHSTAR_KNOWN_FAULTY[0], "top-tee-hip-cream+bottom-trousers-square-olive+shoes-sneakers-white", "__proto__", "constructor"])
    assert.equal(withStorage({ avatar_northstar_outfit: v }, () => L.northstarSelectedOutfit()), null, v);
  assert.equal(withStorage({ avatar_northstar_outfit: "K16" }, () => L.northstarSelectedOutfit()), "K16");
  for (const v of [null, undefined, 7, "K99", "toString"]) assert.equal(L.northstarCanvasPlan(v), null);
});

test("D-242 plans: top AND bottom mandatory; the stack order of D-198 contract v2; shadows after the stack in item order", () => {
  for (const [k, o] of Object.entries(L.NORTHSTAR_OUTFITS)) {
    const p = L.northstarCanvasPlan(k), files = p.map((s) => s.src.split("/").pop()), draws = p.filter((s) => s.op === "draw").map((s) => s.src.split("/").pop());
    assert.deepEqual(draws, ["figure-body-v1.webp", o.shoes + "-shoes-v1.webp", o.bottom + "-pants-v1.webp", o.top + "-top-body-v1.webp", "figure-arms-v1.webp", o.top + "-sleeves-v1.webp", "figure-head-v1.webp"], k);
    assert.ok(p.filter((s) => s.figure).every((s) => s.cut === L.NORTHSTAR_BASE_PATH + "/hide-" + o.shoes + "-v1.webp"), k + ": C is cut by the closed shoe");
    const shades = p.filter((s) => s.op === "shade").map((s) => s.src.split("/").pop());
    assert.deepEqual(shades, [o.top, o.bottom, o.shoes].flatMap((id) => L.NORTHSTAR_ITEMS[id].shadows.map((part) => id + "-shadow-" + part + "-v1.webp")), k);
    assert.ok(p.indexOf(p.find((s) => s.op === "shade")) > p.indexOf(p.find((s) => /figure-head/.test(s.src))), k + ": shadows after the stack");
    assert.ok(files.every((f) => p.every((s) => s.src.startsWith(L.NORTHSTAR_BASE_PATH + "/"))), k);
  }
});

test("D-242 cosmetics: aura and back keep their C2 z; any other equipped slot keeps today's WHOLE avatar; other surfaces untouched", () => {
  const on = { avatar_northstar: "1", avatar_northstar_outfit: "K16" };
  const aura = { slot: "aura", src: "/assets/avatar/aura/aura-gold.svg", z: L.C2_LAYER_Z.aura }, back = { slot: "back", src: "/assets/avatar/body/wings-dragon.svg", z: L.C2_LAYER_Z.back };
  const r = withStorage(on, () => L.northstarRenderFor("hub", [aura, back, null, { slot: "aura" }]));
  assert.equal(r.key, "K16"); assert.deepEqual(r.cosmetics.map((c) => [c.src, c.z]), [[aura.src, -30], [back.src, -20]]);
  for (const slot of ["headwear", "eyes", "face", "torso", "neck", "body"]) assert.equal(withStorage(on, () => L.northstarRenderFor("hub", [aura, { slot, src: "/x.svg", z: 5 }])), null, slot);
  for (const s of ["shop", "verify", undefined, ""]) assert.equal(withStorage(on, () => L.northstarRenderFor(s, [])), null, String(s));
  for (const st of [{}, { avatar_northstar_outfit: "K16" }, { avatar_northstar: "1" }, { avatar_northstar: "1", avatar_northstar_outfit: "K99" }])
    assert.equal(withStorage(st, () => L.northstarRenderFor("quiz", [])), null, JSON.stringify(st));
  for (const s of L.NORTHSTAR_SURFACES) assert.ok(withStorage(on, () => L.northstarRenderFor(s, [])), s);
});

test("D-242 northstarCompose = the item pipeline's arithmetic (overStack + applyShadow) on stand-in layers, including the cut", () => {
  const N = NL.N, W = 1024; const lay = (fn) => { const p = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { const v = fn(i % W, (i / W) | 0); if (v) p.set(v, i * 4); } return p; };
  const body = lay((x, y) => (x > 300 && x < 700 && y > 400 ? [250, 190, 140, 230 + (x % 25)] : null));
  const arms = lay((x, y) => (x > 250 && x < 320 && y > 500 && y < 900 ? [245, 185, 135, x % 3 ? 255 : 100] : null));
  const shoes = lay((x, y) => (x > 320 && x < 680 && y > 1400 ? [90, 60, 40, y % 5 ? 255 : 90] : null));
  const pants = lay((x, y) => (x > 310 && x < 690 && y > 760 && y < 1000 ? [30, 40, 90, 255] : null));
  const top = lay((x, y) => (x > 300 && x < 700 && y > 470 && y < 800 ? [20, 80, 200, 255] : null));
  const sleeves = lay((x, y) => (x > 240 && x < 330 && y > 470 && y < 560 ? [20, 80, 200, x % 7 ? 255 : 60] : null));
  const head = lay((x, y) => (x > 380 && x < 640 && y < 430 ? [250, 190, 140, 255] : null));
  const hide = lay((x, y) => (x > 400 && x < 600 && y > 1380 ? [255, 255, 255, 255] : null));
  const sh1 = lay((x, y) => (y > 1000 && y < 1040 && x > 320 && x < 680 ? [180, 120, 90, 150] : null)), sh2 = lay((x, y) => (x > 250 && x < 320 && y > 560 && y < 600 ? [170, 110, 80, 200] : null));
  const files = { "/b": body, "/a": arms, "/s": shoes, "/p": pants, "/t": top, "/sl": sleeves, "/h": head, "/cut": hide, "/sh1": sh1, "/sh2": sh2 };
  const plan = [{ op: "draw", src: "/b", figure: true, cut: "/cut" }, { op: "draw", src: "/s" }, { op: "draw", src: "/p" }, { op: "draw", src: "/t" }, { op: "draw", src: "/a", figure: true, cut: "/cut" }, { op: "draw", src: "/sl" }, { op: "draw", src: "/h" }, { op: "shade", src: "/sh1" }, { op: "shade", src: "/sh2" }];
  const got = L.northstarCompose(plan, (s) => files[s], N);
  const cutOf = (P) => P.map((v, k) => (k % 4 === 3 && hide[(k >> 2) * 4 + 3] ? 0 : v));
  const stack = [["body", cutOf(body)], ["shoes", shoes], ["pants", pants], ["topBody", top], ["arms", cutOf(arms)], ["sleeves", sleeves], ["head", head]];
  let ref = NL.overStack(stack.map(([, l]) => l)); ref = IP.applyShadow(ref, stack, sh1); ref = IP.applyShadow(ref, stack, sh2);
  let diff = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== ref[i]) diff++;
  assert.equal(diff, 0);
});

const sha = (b) => createHash("sha256").update(b).digest("hex");
function webpInfo(b) {   // RIFF/WEBP with a single lossless VP8L chunk: 14-bit width-1, height-1 after the 0x2f signature
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16); if (chunk !== "VP8L" || b[20] !== 0x2f) return { chunk };
  const v = b.readUInt32LE(21); return { chunk, w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1, alpha: (v >> 28) & 1 };
}

test("D-242 runtime assets: at most 41 authorised files (plus exactly D-274's 32 published tee layers), every one in the manifest with purpose, origin and its sha256; lossless WebP 1024×1536", () => {
  const all = readdirSync(DIR).filter((f) => f !== "manifest.json").sort();
  assert.deepEqual(all, MAN.files.map((f) => f.file).sort(), "the directory holds exactly the manifest's files");
  // D-274's publication permission covers exactly its own 32 tee layers; D-242's exception keeps its own limit
  const d274 = MAN.files.filter((f) => f.origin && f.origin.decision === "D-274").map((f) => f.file).sort(), ext = MAN.extensions.find((e) => e.decision === "D-274");
  assert.deepEqual(d274, [...ext.files].sort()); assert.equal(d274.length, 32); assert.ok(d274.every((f) => /^top-tee-hip-print-[a-z]+-[a-z]+-(top-body|sleeves)-v1\.webp$/.test(f)));
  const onDisk = all.filter((f) => !d274.includes(f));
  assert.ok(onDisk.length <= 41); assert.equal(MAN.decision, "D-242"); assert.deepEqual([MAN.counts.d242Files, MAN.counts.d274Files], [onDisk.length, 32]);
  const kinds = { figure: onDisk.filter((f) => f.startsWith("figure-")), hide: onDisk.filter((f) => f.startsWith("hide-")), shadow: onDisk.filter((f) => f.includes("-shadow-")) };
  kinds.item = onDisk.filter((f) => !kinds.figure.includes(f) && !kinds.hide.includes(f) && !kinds.shadow.includes(f));
  assert.deepEqual(kinds.figure, ["figure-arms-v1.webp", "figure-body-v1.webp", "figure-head-v1.webp"]); assert.equal(kinds.hide.length, 4);
  assert.ok(kinds.item.length <= 14); assert.ok(kinds.shadow.length <= 20); assert.equal(MAN.counts.files, all.length);
  for (const f of MAN.files) { const b = readFileSync(join(DIR, f.file)), info = webpInfo(b);
    assert.equal(sha(b), f.sha256, f.file); assert.equal(b.length, f.bytes, f.file); assert.ok(f.purpose && f.origin, f.file);
    assert.deepEqual([info.chunk, info.w, info.h], ["VP8L", 1024, 1536], f.file); }
  for (const f of all) assert.ok(!/(^|[^a-z])h1([^a-z]|$)|d202|raw|reference|review|base-figure/i.test(f), "not C, H1, a raw generation, a reference sheet or a review file: " + f);
});

test("D-242 manifest ↔ module: every plan file exists, every file is used; the 19 outfits match; all 19 (and D-275's 144 print-tee outfits) equal the pipeline byte for byte", () => {
  const used = new Set(), files = new Set(MAN.files.map((f) => f.file));
  const plans = [...Object.keys(L.NORTHSTAR_OUTFITS).map((k) => [k, L.northstarCanvasPlan(k)]),
    ...Object.keys(L.NORTHSTAR_PRINT_TEES).flatMap((t) => Object.keys(L.NORTHSTAR_OUTFITS).filter((k) => L.northstarTeeAllowed(k)).map((k) => [k + "+" + t, L.northstarPlanFor(L.northstarOutfitFor(k, t))]))];
  for (const [k, p] of plans) for (const s of p) for (const src of [s.src, s.cut].filter(Boolean)) { const f = src.split("/").pop(); assert.ok(files.has(f), k + ": " + f); used.add(f); }
  assert.deepEqual([...files].filter((f) => !used.has(f)), []);
  const eq = MAN.extensions.find((e) => e.decision === "D-274").equivalence; assert.deepEqual([eq.printOutfits, eq.outfitsDiffering], [144, 0]); assert.ok(eq.publishedFilesIdenticalToPipeline >= 32 + 9);
  assert.deepEqual(Object.fromEntries(Object.entries(MAN.outfits).map(([k, o]) => [k, { top: o.top, bottom: o.bottom, shoes: o.shoes }])), JSON.parse(JSON.stringify(L.NORTHSTAR_OUTFITS)));
  assert.deepEqual(MAN.knownFaulty, [...L.NORTHSTAR_KNOWN_FAULTY]);
  assert.deepEqual(Object.keys(MAN.equivalence.outfits), Object.keys(L.NORTHSTAR_OUTFITS)); for (const [k, e] of Object.entries(MAN.equivalence.outfits)) assert.equal(e.bytesDiffering, 0, k);
  const deploy = read("tools/cloudflare-build-static.mjs"); assert.match(deploy, /\{ dir: "assets", extensions: \[[^\]]*"\.webp"/, "the WebP layers deploy with assets/");
});

test("D-242 wiring: the renderer tries the figure first and atomically, never through cdnUrl; engines stay inert on it; avatar.html loads the panel fail-soft", () => {
  const R = read("js/avatar-render-c2.js");
  assert.ok(R.indexOf("northstarRenderFor(surface, cosmetics)") < R.indexOf("composeR2Layers(identity, cosmetics) : null"), "the figure is decided before R2");
  assert.match(R, /const ns = forceC2 \? null : northstarRenderFor\(surface, cosmetics\);/);
  assert.match(R, /let r2Layers = \(!nsLayers && !forceC2 && isAvatarR2\(\)\)/);
  assert.match(R, /const path = nsLayers \? "northstar" : r2Layers \? "r2" : "c2";/);
  assert.match(R, /const img = await _loadImage\(src\);/); assert.ok(!/_loadImage\(cdnUrl/.test(R), "the layers load from the origin");
  assert.match(R, /img\.src = layer\.origin \? layer\.src : cdnUrl\(layer\.src\);/);
  assert.match(read("js/avatar-blink-engine.js"), /avatarRenderPath === 'northstar'\) return;/);
  assert.match(read("js/avatar-expression-engine.js"), /avatarRenderPath === "northstar"\) \{\s*this\._overlay = null;\s*return;/);
  const H = read("avatar.html");
  assert.match(H, /<div class="northstar-panel" id="northstarPanel" hidden><\/div>/);
  assert.match(H, /try \{\s*const ns = await import\("\.\/js\/avatar-northstar-panel\.js"\);[\s\S]*?\} catch \(_e\) \{ \/\* no panel \*\/ \}/);
  const P = read("js/avatar-northstar-panel.js"); assert.ok(!/supabase|fetch\(|insert|update\(/i.test(P), "the panel writes nothing but localStorage");
});
