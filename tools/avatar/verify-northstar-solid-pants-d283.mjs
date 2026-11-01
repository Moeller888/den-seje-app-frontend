// D-283 BROWSER VERIFICATION of the 2 approved solid trousers (D-281) in the Northstar opt-in, on the real renderer
// (js/avatar-render-c2.js mountC2Avatar), the real panel (js/avatar-northstar-panel.js) and the engines, in Chromium against a local
// static server of this checkout; origin/main's modules are served under /__main/ for the baseline (the D-242/D-275 pattern). Measures:
//   1. BASELINE — without the opt-in (also with stored trousers or an outfit), with the opt-in and no outfit, with an unknown trousers
//      ID, with a print tee but no trousers and on K17 without trousers, every surface renders the figure pixel-identical to origin/main
//      with the same layers and path;
//   2. FIGURE — trousers on K outfits (with and without a print tee, including low-contrast pairs) on quiz, hub and avatar: the path is
//      "northstar", one composed figure layer, the key names the trousers, and the picture equals northstarCompose of the same plan
//      computed here in Node from the decoded published files (at most 3 levels, at most 5 pixels above 2); no expression overlay;
//   3. CHOICE — on avatar.html's panel: K04 → each trousers button stores the choice and reloads into it; a reload keeps it; a print tee
//      combines with it; "Outfittets egen underdel" returns to K04's own bottom; another K keeps the trousers; "Nuværende avatar"
//      returns to today's avatar;
//   4. FAILURE — a trousers layer or their (olive) shadow that does not load gives today's path whole, the stored choice untouched;
//   5. PRESENTATION — sheets at actual size (DPR 2) for quiz, hub and avatar, widths 600 and 360 (private: they show C).
// Needs Playwright's Chromium and the vendored dwebp; never part of the unit tests.
// Usage: node tools/avatar/verify-northstar-solid-pants-d283.mjs --dwebp <dwebp.exe> --out <dir outside the repository>
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";
import { grid } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(arg("--out", "")), DWEBP = arg("--dwebp", "");
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
function page(s, { code, storage, keep = false, theme = "default" }) {
  const S = SURFACES[s], html = code === "main" ? mainFile(S.file).toString("utf8") : readFileSync(join(ROOT, S.file), "utf8"), base = code === "main" ? "/__main" : "";
  return `<!doctype html><html lang="da" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${base}/style.css"><link rel="stylesheet" href="${base}/css/theme.css"><style>${style(html)}</style><style>body{display:block;padding:24px;margin:0}</style></head><body>${S.box}
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
window.__done = { path, kids, key: ns ? ns.key : null, overlayVisible: !!overlay && getComputedStyle(overlay).display !== "none", storageUnchanged: JSON.stringify({ ...localStorage }) === before, storage: { ...localStorage } };
document.body.dataset.done = "1";
</script></body></html>`;
}

const pages = {}, refs = {}, server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]); if (pages[u]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[u]); }
  if (u.startsWith("/__ref/")) { const k = u.slice(7, -4); res.writeHead(200, { "content-type": "image/png" }); return res.end(refs[k]); }
  if (u.startsWith("/__main/")) { try { const b = mainFile(u.slice(8)); res.writeHead(200, { "content-type": TYPES[extname(u)] || "application/octet-stream" }); return res.end(b); } catch { res.writeHead(404); return res.end(); } }
  const p = join(ROOT, u); if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
});

