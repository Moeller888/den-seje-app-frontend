// D-349 BROWSER VERIFICATION of the published tee layer versions (U-343-1, layerRev 2 on the 18 tees) in the Northstar opt-in, on the
// real renderer, panel and engines in Chromium against a local server of this checkout; origin/main's modules under /__main/ for the
// baseline (D-348's tool):
//   1. BASELINE — without the opt-in (with and without stored choices), without an outfit, and the sweater and tank outfits: every
//      surface pixel-identical to origin/main (the tees are the only change);
//   2. FIGURE — representative tees (cream, blue and print tees in six colours, three motifs, over skirt, shorts, capri and trousers with
//      several shoes) on quiz, hub and avatar: the key names the outfit, the browser loads the tee's two -v2 layers and no tee -v1 layer,
//      the picture equals Node's northstarCompose of the runtime plan on a light and on a dark background, and on both arm edges the
//      moved pixels differ from the v1 revision (the line is gone) and equal the v2 rendering; sheets at 600 and 360 px (app size);
//   3. CHOICE — K01 → a print tee, a reload keeps it; a sweater and a tank replace the tee; "Outfittets egen top" brings the print tee
//      back; another print tee; a blue-tee outfit and a reload; "Nuværende avatar"; every step loads only -v2 tee layers;
//   4. FAILURE — a tee's -v2 body layer, its -v2 sleeve layer or its shadow that does not load gives today's path whole, the choice kept.
// --part baseline|figure|choice runs one part alone (choice = 3 and 4) and writes result-<part>.json. One Chromium, one page at a time.
// Usage: node tools/avatar/verify-northstar-tee-armline-d349.mjs --dwebp <dwebp.exe> --out <dir outside the repository> [--part <part>]
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";
import { grid } from "./northstar-wardrobe-poc.mjs";
import { resplitTee } from "./northstar-tee-armline-d349.mjs";
import { v1Table } from "./verify-northstar-tee-armline-runtime-d349.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(arg("--out", "")), DWEBP = arg("--dwebp", ""), PART = arg("--part", null), RUN = (p) => !PART || PART === p;
if (PART && !["baseline", "figure", "choice"].includes(PART)) throw new Error("--part baseline|figure|choice");
if (!arg("--out") || OUT.toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--out must be outside the repository (the sheets show C, D-127 §2)");
if (!DWEBP || !existsSync(DWEBP)) throw new Error("--dwebp <the vendored dwebp>");
mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const IDENTITY = { body_type: "neutral", skin_tone: "medium", hairstyle: "default", hair_color: "brown" };
const SURFACES = {
  quiz: { file: "index.html", box: '<div class="game-identity"><div id="avatar-display"></div></div>', sel: "#avatar-display", layerClass: "quiz-avatar-layer" },
  hub: { file: "hub.html", box: '<div class="avatar-showcase" id="avatarShowcase"><div class="profile-avatar" id="profileAvatar"></div></div>', sel: "#profileAvatar", layerClass: "profile-avatar-layer" },
  avatar: { file: "avatar.html", box: '<div class="avatar-wrap" id="avatarWrap"><div class="avatar-aura"></div><div id="avatar-preview"></div></div><div class="northstar-panel" id="northstarPanel" hidden></div>', sel: "#avatar-preview", layerClass: "avatar-layer" },
};
const mainFile = (f) => execFileSync("git", ["show", `origin/main:${f}`], { cwd: ROOT, maxBuffer: 1 << 26 });
const style = (html) => html.match(/<style>([\s\S]*?)<\/style>/)[1];

/** One page: code 'pr' | 'main'; storage set once (seed) unless keep; the avatar page also mounts the panel. */
function page(s, { code, storage, keep = false }) {
  const S = SURFACES[s], html = code === "main" ? mainFile(S.file).toString("utf8") : readFileSync(join(ROOT, S.file), "utf8"), base = code === "main" ? "/__main" : "";
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${base}/style.css"><link rel="stylesheet" href="${base}/css/theme.css"><style>${style(html)}</style><style>body{display:block;padding:24px;margin:0}</style></head><body>${S.box}
<script type="module">
window.__AVATAR_TEST__ = true; ${keep ? `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage || {})})) localStorage.setItem(k, v); }` : `localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage || {})})) localStorage.setItem(k, v);`}
const before = JSON.stringify({ ...localStorage });
const L = await import("${base}/js/avatar-layers.js"), R = await import("${base}/js/avatar-render-c2.js"), E = await import("${base}/js/avatar-expression-engine.js");
const el = document.querySelector(${JSON.stringify(S.sel)}), identity = ${JSON.stringify(IDENTITY)};
const path = await R.mountC2Avatar(el, identity, { layerClass: ${JSON.stringify(S.layerClass)}, cosmetics: [], surface: ${JSON.stringify(s)} });
let ee = null; try { ee = new E.ExpressionEngine(el); } catch (_e) {}
await R.markAvatarRendered(el);
${s === "avatar" && code === "pr" ? `const P = await import("/js/avatar-northstar-panel.js"); P.mountNorthstarPanel(document.getElementById("northstarPanel"), el);` : ""}
const overlay = el.querySelector(".avatar-expr-overlay"), ns = L.northstarRenderFor ? L.northstarRenderFor(${JSON.stringify(s)}, []) : null;
const kids = [...el.children].map((c) => ({ marker: c.getAttribute("data-c2-layer") || c.id, src: (c.getAttribute("src") || "").replace(/^blob:.*/, "blob:"), z: c.style.zIndex }));
const teeFiles = performance.getEntriesByType("resource").map((e) => e.name.split("/").pop()).filter((f) => f.startsWith("top-tee-"));
window.__done = { path, kids, key: ns ? ns.key : null, teeFiles, overlayVisible: !!overlay && getComputedStyle(overlay).display !== "none", storageUnchanged: JSON.stringify({ ...localStorage }) === before, storage: { ...localStorage } };
document.body.dataset.done = "1";
</script></body></html>`;
}

const pages = {}, refs = {}, server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]); if (pages[u]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[u]); }
  if (u.startsWith("/__ref/")) { const k = u.slice(7); res.writeHead(200, { "content-type": k.endsWith(".json") ? "application/json" : "image/png" }); return res.end(refs[k]); }
  if (u.startsWith("/__main/")) { try { const b = mainFile(u.slice(8)); res.writeHead(200, { "content-type": TYPES[extname(u)] || "application/octet-stream" }); return res.end(b); } catch { res.writeHead(404); return res.end(); } }
  const p = join(ROOT, u); if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
});

/** The tee files a page loaded are only the -v2 layers and v1 shadows of its tee (none when the outfit shows no tee). */
const teeFilesOk = (files, top) => files.every((f) => f.includes("shadow") ? f.endsWith("-v1.webp") : f.endsWith("-v2.webp")) && (!top || (files.includes(top + "-top-body-v2.webp") && files.includes(top + "-sleeves-v2.webp")));

async function main() {
  const { chromium } = await import("@playwright/test");
  const L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href), T1 = v1Table(L.NORTHSTAR_ITEMS);
  const tmp = join(tmpdir(), "d349b-" + process.pid); mkdirSync(tmp, { recursive: true }); const dec = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!dec[f]) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", f), "-o", o]); dec[f] = Uint8ClampedArray.from(decodePng(readFileSync(o)).px); } return dec[f]; };
  // [K, print tee, trousers, shoe]: cream and blue, the print tees in six colours and three motifs, skirt, shorts, capri and trousers
  const FIG = [["K01", null, null, null], ["K13", null, null, null], ["K17", null, null, null], ["K07", "TP-FOX-NAV", null, "AB1-BOOT-ORIGINAL"], ["K02", "TP-SHD-MUS", "TS-NAV", null],
    ["K08", "TP-TEA-COR", null, "SV1-V5-CHARCOAL"], ["K03", "TP-FOX-HTH", "TS-SND", null], ["K09", "TP-SHD-FOR", null, null], ["K04", "TP-TEA-CRM", null, null]];
  const keyOf = (f) => f.filter(Boolean).join("+"), outfitOf = {};
  if (RUN("figure")) { const arms = pixelsOf("figure-arms-v1.webp");
    for (const f of FIG) { const o = L.northstarOutfitFor(...f); if (!o || !o.top.startsWith("top-tee-") || (f[1] && o.top !== L.NORTHSTAR_PRINT_TEES[f[1]].item)) throw new Error(keyOf(f) + " is not an allowed tee case");
      outfitOf[keyOf(f)] = o;
      const v2 = L.northstarCompose(L.northstarPlanFor(o), pixelsOf, 1024 * 1536), v1 = L.northstarCompose(L.northstarPlanFor(o, T1), pixelsOf, 1024 * 1536);
      const moved = resplitTee(pixelsOf(o.top + "-top-body-v1.webp"), pixelsOf(o.top + "-sleeves-v1.webp"), arms).moved;
      refs[keyOf(f) + "-v2.png"] = encodePng(1024, 1536, v2); refs[keyOf(f) + "-v1.png"] = encodePng(1024, 1536, v1); refs[keyOf(f) + "-moved.json"] = JSON.stringify(moved);
      for (const k of Object.keys(dec)) if (k.startsWith("top-tee-")) delete dec[k]; } }
  rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const PORT = server.address().port;
  const browser = await chromium.launch(), result = { baseline: [], figure: [], choice: [], failure: [], errors: [] };
  let n = 0;
  const open = async (s, opts, { dpr = 2, width = 600, block = null } = {}) => {
    const url = `/__v/${n++}.html`; pages[url] = page(s, opts);
    const c = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width, height: 1000 }, reducedMotion: "reduce" }), p = await c.newPage();
    if (block) await p.route("**/" + block, (r) => r.fulfill({ status: 404, body: "" }));
    p.on("pageerror", (e) => result.errors.push(`${s}: ${e}`)); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(`${s}: ${m.text()}`); });
    await p.goto(`http://127.0.0.1:${PORT}${url}`); await p.waitForSelector("body[data-done='1']", { timeout: 60000 });
    return { p, c, url, info: await p.evaluate(() => window.__done) };
  };
  const shoot = async (p, s) => decodeScreenshot(await (await p.$(SURFACES[s].sel)).screenshot({ animations: "disabled" }));
  const same = (a, b) => a.w === b.w && a.h === b.h && a.px.every((v, i) => v === b.px[i]);
  const OPT = { avatar_northstar: "1" };
  try {
    // 1. baseline against origin/main: no tee is drawn, so nothing changes
    const states = { "no opt-in": {}, "print tee + shoe stored, no opt-in": { avatar_northstar_tee: "TP-FOX-NAV", avatar_northstar_shoes: "SV1-V5-CHALK" },
      "outfit + tee stored, no opt-in": { avatar_northstar_outfit: "K01", avatar_northstar_tee: "TP-SHD-MUS" }, "opt-in, no outfit, tee stored": { ...OPT, avatar_northstar_tee: "TP-TEA-COR" },
      "opt-in K01 + sweater": { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-HEATHER" },
      "opt-in K07 + AB1 + trousers + sweater + tee": { ...OPT, avatar_northstar_outfit: "K07", avatar_northstar_shoes: "AB1-BOOT-ORIGINAL", avatar_northstar_pants: "TS-NAV", avatar_northstar_sweater: "LS2-NAVY-FOX", avatar_northstar_tee: "TP-FOX-NAV" },
      "opt-in K01 + tank": { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TK-HEATHER" },
      "opt-in K07 + AB1 + trousers + tank": { ...OPT, avatar_northstar_outfit: "K07", avatar_northstar_shoes: "AB1-BOOT-ORIGINAL", avatar_northstar_pants: "TS-NAV", avatar_northstar_sweater: "TK-NAVY-FOX" } };
    if (RUN("baseline")) for (const s of Object.keys(SURFACES)) for (const [st, storage] of Object.entries(states)) {
      const a = await open(s, { code: "pr", storage }), b = await open(s, { code: "main", storage });
      const ia = await shoot(a.p, s), ib = await shoot(b.p, s);
      result.baseline.push({ surface: s, state: st, path: a.info.path, mainPath: b.info.path, key: a.info.key, identicalToMain: same(ia, ib), layersEqualToMain: JSON.stringify(a.info.kids) === JSON.stringify(b.info.kids), storageUnchanged: a.info.storageUnchanged, teeFiles: a.info.teeFiles });
      await a.c.close(); await b.c.close(); }
    // 2. the figure: both arm edges against the v2 and v1 renderings on a light and a dark background; sheets at 600 and 360 px
    const sheets = {};
    if (RUN("figure")) for (const f of FIG) for (const s of Object.keys(SURFACES)) for (const width of [600, 360]) {
      const storage = { ...OPT, avatar_northstar_outfit: f[0], ...(f[1] ? { avatar_northstar_tee: f[1] } : {}), ...(f[2] ? { avatar_northstar_pants: f[2] } : {}), ...(f[3] ? { avatar_northstar_shoes: f[3] } : {}) };
      const o = await open(s, { code: "pr", storage }, { width });
      (sheets[`${s}-${width}`] ||= []).push(await shoot(o.p, s));
      if (width === 600) {
        const cmp = await o.p.evaluate(async ({ sel, key }) => {
          const img = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
          const fig = document.querySelector(sel + ' img[data-c2-layer="base"]'), r2 = await img("/__ref/" + key + "-v2.png"), r1 = await img("/__ref/" + key + "-v1.png"), moved = await (await fetch("/__ref/" + key + "-moved.json")).json();
          const c = document.createElement("canvas"); c.width = 1024; c.height = 1536; const x = c.getContext("2d");
          const on = (bg, im) => { x.fillStyle = bg; x.fillRect(0, 0, 1024, 1536); x.drawImage(im, 0, 0); return x.getImageData(0, 0, 1024, 1536).data; };
          const out = {};
          for (const [name, bg] of [["light", "rgb(236,233,226)"], ["dark", "rgb(28,30,36)"]]) {
            const a = on(bg, fig), b = on(bg, r2), v = on(bg, r1); let max = 0, over2 = 0, movedMax = 0, goneL = 0, goneR = 0;
            for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); max = Math.max(max, d); if (d > 2) over2++; }
            for (const p of moved) { const i = p * 4, d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); movedMax = Math.max(movedMax, d);
              if (Math.max(Math.abs(a[i] - v[i]), Math.abs(a[i + 1] - v[i + 1]), Math.abs(a[i + 2] - v[i + 2])) > 2) { if (p % 1024 < 512) goneL++; else goneR++; } }
            out[name] = { maxDiff: max, pxOver2: over2, movedMaxDiff: movedMax, movedDifferFromV1Left: goneL, movedDifferFromV1Right: goneR }; }
          return { natural: [fig.naturalWidth, fig.naturalHeight], blob: fig.src.startsWith("blob:"), moved: moved.length, ...out }; }, { sel: SURFACES[s].sel, key: keyOf(f) });
        result.figure.push({ want: keyOf(f), top: outfitOf[keyOf(f)].top, surface: s, path: o.info.path, key: o.info.key, teeFiles: o.info.teeFiles, layers: o.info.kids.map((c) => c.marker), overlayVisible: o.info.overlayVisible, storageUnchanged: o.info.storageUnchanged, ...cmp }); }
      await o.c.close(); }
    for (const [name, imgs] of Object.entries(sheets)) { const g = grid(imgs, imgs.length, 16); writeFileSync(join(OUT, "sheet-" + name + ".png"), encodePng(g.w, g.h, g.px)); }
    // 3. the choice on the panel: print tee, reload, sweater, tank, back to the tee, another tee, a blue-tee outfit, reload, return
    if (RUN("choice")) { const o = await open("avatar", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K01" }, keep: true });
      const snap = async (label) => { await o.p.waitForSelector("body[data-done='1']", { timeout: 60000 }); const info = await o.p.evaluate(() => window.__done);
        result.choice.push({ clicked: label, path: info.path, key: info.key, tee: info.storage.avatar_northstar_tee || null, top: info.storage.avatar_northstar_sweater || null, outfit: info.storage.avatar_northstar_outfit || null, teeFiles: info.teeFiles }); };
      const step = async (label) => { await Promise.all([o.p.waitForEvent("load"), o.p.getByRole("button", { name: label, exact: true }).click()]); await snap(label); };
      const reload = async () => { await Promise.all([o.p.waitForEvent("load"), o.p.reload()]); await snap("(reload)"); };
      await snap("(start K01)"); await step("Ræv · navy"); await reload(); await step("Sweater · lyng"); await step("Tanktop · navy"); await step("Outfittets egen top");
      await step("Skjold · sennep"); await step("K13"); await reload(); await step("Nuværende avatar"); await o.c.close(); }
    // 4. a tee's -v2 body layer, its -v2 sleeve layer or its shadow that does not load → today's path; the stored choice untouched
    const fo = { top: L.NORTHSTAR_PRINT_TEES["TP-FOX-NAV"].item, bottom: "bottom-capri-lightblue", shoes: "shoes-sneakers-beige" }, shade = L.northstarPlanFor(fo).find((x) => x.op === "shade" && x.src.includes("top-tee-")).src.split("/").pop();
    if (RUN("choice")) for (const file of [fo.top + "-top-body-v2.webp", fo.top + "-sleeves-v2.webp", shade]) {
      const o = await open("hub", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K07", avatar_northstar_tee: "TP-FOX-NAV" } }, { block: file });
      result.failure.push({ blocked: file, path: o.info.path, figureMounted: o.info.kids.some((c) => c.src === "blob:"), storageUnchanged: o.info.storageUnchanged }); await o.c.close(); }
  } finally { await browser.close(); server.close(); }
  const ch = result.choice, fox = L.NORTHSTAR_PRINT_TEES["TP-FOX-NAV"].item, mus = L.NORTHSTAR_PRINT_TEES["TP-SHD-MUS"].item;
  const edge = (e) => e.maxDiff <= 3 && e.pxOver2 <= 5 && e.movedMaxDiff <= 3 && e.movedDifferFromV1Left > 0 && e.movedDifferFromV1Right > 0;
  const all = { baseline: result.baseline.length === 24 && result.baseline.every((b) => b.identicalToMain && b.layersEqualToMain && b.path === b.mainPath && b.storageUnchanged && b.teeFiles.length === 0),
    figure: result.figure.length === FIG.length * 3 && result.figure.every((f) => f.path === "northstar" && f.key === f.want && f.blob && f.natural[0] === 1024 && f.natural[1] === 1536 && edge(f.light) && edge(f.dark)
      && teeFilesOk(f.teeFiles, f.top) && !f.overlayVisible && f.storageUnchanged && f.layers.filter((m) => m === "base").length === 1),
    choice: ch.length === 10 && ch.every((c) => teeFilesOk(c.teeFiles, null))
      && ch[0].key === "K01" && ch[0].path === "northstar" && teeFilesOk(ch[0].teeFiles, "top-tee-hip-cream")
      && ch[1].key === "K01+TP-FOX-NAV" && teeFilesOk(ch[1].teeFiles, fox) && ch[2].key === "K01+TP-FOX-NAV" && ch[2].tee === "TP-FOX-NAV" && teeFilesOk(ch[2].teeFiles, fox)
      && ch[3].key === "K01+LS2-HEATHER" && ch[3].tee === "TP-FOX-NAV" && ch[3].top === "LS2-HEATHER" && ch[3].teeFiles.length === 0
      && ch[4].key === "K01+TK-NAVY" && ch[4].top === "TK-NAVY" && ch[4].teeFiles.length === 0
      && ch[5].key === "K01+TP-FOX-NAV" && ch[5].top === null && teeFilesOk(ch[5].teeFiles, fox)
      && ch[6].key === "K01+TP-SHD-MUS" && teeFilesOk(ch[6].teeFiles, mus)
      && ch[7].key === "K13" && ch[7].path === "northstar" && teeFilesOk(ch[7].teeFiles, "top-tee-hip-blue") && ch[8].key === "K13" && teeFilesOk(ch[8].teeFiles, "top-tee-hip-blue")
      && ch[9].path === "r2" && ch[9].outfit === null && ch[9].key === null,
    failure: result.failure.length === 3 && result.failure.every((f) => f.path === "r2" && !f.figureMounted && f.storageUnchanged),
    noPageErrors: result.errors.length === 0 };
  const parts = { baseline: ["baseline"], figure: ["figure"], choice: ["choice", "failure"] }, ok = Object.fromEntries(Object.entries(all).filter(([k]) => k === "noPageErrors" || !PART || parts[PART].includes(k)));
  writeFileSync(join(OUT, PART ? "result-" + PART + ".json" : "result.json"), JSON.stringify({ ok, ...result }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, baselinePages: result.baseline.length, figure: result.figure.map((f) => f.want + "/" + f.surface + ": light " + f.light.maxDiff + "/" + f.light.movedDifferFromV1Left + "+" + f.light.movedDifferFromV1Right + " dark " + f.dark.maxDiff + "/" + f.dark.movedDifferFromV1Left + "+" + f.dark.movedDifferFromV1Right),
    choice: ch.map((c) => c.clicked + "→" + (c.key || c.path)), failure: result.failure.map((f) => f.blocked + "→" + f.path), errors: result.errors.slice(0, 5) }));
  if (!Object.values(ok).every(Boolean)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
