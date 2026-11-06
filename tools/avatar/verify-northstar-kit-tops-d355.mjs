// D-355 BROWSER VERIFICATION AND PRIVATE PREVIEW of the 33 tops in the Northstar opt-in, on the real renderer, panel and engines in
// Chromium against a local server of this checkout; the new layer files come from the repository once published (D-355) and only
// otherwise from the PRIVATE staging (--staging, never copied by this tool); origin/main's modules under /__main/ for the baseline:
//   1. BASELINE — without a stored outfit, without an outfit, where a top of the 33 is not allowed (a sweater
//      or tank of the 33 on the shorts), with an unknown ID, and the approved tees, print tees, sweaters and tank tops: every surface
//      pixel-identical to origin/main;
//   2. FIGURE — tops of the 33 (all three cuts; fabrics, patterns, motifs; skirt, shorts, capri and the three trousers; beige, SV1, AB-1,
//      white, lace-up and brown shoes; a print tee replaced) on quiz, hub and avatar: the key names the top, the picture equals Node's
//      northstarCompose of the runtime plan over the staged and published files; sheets at 600 and 360 px;
//   3. CHOICE — D-359's wardrobe of single parts (the 33 are cards among the tops: 63): from K01 put on a tee of the 33, a reload keeps
//      it; the navy shorts (the tee stays); a sweater of the 33 (the bottom is swapped off the shorts); an approved tank top; a tank of the
//      33; "Brug min nuværende avatar" — every result an approved outfit, drawn on the Northstar path;
//   4. FAILURE — a staged layer or a shared shadow that does not load gives today's path whole, the choice kept;
//   5. PREVIEW — the wardrobe at 1100 and 390 px (no horizontal scroll), for the private decision page.
// D-357 (flag on, the choice on the account): each page's identity carries the choice this browser stored, as the pupil's account would.
// --part baseline|figure|choice runs one part alone (choice = 3, 4 and 5) and writes result-<part>.json.
// Usage: node tools/avatar/verify-northstar-kit-tops-d355.mjs --dwebp <dwebp.exe> --staging <D-355 staging dir> --out <dir outside the repository> [--part <part>]
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
const OUT = resolve(arg("--out", "")), DWEBP = arg("--dwebp", ""), STG = resolve(arg("--staging", "")), PART = arg("--part", null), RUN = (p) => !PART || PART === p;
if (PART && !["baseline", "figure", "choice"].includes(PART)) throw new Error("--part baseline|figure|choice");
if (!arg("--out") || OUT.toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--out must be outside the repository (the sheets show C, D-127 §2)");
if (!arg("--staging") || STG.toLowerCase().startsWith(ROOT.toLowerCase()) || !existsSync(join(STG, "staging-manifest.json"))) throw new Error("--staging <the private D-355 staging>");
if (!DWEBP || !existsSync(DWEBP)) throw new Error("--dwebp <the vendored dwebp>");
mkdirSync(OUT, { recursive: true });
const STAGED = join(STG, "staging"), M = JSON.parse(readFileSync(join(STG, "staging-manifest.json"), "utf8")), KIT = Object.keys(M.itemTable);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const IDENTITY = { body_type: "neutral", skin_tone: "medium", hairstyle: "default", hair_color: "brown" };
const SURFACES = {
  quiz: { file: "index.html", box: '<div class="game-identity"><div id="avatar-display"></div></div>', sel: "#avatar-display", layerClass: "quiz-avatar-layer" },
  hub: { file: "hub.html", box: '<div class="avatar-showcase" id="avatarShowcase"><div class="profile-avatar" id="profileAvatar"></div></div>', sel: "#profileAvatar", layerClass: "profile-avatar-layer" },
  avatar: { file: "avatar.html", box: '<div class="avatar-wrap" id="avatarWrap"><div class="avatar-aura"></div><div id="avatar-preview"></div></div><div class="northstar-panel" id="northstarPanel" hidden></div><div class="northstar-wardrobe" id="northstarWardrobe" hidden></div>', sel: "#avatar-preview", layerClass: "avatar-layer" },
};
const mainFile = (f) => execFileSync("git", ["show", `origin/main:${f}`], { cwd: ROOT, maxBuffer: 1 << 26 });
const style = (html) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");

function page(s, { code, storage, keep = false }) {
  const S = SURFACES[s], html = code === "main" ? mainFile(S.file).toString("utf8") : readFileSync(join(ROOT, S.file), "utf8"), base = code === "main" ? "/__main" : "";
  return `<!doctype html><html lang="da" data-theme="default"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${base}/style.css"><link rel="stylesheet" href="${base}/css/theme.css"><style>${style(html)}</style><style>body{display:block;padding:24px;margin:0}</style></head><body>${S.box}
<script type="module">
window.__AVATAR_TEST__ = true; ${keep ? `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage || {})})) localStorage.setItem(k, v); }` : `localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage || {})})) localStorage.setItem(k, v);`}
const before = JSON.stringify({ ...localStorage });
const L = await import("${base}/js/avatar-layers.js"), R = await import("${base}/js/avatar-render-c2.js"), E = await import("${base}/js/avatar-expression-engine.js");
// D-357: the figure reads the pupil's ACCOUNT (identity.northstar); the page's account is what this browser stored (the panel's local mode)
const identity = { ...${JSON.stringify(IDENTITY)}, northstar: Object.fromEntries([["outfit", "avatar_northstar_outfit"], ["tee", "avatar_northstar_tee"], ["pants", "avatar_northstar_pants"], ["shoes", "avatar_northstar_shoes"], ["top", "avatar_northstar_sweater"]].map(([f, k]) => [f, localStorage.getItem(k)]).filter(([, v]) => v)) };
const el = document.querySelector(${JSON.stringify(S.sel)});
const path = await R.mountC2Avatar(el, identity, { layerClass: ${JSON.stringify(S.layerClass)}, cosmetics: [], surface: ${JSON.stringify(s)} });
let ee = null; try { ee = new E.ExpressionEngine(el); } catch (_e) {}
await R.markAvatarRendered(el);
${s === "avatar" && code === "pr" ? `const P = await import("/js/avatar-northstar-panel.js"), KEYS = { outfit: "avatar_northstar_outfit", tee: "avatar_northstar_tee", pants: "avatar_northstar_pants", shoes: "avatar_northstar_shoes", top: "avatar_northstar_sweater" };
// D-359: the pupil's wardrobe of single parts; saving writes the page's account (this browser's keys), as set_avatar_northstar would
P.mountNorthstarWardrobe(document.getElementById("northstarWardrobe"), el, { saveChoice: async (c) => { for (const k of Object.values(KEYS)) localStorage.removeItem(k); for (const [f, k] of Object.entries(KEYS)) if (c[f]) localStorage.setItem(k, c[f]); return true; } });` : ""}
const overlay = el.querySelector(".avatar-expr-overlay"), ns = L.northstarRenderFor ? L.northstarRenderFor(${JSON.stringify(s)}, []) : null;
const kids = [...el.children].map((c) => ({ marker: c.getAttribute("data-c2-layer") || c.id, src: (c.getAttribute("src") || "").replace(/^blob:.*/, "blob:"), z: c.style.zIndex }));
const now = L.northstarOutfitNow ? L.northstarOutfitNow() : null, nowId = now ? now.top + "+" + now.bottom + "+" + now.shoes : null;
window.__done = { path, kids, key: ns ? ns.key : null, now: nowId, nowApproved: !!nowId && !!L.northstarApprovedOutfits && L.northstarApprovedOutfits().has(nowId), overlayVisible: !!overlay && getComputedStyle(overlay).display !== "none", storageUnchanged: JSON.stringify({ ...localStorage }) === before, storage: { ...localStorage } };
document.body.dataset.done = "1";
</script></body></html>`;
}

