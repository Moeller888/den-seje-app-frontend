// 164Z — Build-only visual preview renderer (review aid, gitignored output).
// Composites the emitted front-only glasses SVG over body.svg at the live 160×240
// layer space and screenshots it, so the human review gate can SEE the result.
// Deterministic, local, no network. NOT part of promotion. Output is gitignored.
//   out: tools/avatar/build/promote/glasses-round-basic-v1-preview.png
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FE = join(REPO, "den-seje-app-frontend");
const bodySvg = readFileSync(join(FE, "assets", "avatar", "base", "body.svg"), "utf8");
const glassesSvg = readFileSync(join(HERE, "build", "promote", "glasses-round-basic-v1.svg"), "utf8");
const OUT = join(HERE, "build", "promote", "glasses-round-basic-v1-preview.png");

const SCALE = 4; // 160×240 → 640×960
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0}#stage{position:relative;width:${160 * SCALE}px;height:${240 * SCALE}px;background:#f4f4f6}
#stage > *{position:absolute;inset:0;width:100%;height:100%}
svg{width:100%;height:100%;display:block}</style></head>
<body><div id="stage">
  <div id="body">${bodySvg}</div>
  <div id="glasses">${glassesSvg}</div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 160 * SCALE, height: 240 * SCALE }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
mkdirSync(dirname(OUT), { recursive: true });
await page.locator("#stage").screenshot({ path: OUT });
await browser.close();
console.log(JSON.stringify({ section: "164Z render-glasses-preview", status: "OK", output: "tools/avatar/build/promote/glasses-round-basic-v1-preview.png", scale: SCALE }, null, 2));
