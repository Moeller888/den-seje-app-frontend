// D-312 — COMPATIBILITY OF THE 4 INTEGRATED SV1-V5 SHOES (D-308) WITH THE BLUE TEE AND THE 16 PRINT TEES, offline (no image call; nothing
// published; the runtime list NORTHSTAR_SV1_SHOE_COMBOS is NOT changed — an extension needs the owner's approval).
//   map    — every outfit the opt-in can already compose from its existing tops, bottoms and the 4 shoes (the browser's own functions:
//            each K outfit, without and with every print tee and trousers it allows, with each shoe in place of its shoes) that is not
//            one of the 21 approved combinations and not a known-faulty outfit. Stable IDs: <shoe>--<top>--<bottom>, top = tee-blue,
//            tee-cream or a print tee ID. Charcoal with the three long trousers is HELD OUT (a separate owner decision), but checked.
//   check  — sequentially, one top at a time (memory): R1.checkOutfit UNCHANGED (fit and the outfit seams, with the shoe's covering);
//            the pipeline composite (layerProof + applyShadow, the shoe's skin shadow = the beige sneakers', as D-308); the browser's
//            northstarCompose(northstarPlanFor(outfit)) on the PUBLISHED files against it byte for byte, and every plan file present in
//            the manifest (missing assets). Each unit is cached (units/<id>.json, keyed by the inputs' sha256) and its composite kept.
//   browser — the composites in Chromium at 110x165 (DPR 2) and 300x450 (DPR 2), light and dark.
// The views show C: --out must be outside the repository. Nothing here approves a combination.
// Usage: node --expose-gc tools/avatar/northstar-sv1-shoe-tee-compat.mjs --out <dir> --phase map|check|browser --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import http from "node:http";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as BC from "./northstar-base-figure-c.mjs";
import * as IP from "./northstar-item-pilot.mjs";
import * as R1 from "./northstar-r1-garment.mjs";
import { loadItems } from "./build-northstar-runtime-assets.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), DIR = join(ROOT, "assets", "avatar-northstar"), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex"), gc = () => { if (typeof globalThis.gc === "function") globalThis.gc(); };
export const HELD_OUT_BOTTOMS = Object.freeze(["bottom-trousers-square-olive", "bottom-trousers-square-navy", "bottom-trousers-square-sand"]);
const topIdOf = (AL, top) => { const p = Object.entries(AL.NORTHSTAR_PRINT_TEES).find(([, t]) => t.item === top); return p ? p[0] : top.replace("top-", "").replace("-hip", ""); };

/** The new composable combinations: [{ id, top, bottom, shoe, item, heldOut }] in a fixed order (top, bottom, shoe), against an approved
 *  list (default the runtime's; D-312's map was taken against D-305's 21, before D-314 approved its 305 candidates). */
export function newCombinations(AL, approved = AL.NORTHSTAR_SV1_SHOE_COMBOS) {
  const seen = new Map();
  for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) {
    const o = AL.northstarOutfitFor(k, t, p); if (!o) continue;
    for (const [s, sh] of Object.entries(AL.NORTHSTAR_SV1_SHOES)) { const key = o.top + "+" + o.bottom + "+" + sh.item;
      if (approved.includes(key) || AL.NORTHSTAR_KNOWN_FAULTY.includes(o.top + "+" + o.bottom + "+" + o.shoes) || seen.has(key)) continue;
      seen.set(key, { id: s + "--" + topIdOf(AL, o.top) + "--" + o.bottom.replace("bottom-", ""), top: o.top, bottom: o.bottom, shoe: s, item: sh.item, heldOut: s === "SV1-V5-CHARCOAL" && HELD_OUT_BOTTOMS.includes(o.bottom), reachableAs: [k, t, p].filter(Boolean).join("+") }); } }
  const order = (c) => [c.top.includes("print") ? 2 : c.top.includes("blue") ? 1 : 0, c.top, c.bottom, c.shoe].join("|");
  return [...seen.values()].sort((a, b) => (order(a) < order(b) ? -1 : 1));
}