const pages = {}, refs = {}, served = new Set(), server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]); if (pages[u]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[u]); }
  if (u.startsWith("/__ref/")) { const k = u.slice(7, -4); res.writeHead(200, { "content-type": "image/png" }); return res.end(refs[k]); }
  if (u.startsWith("/__main/")) { try { const b = mainFile(u.slice(8)); res.writeHead(200, { "content-type": TYPES[extname(u)] || "application/octet-stream" }); return res.end(b); } catch { res.writeHead(404); return res.end(); } }
  // the 33's layers: from the repository once published (D-355), else from the private staging (never copied into the repository)
  const f = u.split("/").pop(); if (u.startsWith("/assets/avatar-northstar/") && M.files.some((e) => e.file === f) && !existsSync(join(ROOT, "assets", "avatar-northstar", f))) { served.add(f); res.writeHead(200, { "content-type": "image/webp" }); return res.end(readFileSync(join(STAGED, f))); }
  const p = join(ROOT, u); if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
});

async function main() {
  const { chromium } = await import("@playwright/test");
  const L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  const tmp = join(tmpdir(), "d355b-" + process.pid); mkdirSync(tmp, { recursive: true }); const dec = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!dec[f]) { const o = join(tmp, "x.png"), dir = M.files.some((e) => e.file === f) && !existsSync(join(ROOT, "assets", "avatar-northstar", f)) ? STAGED : join(ROOT, "assets", "avatar-northstar"); execFileSync(DWEBP, ["-quiet", join(dir, f), "-o", o]); dec[f] = Uint8ClampedArray.from(decodePng(readFileSync(o)).px); } return dec[f]; };
  // [K, tee, trousers, shoe, top]: the three cuts; fabrics, patterns, motifs; every bottom; beige, SV1, AB-1, white, lace-up and brown shoes
  const FIG = [["K01", null, null, null, "TEE-FOREST-MELANGE"], ["K04", null, null, "SV1-V5-CHARCOAL", "TEE-BRETON-STRIPE"], ["K09", null, "TS-NAV", null, "TEE-MINT-TEAPOT"],
    ["K01", null, null, "AB1-BOOT-ORIGINAL", "LS2-BURGUNDY-PIQUE"], ["K17", null, null, null, "LS2-GREEN-CHECK"], ["K07", "TP-FOX-NAV", "TS-SND", null, "LS2-LIGHTDENIM-SHIELD"],
    ["K18", null, null, null, "TK-MUSTARD-SLUB"], ["K02", null, "TS-NAV", null, "TK-DENIM-TWILL"], ["K03", null, null, "SV1-V5-CHALK", "TK-SAND-FOX"]];
  const keyOf = ([k, t, p, sh, sw]) => [k, sw ? null : t, p, sh, sw].filter(Boolean).join("+");
  if (RUN("figure")) for (const f of FIG) { const o = L.northstarOutfitFor(...f); if (o.top !== L.NORTHSTAR_KIT_TOPS[f[4]].item) throw new Error(keyOf(f) + " is not an allowed case");
    refs[keyOf(f)] = encodePng(1024, 1536, L.northstarCompose(L.northstarPlanFor(o), pixelsOf, 1024 * 1536)); }
  rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const PORT = server.address().port;
  const browser = await chromium.launch(), result = { baseline: [], figure: [], choice: [], failure: [], preview: [], errors: [] };
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
    // D-357: with the flag on, a stored top of the 33 on an outfit where it is listed IS shown (part 2 checks it), so it is no baseline state
    const states = { "no opt-in": {},
      "opt-in, no outfit, top of the 33": { ...OPT, avatar_northstar_sweater: "LS2-GREEN-CHECK" }, "opt-in K04 (shorts) + sweater of the 33": { ...OPT, avatar_northstar_outfit: "K04", avatar_northstar_sweater: "LS2-MUSTARD-DOTS" },
      "opt-in K05 (shorts) + tank of the 33": { ...OPT, avatar_northstar_outfit: "K05", avatar_northstar_sweater: "TK-BLOCK-STRIPES" }, "opt-in K18 (olive) + tee of the 33": { ...OPT, avatar_northstar_outfit: "K18", avatar_northstar_sweater: "TEE-GREEN-CHECK" },
      "opt-in K01 + the planet": { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TEE-CHARCOAL-PLANET" }, "opt-in K01 (tee)": { ...OPT, avatar_northstar_outfit: "K01" },
      "opt-in K07 + print tee": { ...OPT, avatar_northstar_outfit: "K07", avatar_northstar_tee: "TP-FOX-NAV" }, "opt-in K01 + sweater": { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "LS2-HEATHER" },
      "opt-in K07 + AB1 + trousers + tank": { ...OPT, avatar_northstar_outfit: "K07", avatar_northstar_shoes: "AB1-BOOT-ORIGINAL", avatar_northstar_pants: "TS-NAV", avatar_northstar_sweater: "TK-NAVY-FOX" },
      "opt-in K17 (blue tee, olive)": { ...OPT, avatar_northstar_outfit: "K17" } };
    if (RUN("baseline")) for (const s of Object.keys(SURFACES)) for (const [st, storage] of Object.entries(states)) {
      const a = await open(s, { code: "pr", storage }), b = await open(s, { code: "main", storage });
      const ia = await shoot(a.p, s), ib = await shoot(b.p, s);
      result.baseline.push({ surface: s, state: st, path: a.info.path, mainPath: b.info.path, identicalToMain: same(ia, ib), layersEqualToMain: JSON.stringify(a.info.kids) === JSON.stringify(b.info.kids), storageUnchanged: a.info.storageUnchanged });
      await a.c.close(); await b.c.close(); }
    const sheets = {};
    if (RUN("figure")) for (const f of FIG) for (const s of Object.keys(SURFACES)) for (const width of [600, 360]) {
      const storage = { ...OPT, avatar_northstar_outfit: f[0], avatar_northstar_sweater: f[4], ...(f[3] ? { avatar_northstar_shoes: f[3] } : {}), ...(f[2] ? { avatar_northstar_pants: f[2] } : {}), ...(f[1] ? { avatar_northstar_tee: f[1] } : {}) };
      const o = await open(s, { code: "pr", storage }, { width });
      (sheets[`${s}-${width}`] ||= []).push(await shoot(o.p, s));
      if (width === 600) {
        const cmp = await o.p.evaluate(async ({ sel, key }) => {
          const fig = document.querySelector(sel + ' img[data-c2-layer="base"]'), ref = new Image(); ref.src = "/__ref/" + key + ".png"; await ref.decode();
          const c = document.createElement("canvas"); c.width = 1024; c.height = 1536; const x = c.getContext("2d"); const res = {};
          for (const [tone, bg] of [["light", "rgb(236,233,226)"], ["dark", "rgb(24,26,40)"]]) { x.fillStyle = bg; x.fillRect(0, 0, 1024, 1536); x.drawImage(fig, 0, 0); const a = x.getImageData(0, 0, 1024, 1536).data;
            x.fillRect(0, 0, 1024, 1536); x.drawImage(ref, 0, 0); const b = x.getImageData(0, 0, 1024, 1536).data; let max = 0, over2 = 0;
            for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); max = Math.max(max, d); if (d > 2) over2++; } res[tone] = { maxDiff: max, pxOver2: over2 }; }
          return { natural: [fig.naturalWidth, fig.naturalHeight], blob: fig.src.startsWith("blob:"), ...res }; }, { sel: SURFACES[s].sel, key: keyOf(f) });
        result.figure.push({ want: keyOf(f), surface: s, path: o.info.path, key: o.info.key, layers: o.info.kids.map((c) => c.marker), overlayVisible: o.info.overlayVisible, storageUnchanged: o.info.storageUnchanged, ...cmp }); }
      await o.c.close(); }
    for (const [name, imgs] of Object.entries(sheets)) { const g = grid(imgs, imgs.length, 16); writeFileSync(join(OUT, "sheet-" + name + ".png"), encodePng(g.w, g.h, g.px)); }
    if (RUN("choice")) { const o = await open("avatar", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K01" }, keep: true }, { width: 1100 });
      const snap = async (label) => { await o.p.waitForSelector("body[data-done='1']", { timeout: 60000 });
        const info = await o.p.evaluate(() => window.__done), cards = await o.p.$$eval(".northstar-wardrobe .item-card", (cs) => cs.map((c) => ({ piece: c.dataset.piece, on: c.classList.contains("equipped"), name: (c.querySelector(".item-name") || {}).textContent || "" })));
        result.choice.push({ did: label, path: info.path, now: info.now, nowApproved: info.nowApproved, cards: cards.length, topCards: cards.filter((c) => c.piece.startsWith("top-")).length, kitCards: cards.filter((c) => KIT.includes(c.piece)).length, worn: cards.filter((c) => c.on).map((c) => c.piece), unnamed: cards.filter((c) => !c.name).length }); };
      const put = async (piece) => { await Promise.all([o.p.waitForEvent("load"), o.p.click(`.northstar-wardrobe .item-card[data-piece="${piece}"] .equip-btn`)]); await snap("tag på " + piece); };
      const back = async () => { await Promise.all([o.p.waitForEvent("load"), o.p.getByRole("button", { name: "Brug min nuværende avatar", exact: true }).click()]); await snap("nuværende avatar"); };
      const reload = async () => { await Promise.all([o.p.waitForEvent("load"), o.p.reload()]); await snap("(reload)"); };
      await snap("(start K01)"); await put("top-tee-hip-sand-fox"); await reload(); await put("bottom-shorts-navy"); await put("top-sweater-ls2-green-check");
      await put("top-tank-navy"); await put("top-tank-breton-stripe"); await back(); await o.c.close(); }
    if (RUN("choice")) for (const file of ["top-tee-hip-sand-fox-sleeves-v1.webp", "top-sweater-ls2-green-check-top-body-v1.webp", "top-tank-shadow-body-v1.webp"]) {
      const sw = file.startsWith("top-tee") ? "TEE-SAND-FOX" : file.startsWith("top-sweater") ? "LS2-GREEN-CHECK" : "TK-BRETON-STRIPE";
      const o = await open("hub", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K07", avatar_northstar_sweater: sw } }, { block: file });
      result.failure.push({ blocked: file, path: o.info.path, figureMounted: o.info.kids.some((c) => c.src === "blob:"), storageUnchanged: o.info.storageUnchanged }); await o.c.close(); }
    if (RUN("choice")) for (const [name, width] of [["wardrobe-desktop", 1100], ["wardrobe-phone", 390]]) {
      const o = await open("avatar", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K01", avatar_northstar_sweater: "TEE-MINT-TEAPOT" } }, { width, dpr: 1 });
      await o.p.screenshot({ path: join(OUT, "preview-" + name + ".png"), fullPage: true });
      const scroll = await o.p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      result.preview.push({ name, key: o.info.key, horizontalScroll: scroll, tops: await o.p.$$eval(".northstar-wardrobe .item-card", (cs) => cs.filter((c) => c.dataset.piece.startsWith("top-")).map((c) => c.querySelector(".item-name").textContent)) }); await o.c.close(); }
  } finally { await browser.close(); server.close(); }
  const ch = result.choice, top = (c) => (c.now || "").split("+")[0], bottom = (c) => (c.now || "").split("+")[1];
  const all = { baseline: result.baseline.length === 33 && result.baseline.every((b) => b.identicalToMain && b.layersEqualToMain && b.path === b.mainPath && b.storageUnchanged),
    figure: result.figure.length === 9 * 3 && result.figure.every((f) => f.path === "northstar" && f.key === f.want && f.blob && f.natural[0] === 1024 && f.natural[1] === 1536 && f.light.maxDiff <= 3 && f.light.pxOver2 <= 5 && f.dark.maxDiff <= 3 && f.dark.pxOver2 <= 5 && !f.overlayVisible && f.storageUnchanged && f.layers.filter((m) => m === "base").length === 1),
    choice: ch.length === 8 && ch.every((c, i) => i === 7 || (c.path === "northstar" && c.nowApproved && c.topCards === 63 && c.kitCards === 33 && c.unnamed === 0))
      && top(ch[0]) === "top-tee-hip-cream" && top(ch[1]) === "top-tee-hip-sand-fox" && ch[2].now === ch[1].now
      && bottom(ch[3]) === "bottom-shorts-navy" && top(ch[3]) === "top-tee-hip-sand-fox"
      && top(ch[4]) === "top-sweater-ls2-green-check" && bottom(ch[4]) !== "bottom-shorts-navy"
      && top(ch[5]) === "top-tank-navy" && top(ch[6]) === "top-tank-breton-stripe" && ch[6].worn.includes("top-tank-breton-stripe")
      && ch[7].path === "r2" && ch[7].now === null,
    failure: result.failure.length === 3 && result.failure.every((f) => f.path === "r2" && !f.figureMounted && f.storageUnchanged),
    preview: result.preview.length === 2 && result.preview.every((p) => p.tops.length === 63 && !p.horizontalScroll),
    noPageErrors: result.errors.length === 0 };
  const parts = { baseline: ["baseline"], figure: ["figure"], choice: ["choice", "failure", "preview"] }, ok = Object.fromEntries(Object.entries(all).filter(([k]) => k === "noPageErrors" || !PART || parts[PART].includes(k)));
  writeFileSync(join(OUT, PART ? "result-" + PART + ".json" : "result.json"), JSON.stringify({ ok, servedFromStaging: [...served].sort(), ...result }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, baselinePages: result.baseline.length, figure: result.figure.map((f) => f.want + "/" + f.surface + ":" + f.light.maxDiff + "/" + f.dark.maxDiff), choice: ch.map((c) => c.did + "→" + (c.key || c.path)), errors: result.errors.slice(0, 5) }));
  if (!Object.values(ok).every(Boolean)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