async function main() {
  const { chromium } = await import("@playwright/test");
  const L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  // the Node references: northstarCompose of each plan on the decoded published files
  const tmp = join(tmpdir(), "d283b-" + process.pid); mkdirSync(tmp, { recursive: true }); const dec = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!dec[f]) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", f), "-o", o]); dec[f] = Uint8ClampedArray.from(decodePng(readFileSync(o)).px); } return dec[f]; };
  const FIG = [["K04", "TP-TEA-NAV", "TS-NAV"], ["K02", "TP-TEA-MUS", "TS-SND"], ["K05", "TP-SHD-COR", "TS-SND"], ["K12", null, "TS-SND"], ["K18", null, "TS-NAV"], ["K16", null, "TS-NAV"], ["K08", null, "TS-SND"]];
  const keyOf = ([k, t, p]) => k + (t ? "+" + t : "") + "+" + p;
  for (const f of FIG) refs[keyOf(f)] = encodePng(1024, 1536, L.northstarCompose(L.northstarPlanFor(L.northstarOutfitFor(f[0], f[1], f[2])), pixelsOf, 1024 * 1536));
  rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const PORT = server.address().port;
  const browser = await chromium.launch(), result = { baseline: [], figure: [], choice: [], failure: [], errors: [] };
  let n = 0;
  const open = async (s, opts, { dpr = 2, width = 600, block = null, ctx = null } = {}) => {
    const url = `/__v/${n++}.html`; pages[url] = page(s, opts);
    const c = ctx || (await browser.newContext({ deviceScaleFactor: dpr, viewport: { width, height: 1000 }, reducedMotion: "reduce" })), p = await c.newPage();
    if (block) await p.route("**/" + block, (r) => r.fulfill({ status: 404, body: "" }));
    p.on("pageerror", (e) => result.errors.push(`${s}: ${e}`)); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(`${s}: ${m.text()}`); });
    await p.goto(`http://127.0.0.1:${PORT}${url}`); await p.waitForSelector("body[data-done='1']", { timeout: 60000 });
    return { p, c, url, info: await p.evaluate(() => window.__done) };
  };
  const shoot = async (p, s) => decodeScreenshot(await (await p.$(SURFACES[s].sel)).screenshot({ animations: "disabled" }));
  const same = (a, b) => a.w === b.w && a.h === b.h && a.px.every((v, i) => v === b.px[i]);
  const OPT = { avatar_northstar: "1" };
  try {
    // 1. baseline against origin/main (the screenshot is the avatar element only, so the panel's new row does not enter it)
    const states = { "no opt-in": {}, "trousers stored, no opt-in": { avatar_northstar_pants: "TS-NAV" }, "outfit + trousers stored, no opt-in": { avatar_northstar_outfit: "K04", avatar_northstar_pants: "TS-NAV" },
      "opt-in, no outfit, trousers stored": { ...OPT, avatar_northstar_pants: "TS-SND" }, "opt-in K04 + unknown TS-STR": { ...OPT, avatar_northstar_outfit: "K04", avatar_northstar_pants: "TS-STR" },
      "opt-in K04 + print tee, no trousers": { ...OPT, avatar_northstar_outfit: "K04", avatar_northstar_tee: "TP-TEA-NAV" }, "opt-in K17, no trousers": { ...OPT, avatar_northstar_outfit: "K17" } };
    for (const s of Object.keys(SURFACES)) for (const [st, storage] of Object.entries(states)) {
      const a = await open(s, { code: "pr", storage }), b = await open(s, { code: "main", storage });
      const ia = await shoot(a.p, s), ib = await shoot(b.p, s);
      result.baseline.push({ surface: s, state: st, path: a.info.path, mainPath: b.info.path, identicalToMain: same(ia, ib), layersEqualToMain: JSON.stringify(a.info.kids) === JSON.stringify(b.info.kids), storageUnchanged: a.info.storageUnchanged });
      await a.c.close(); await b.c.close(); }
    // 2 + 5. the figure and the sheets
    const sheets = {};
    for (const f of FIG) for (const s of Object.keys(SURFACES)) for (const width of [600, 360]) {
      const storage = { ...OPT, avatar_northstar_outfit: f[0], avatar_northstar_pants: f[2], ...(f[1] ? { avatar_northstar_tee: f[1] } : {}) };
      const o = await open(s, { code: "pr", storage }, { width });
      (sheets[`${s}-${width}`] ||= []).push(await shoot(o.p, s));
      if (width === 600) {
        const cmp = await o.p.evaluate(async ({ sel, key }) => {
          const fig = document.querySelector(sel + ' img[data-c2-layer="base"]'), ref = new Image(); ref.src = "/__ref/" + key + ".png"; await ref.decode();
          const c = document.createElement("canvas"); c.width = 1024; c.height = 1536; const x = c.getContext("2d");
          x.fillStyle = "rgb(236,233,226)"; x.fillRect(0, 0, 1024, 1536); x.drawImage(fig, 0, 0); const a = x.getImageData(0, 0, 1024, 1536).data;
          x.fillRect(0, 0, 1024, 1536); x.drawImage(ref, 0, 0); const b = x.getImageData(0, 0, 1024, 1536).data;
          let max = 0, over2 = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); max = Math.max(max, d); if (d > 2) over2++; }
          return { natural: [fig.naturalWidth, fig.naturalHeight], blob: fig.src.startsWith("blob:"), maxDiff: max, pxOver2: over2 }; }, { sel: SURFACES[s].sel, key: keyOf(f) });
        result.figure.push({ want: keyOf(f), surface: s, path: o.info.path, key: o.info.key, layers: o.info.kids.map((c) => c.marker), overlayVisible: o.info.overlayVisible, storageUnchanged: o.info.storageUnchanged, ...cmp }); }
      await o.c.close(); }
    for (const [name, imgs] of Object.entries(sheets)) { const g = grid(imgs, imgs.length, 16); writeFileSync(join(OUT, "sheet-" + name + ".png"), encodePng(g.w, g.h, g.px)); }
    // 3. the choice on the panel: store, reload, combine, return
    { const o = await open("avatar", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K04" }, keep: true });
      const snap = async (label) => { await o.p.waitForSelector("body[data-done='1']", { timeout: 60000 });
        const info = await o.p.evaluate(() => window.__done), pressed = await o.p.$$eval(".northstar-pants-list button[aria-pressed='true']", (b) => b.map((x) => x.textContent));
        const enabled = await o.p.$$eval(".northstar-pants-list button", (b) => b.filter((x) => !x.disabled).length), status = await o.p.$eval(".northstar-status", (e) => e.textContent);
        result.choice.push({ clicked: label, path: info.path, key: info.key, pants: info.storage.avatar_northstar_pants || null, tee: info.storage.avatar_northstar_tee || null, outfit: info.storage.avatar_northstar_outfit || null, pantsPressed: pressed, pantsButtonsEnabled: enabled, status }); };
      const step = async (label) => { await Promise.all([o.p.waitForEvent("load"), o.p.getByRole("button", { name: label, exact: true }).click()]); await snap(label); };
      await snap("(start K04)");
      await step("Lige bukser · navy"); await step("Lige bukser · sand");
      await Promise.all([o.p.waitForEvent("load"), o.p.reload()]); await snap("(reload)");
      await step("Tekande · navy"); await step("Outfittets egen underdel"); await step("Lige bukser · navy"); await step("K12"); await step("Nuværende avatar"); await o.c.close(); }
    // 4. a trousers layer or the olive shadow that does not load → today's path; the stored choice untouched
    for (const file of ["bottom-trousers-square-navy-pants-v1.webp", "bottom-trousers-square-olive-shadow-body-v1.webp"]) {
      const o = await open("hub", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K04", avatar_northstar_pants: "TS-NAV" } }, { block: file });
      result.failure.push({ blocked: file, path: o.info.path, figureMounted: o.info.kids.some((c) => c.src === "blob:"), storageUnchanged: o.info.storageUnchanged }); await o.c.close(); }
  } finally { await browser.close(); server.close(); }
  const ch = result.choice, at = (l) => ch.filter((c) => c.clicked === l);
  const ok = { baseline: result.baseline.every((b) => b.identicalToMain && b.layersEqualToMain && b.path === b.mainPath && b.storageUnchanged),
    figure: result.figure.every((f) => f.path === "northstar" && f.key === f.want && f.blob && f.natural[0] === 1024 && f.natural[1] === 1536 && f.maxDiff <= 3 && f.pxOver2 <= 5 && !f.overlayVisible && f.storageUnchanged && f.layers.filter((m) => m === "base").length === 1),
    choice: ch.length === 9 && ch[0].key === "K04" && ch[0].pantsButtonsEnabled === 3 && ch[0].pantsPressed.join() === "Outfittets egen underdel"
      && ch[1].key === "K04+TS-NAV" && ch[1].path === "northstar" && ch[1].pantsPressed.join() === "Lige bukser · navy"
      && ch[2].key === "K04+TS-SND" && ch[3].key === "K04+TS-SND" && ch[3].pants === "TS-SND" && ch[3].pantsPressed.join() === "Lige bukser · sand"
      && ch[4].key === "K04+TP-TEA-NAV+TS-SND" && ch[5].key === "K04+TP-TEA-NAV" && ch[5].pants === null && ch[5].pantsPressed.join() === "Outfittets egen underdel"
      && ch[6].key === "K04+TP-TEA-NAV+TS-NAV" && ch[7].key === "K12+TS-NAV" && ch[7].tee === "TP-TEA-NAV" && ch[7].path === "northstar"
      && ch[8].path === "r2" && ch[8].outfit === null && ch[8].key === null && at("Nuværende avatar").length === 1,
    failure: result.failure.every((f) => f.path === "r2" && !f.figureMounted && f.storageUnchanged),
    noPageErrors: result.errors.length === 0 };
  writeFileSync(join(OUT, "result.json"), JSON.stringify({ ok, ...result }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, baselinePages: result.baseline.length, figure: result.figure.map((f) => f.want + "/" + f.surface + ":" + f.maxDiff + "/" + f.pxOver2), choice: ch.map((c) => c.clicked + "→" + (c.key || c.path)), errors: result.errors.slice(0, 5) }));
  if (!Object.values(ok).every(Boolean)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