async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), phase = at("--phase"), DWEBP = at("--dwebp"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository (the views show C)"); mkdirSync(OUT, { recursive: true });
  const AL = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  if (phase === "map") { const c = newCombinations(AL); writeFileSync(join(OUT, "combinations.json"), JSON.stringify({ count: c.length, heldOut: c.filter((x) => x.heldOut).length, combinations: c }, null, 2) + "\n"); return console.log(JSON.stringify({ count: c.length, heldOut: c.filter((x) => x.heldOut).length })); }
  if (!DWEBP) throw new Error("--dwebp");
  if (phase === "check") return phaseCheck(AL, OUT, DWEBP);
  if (phase === "browser") return phaseBrowser(OUT);
  throw new Error("--phase map|check|browser");
}

async function phaseCheck(AL, OUT, DWEBP) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, man = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")), files = new Set(man.files.map((f) => f.file));
  const tmp = join(tmpdir(), "d312-" + process.pid); mkdirSync(tmp, { recursive: true }); mkdirSync(join(OUT, "units"), { recursive: true }); mkdirSync(join(OUT, "full"), { recursive: true });
  let cache = new Map(); const dec = (f) => { if (!cache.has(f)) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(DIR, f), "-o", o]); cache.set(f, Uint8ClampedArray.from(decodePng(readFileSync(o)).px)); } return cache.get(f); };
  const spec = JSON.parse(readFileSync(join(ROOT, "tools", "avatar", "fixtures", "northstar-wardrobe", "runtime-assets-inputs-d242.json"), "utf8"));
  const base0 = ["top-tee-hip-cream", "top-tee-hip-blue", "bottom-skirt-sand", "bottom-shorts-navy", "bottom-capri-lightblue", "bottom-trousers-square-olive", "shoes-sneakers-beige"];
  const { P } = loadItems(Object.fromEntries(base0.map((id) => [id, spec.items[id]])));
  for (const p of Object.values(AL.NORTHSTAR_SOLID_PANTS)) P[p.item] = { item: p.item, layers: { pants: dec(p.item + "-pants-v1.webp") }, shadow: P[AL.NORTHSTAR_SOLID_PANTS_BASE].shadow, category: "bottom", covering: "none" };
  for (const s of Object.values(AL.NORTHSTAR_SV1_SHOES)) P[s.item] = { item: s.item, layers: { shoes: dec(s.item + "-shoes-v1.webp") }, shadow: P[AL.NORTHSTAR_SV1_SHOE_BASE].shadow, category: "shoes", covering: "closed-footwear" };
  const w = WR.buildWardrobe(), base = BC.prepareBase(w, Uint8ClampedArray.from(decodePng(IP.readC()).px)), keep = new Set([...cache.keys()]), results = {};
  let currentTop = null;
  try {
    for (const c of C) {
      if (c.top !== currentTop) { for (const k of [...cache.keys()]) if (!keep.has(k) && !k.startsWith("figure-") && !k.includes("shadow")) cache.delete(k); if (currentTop && currentTop.includes("print")) delete P[currentTop]; currentTop = c.top; gc();
        if (c.top.includes("print")) P[c.top] = { item: c.top, layers: { topBody: dec(c.top + "-top-body-v1.webp"), sleeves: dec(c.top + "-sleeves-v1.webp") }, shadow: P[AL.NORTHSTAR_PRINT_TEE_BASE].shadow, category: "top", covering: "none" }; }
      const o = { top: c.top, bottom: c.bottom, shoes: c.item }, plan = AL.northstarPlanFor(o), planFiles = plan ? [...new Set(plan.flatMap((s) => [s.src, s.cut].filter(Boolean).map((x) => x.split("/").pop())))] : [];
      const keyIn = sha(JSON.stringify([o, planFiles.map((f) => (files.has(f) ? man.files.find((e) => e.file === f).sha256 : "missing:" + f)), IP.METHODS[IP.METHOD].outfitRevision || "d223"]));
      const uf = join(OUT, "units", c.id + ".json"); if (existsSync(uf) && JSON.parse(readFileSync(uf, "utf8")).key === keyIn && existsSync(join(OUT, "full", c.id + ".png"))) { results[c.id] = JSON.parse(readFileSync(uf, "utf8")); continue; }
      const missing = planFiles.filter((f) => !files.has(f)), x = R1.checkOutfit(w, base, [P[c.top], P[c.bottom], P[c.item]]);
      const oc = x.ok ? { checks: [] } : BC.outfitCheck(w, base, x.proof, { revision: IP.METHODS[IP.METHOD].outfitRevision || "d223" }), seams = {};   // the failed checks' seams (only when it failed)
      for (const ch of oc.checks.filter((q) => !q.ok)) { const v = ch.value || {}, pcs = [...(v.doubles || []), ...(v.slits || []), ...(v.cuts || [])]; seams[ch.id] = [...new Set(pcs.map((p) => p.seam))]; }
      let comp = x.proof.dressedRuntime; for (const id of [c.top, c.bottom, c.item]) comp = IP.applyShadow(comp, x.proof.stack, P[id].shadow);
      let diff = -1; if (plan && !missing.length) { const got = AL.northstarCompose(plan, (src) => dec(src.split("/").pop()), N); diff = 0; for (let i = 0; i < N * 4; i++) if (got[i] !== comp[i]) diff++; }
      writeFileSync(join(OUT, "full", c.id + ".png"), encodePng(W, H(), comp));
      const u = { key: keyIn, id: c.id, top: c.top, bottom: c.bottom, shoe: c.shoe, heldOut: c.heldOut, technical: x.ok ? "PASS" : "FAIL", failed: x.failed, seams, plan: !!plan, missingAssets: missing, runtimeBytesDiffering: diff };
      writeFileSync(uf, JSON.stringify(u, null, 2) + "\n"); results[c.id] = u; x.proof = null; comp = null; gc();
      if (Object.keys(results).length % 20 === 0) console.log(Object.keys(results).length + "/" + C.length, Math.round(process.memoryUsage().rss / 1048576) + " MB"); }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const all = Object.values(results), summary = { units: all.length, pass: all.filter((u) => u.technical === "PASS").length, fail: all.filter((u) => u.technical === "FAIL").map((u) => u.id + ": " + u.failed.join("|") + " " + JSON.stringify(u.seams)),
    runtimeEquivalent: all.filter((u) => u.runtimeBytesDiffering === 0).length, missingAssets: all.filter((u) => u.missingAssets.length).length };
  writeFileSync(join(OUT, "check.json"), JSON.stringify({ summary, units: results }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}
const H = () => N / W;

async function phaseBrowser(OUT) {
  const C = JSON.parse(readFileSync(join(OUT, "combinations.json"), "utf8")).combinations, { chromium } = await import("@playwright/test"); mkdirSync(join(OUT, "browser"), { recursive: true });
  const server = http.createServer((req, res) => { const f = join(OUT, "full", decodeURIComponent(req.url.slice(1))); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); res.end(readFileSync(f)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const port = server.address().port, browser = await chromium.launch(); let n = 0;
  const BG = { light: [236, 233, 226], dark: [24, 26, 40] };
  try { for (const [cw, ch] of [[110, 165], [300, 450]]) for (const [bn, bg] of Object.entries(BG)) { const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: cw + 20, height: ch + 20 } }), p = await ctx.newPage();
      for (const c of C) { const f = join(OUT, "browser", c.id + "--" + cw + "x" + ch + "-dpr2--" + bn + ".png"); if (existsSync(f)) continue;
        await p.setContent(`<!doctype html><body style="margin:0;padding:10px;background:rgb(${bg.join(",")})"><img id="a" src="http://127.0.0.1:${port}/${c.id}.png" style="width:${cw}px;height:${ch}px;display:block"></body>`);
        await p.waitForFunction(() => document.getElementById("a").complete && document.getElementById("a").naturalWidth > 0); const d = decodeScreenshot(await p.screenshot({ clip: { x: 10, y: 10, width: cw, height: ch }, animations: "disabled" }));
        writeFileSync(f, encodePng(d.w, d.h, d.px)); n++; } await ctx.close(); } }
  finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ phase: "browser", shots: n }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
