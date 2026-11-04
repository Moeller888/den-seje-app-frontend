// D-337 BROWSER VERIFICATION of the 6 owner-approved sweaters (D-336) in the Northstar opt-in, on the real renderer
// (js/avatar-render-c2.js mountC2Avatar), the real panel (js/avatar-northstar-panel.js) and the engines, in Chromium against a local
// static server of this checkout; origin/main's modules are served under /__main/ for the baseline (the D-242/D-308/D-331 pattern):
//   1. BASELINE — without the opt-in (also with a stored sweater or an outfit), with the opt-in and no outfit, where the sweater is not
//      approved (K04's shorts; K16's blue tee with ankle boots) and with an unknown ID: every surface pixel-identical to origin/main;
//   2. FIGURE — sweaters over the skirt, capri, navy and sand trousers on quiz, hub and avatar: path "northstar", one composed figure
//      layer, the key names the sweater, the picture equals northstarCompose of the same plan (the hip seam behind the bottom) computed
//      in Node from the decoded published files (at most 3 levels, at most 5 pixels above 2), the right hip included;
//   3. CHOICE — K01 → a sweater, a reload keeps it; navy trousers keep it; K16 (outside the list) shows the outfit's own top with the
//      choice kept, also after a reload; K07 brings it back; another sweater; "Outfittets egen top" returns; "Nuværende avatar";
//   3b. BLOCKED — a stored sweater with an SV1 shoe (not the beige sneakers): the outfit's own top, the sweater buttons disabled;
//   4. FAILURE — the hip seam, a sweater layer or the cut's shadow that does not load gives today's path whole, the choice kept;
//   5. PRESENTATION — sheets at actual size (DPR 2) for quiz, hub and avatar, widths 600 and 360 (private: they show C).
// Needs Playwright's Chromium and the vendored dwebp; never part of the unit tests.
// Usage: node tools/avatar/verify-northstar-ls2-sweaters-d337.mjs --dwebp <dwebp.exe> --out <dir outside the repository>
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
  const tmp = join(tmpdir(), "d337b-" + process.pid); mkdirSync(tmp, { recursive: true }); const dec = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!dec[f]) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", f), "-o", o]); dec[f] = Uint8ClampedArray.from(decodePng(readFileSync(o)).px); } return dec[f]; };
  // [K, tee, trousers, shoe, sweater]: skirt, capri, navy trousers, sand trousers
  const FIG = [["K01", null, null, null, "LS2-HEATHER"], ["K07", null, null, null, "LS2-NAVY-FOX"], ["K01", null, "TS-NAV", null, "LS2-HEATHER-TEAPOT"], ["K04", null, "TS-SND", null, "LS2-NAVY"]];
  const keyOf = ([k, t, p, sh, sw]) => [k, t, p, sh, sw].filter(Boolean).join("+");
  for (const f of FIG) { const o = L.northstarOutfitFor(...f); if (o.top !== L.NORTHSTAR_LS2_SWEATERS[f[4]].item) throw new Error(keyOf(f) + " is not an allowed case"); refs[keyOf(f)] = encodePng(1024, 1536, L.northstarCompose(L.northstarPlanFor(o), pixelsOf, 1024 * 1536)); }
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
    // 1. baseline against origin/main: a stored sweater without the opt-in, without an outfit, or where it is not allowed never appears
    const states = { "no opt-in": {}, "sweater stored, no opt-in": { avatar_northstar_sweater: "LS2-HEATHER" }, "outfit + sweater stored, no opt-in": { avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-NAVY" },
      "opt-in, no outfit, sweater stored": { ...OPT, avatar_northstar_sweater: "LS2-HEATHER" }, "opt-in K04 (shorts) + sweater (not approved)": { ...OPT, avatar_northstar_outfit: "K04", avatar_northstar_sweater: "LS2-NAVY" },
      "opt-in K16 + sweater (blue tee, ankle boots: not approved)": { ...OPT, avatar_northstar_outfit: "K16", avatar_northstar_sweater: "LS2-HEATHER-FOX" }, "opt-in K01 + unknown LS2-RED": { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-RED" } };
    for (const s of Object.keys(SURFACES)) for (const [st, storage] of Object.entries(states)) {
      const a = await open(s, { code: "pr", storage }), b = await open(s, { code: "main", storage });
      const ia = await shoot(a.p, s), ib = await shoot(b.p, s);
      result.baseline.push({ surface: s, state: st, path: a.info.path, mainPath: b.info.path, identicalToMain: same(ia, ib), layersEqualToMain: JSON.stringify(a.info.kids) === JSON.stringify(b.info.kids), storageUnchanged: a.info.storageUnchanged });
      await a.c.close(); await b.c.close(); }
    // 2 + 5. the figure (skirt, capri, navy and sand trousers) and the sheets
    const sheets = {};
    for (const f of FIG) for (const s of Object.keys(SURFACES)) for (const width of [600, 360]) {
      const storage = { ...OPT, avatar_northstar_outfit: f[0], avatar_northstar_sweater: f[4], ...(f[2] ? { avatar_northstar_pants: f[2] } : {}), ...(f[1] ? { avatar_northstar_tee: f[1] } : {}) };
      const o = await open(s, { code: "pr", storage }, { width });
      (sheets[`${s}-${width}`] ||= []).push(await shoot(o.p, s));
      if (width === 600) {
        const cmp = await o.p.evaluate(async ({ sel, key }) => {
          const fig = document.querySelector(sel + ' img[data-c2-layer="base"]'), ref = new Image(); ref.src = "/__ref/" + key + ".png"; await ref.decode();
          const c = document.createElement("canvas"); c.width = 1024; c.height = 1536; const x = c.getContext("2d");
          x.fillStyle = "rgb(236,233,226)"; x.fillRect(0, 0, 1024, 1536); x.drawImage(fig, 0, 0); const a = x.getImageData(0, 0, 1024, 1536).data;
          x.fillRect(0, 0, 1024, 1536); x.drawImage(ref, 0, 0); const b = x.getImageData(0, 0, 1024, 1536).data;
          let max = 0, over2 = 0, hipMax = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); max = Math.max(max, d); if (d > 2) over2++;
            const p = i / 4, X = p % 1024, Y = (p / 1024) | 0; if (X >= 590 && X < 670 && Y >= 770 && Y < 840) hipMax = Math.max(hipMax, d); }
          return { natural: [fig.naturalWidth, fig.naturalHeight], blob: fig.src.startsWith("blob:"), maxDiff: max, pxOver2: over2, rightHipMaxDiff: hipMax }; }, { sel: SURFACES[s].sel, key: keyOf(f) });
        result.figure.push({ want: keyOf(f), surface: s, path: o.info.path, key: o.info.key, layers: o.info.kids.map((c) => c.marker), overlayVisible: o.info.overlayVisible, storageUnchanged: o.info.storageUnchanged, ...cmp }); }
      await o.c.close(); }
    for (const [name, imgs] of Object.entries(sheets)) { const g = grid(imgs, imgs.length, 16); writeFileSync(join(OUT, "sheet-" + name + ".png"), encodePng(g.w, g.h, g.px)); }
    // 3. the choice on the panel: store, reload, combine, leave the list (own top, choice kept, also after a reload), come back, return
    { const o = await open("avatar", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K01" }, keep: true });
      const snap = async (label) => { await o.p.waitForSelector("body[data-done='1']", { timeout: 60000 });
        const info = await o.p.evaluate(() => window.__done), pressed = await o.p.$$eval(".northstar-sweater-list button[aria-pressed='true']", (b) => b.map((x) => x.textContent));
        const disabled = await o.p.$$eval(".northstar-sweater-list button", (b) => b.filter((x) => x.disabled).map((x) => x.textContent)), note = await o.p.$eval(".northstar-sweater-list + .northstar-note", (e) => e.textContent);
        result.choice.push({ clicked: label, path: info.path, key: info.key, sweater: info.storage.avatar_northstar_sweater || null, pants: info.storage.avatar_northstar_pants || null, outfit: info.storage.avatar_northstar_outfit || null, pressed, disabled, note }); };
      const step = async (label) => { await Promise.all([o.p.waitForEvent("load"), o.p.getByRole("button", { name: label, exact: true }).click()]); await snap(label); };
      const reload = async () => { await Promise.all([o.p.waitForEvent("load"), o.p.reload()]); await snap("(reload)"); };
      await snap("(start K01)"); await step("Sweater · lyng"); await reload(); await step("Lige bukser · navy");
      await step("K16"); await reload(); await step("K07"); await step("Sweater · navy · ræv"); await step("Outfittets egen top"); await step("Nuværende avatar"); await o.c.close(); }
    // 3b. a stored sweater with an SV1 shoe (not the beige sneakers): the outfit's own top with the shoe; the sweater kept
    { const o = await open("avatar", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-HEATHER", avatar_northstar_shoes: "SV1-V5-CHALK" } });
      const disabled = await o.p.$$eval(".northstar-sweater-list button", (b) => b.filter((x) => x.disabled).map((x) => x.textContent)), note = await o.p.$eval(".northstar-sweater-list + .northstar-note", (e) => e.textContent);
      result.blocked = { key: o.info.key, path: o.info.path, sweaterStored: o.info.storage.avatar_northstar_sweater, disabledCount: disabled.length, note }; await o.c.close(); }
    // 4. the hip seam, a sweater layer or the cut's shadow that does not load → today's path; the stored choice untouched
    for (const file of ["top-sweater-ls2-hip-seam-v1.webp", "top-sweater-ls2-heather-top-body-v1.webp", "top-sweater-ls2-shadow-body-v1.webp"]) {
      const o = await open("hub", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-HEATHER" } }, { block: file });
      result.failure.push({ blocked: file, path: o.info.path, figureMounted: o.info.kids.some((c) => c.src === "blob:"), storageUnchanged: o.info.storageUnchanged }); await o.c.close(); }
  } finally { await browser.close(); server.close(); }
  const ch = result.choice, B = result.blocked;
  const ok = { baseline: result.baseline.every((b) => b.identicalToMain && b.layersEqualToMain && b.path === b.mainPath && b.storageUnchanged),
    figure: result.figure.every((f) => f.path === "northstar" && f.key === f.want && f.blob && f.natural[0] === 1024 && f.natural[1] === 1536 && f.maxDiff <= 3 && f.pxOver2 <= 5 && f.rightHipMaxDiff <= 3 && !f.overlayVisible && f.storageUnchanged && f.layers.filter((m) => m === "base").length === 1),
    choice: ch.length === 10 && ch[0].key === "K01" && ch[0].pressed.join() === "Outfittets egen top" && ch[0].disabled.length === 0
      && ch[1].key === "K01+LS2-HEATHER" && ch[1].path === "northstar" && ch[1].pressed.join() === "Sweater · lyng"
      && ch[2].key === "K01+LS2-HEATHER" && ch[2].sweater === "LS2-HEATHER"
      && ch[3].key === "K01+TS-NAV+LS2-HEATHER"
      && ch[4].key === "K16+TS-NAV" && ch[4].sweater === "LS2-HEATHER" && ch[4].pressed.join() === "Outfittets egen top" && ch[4].disabled.length === 6 && /beige sneakers/.test(ch[4].note)
      && ch[5].key === "K16+TS-NAV" && ch[5].sweater === "LS2-HEATHER" && ch[5].pressed.join() === "Outfittets egen top"
      && ch[6].key === "K07+TS-NAV+LS2-HEATHER" && ch[7].key === "K07+TS-NAV+LS2-NAVY-FOX"
      && ch[8].key === "K07+TS-NAV" && ch[8].sweater === null && ch[8].pressed.join() === "Outfittets egen top"
      && ch[9].path === "r2" && ch[9].outfit === null && ch[9].key === null,
    blocked: B.key === "K01+SV1-V5-CHALK" && B.path === "northstar" && B.sweaterStored === "LS2-HEATHER" && B.disabledCount === 6 && /beige sneakers/.test(B.note),
    failure: result.failure.every((f) => f.path === "r2" && !f.figureMounted && f.storageUnchanged),
    noPageErrors: result.errors.length === 0 };
  writeFileSync(join(OUT, "result.json"), JSON.stringify({ ok, ...result }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, baselinePages: result.baseline.length, figure: result.figure.map((f) => f.want + "/" + f.surface + ":" + f.maxDiff + "/" + f.pxOver2 + "/hip" + f.rightHipMaxDiff), choice: ch.map((c) => c.clicked + "→" + (c.key || c.path) + (c.sweater ? " [" + c.sweater + "]" : "")), blocked: B, errors: result.errors.slice(0, 5) }));
  if (!Object.values(ok).every(Boolean)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
